/**
 * StitchdInvoiceModel — B2B/corporate customer invoices (tailor → their customer) + tax export
 * (batch 21). Invoices carry the tenant currency (batch-21 multi-currency). The tax export is a
 * REPORT (not a ledger, per spec §13) generated in-Node as CSV over a period.
 *
 * PDF generation is deferred (records ship; reuse the batch-05/17 renderer later) — consistent
 * with the enterprise invoices in batch 17.
 *
 * Tenant isolation (doc 01 §3): every method scopes by `tailorId`.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';

const money = (v) => Math.round((Number(v) || 0) * 100) / 100;

async function tenantCurrency(tailorId) {
  const p = await StitchdTailorProfileModel.findByTailorId(tailorId);
  return p?.currency || 'NGN';
}

function computeTotals(items, taxRate) {
  const subtotal = (items || []).reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
  const tax = subtotal * (Number(taxRate) || 0);
  return { subtotal: money(subtotal), taxAmount: money(tax), total: money(subtotal + tax) };
}

const StitchdInvoiceModel = {
  format(r) {
    return {
      id: r.id, customerId: r.customer_id || null, number: r.number, items: r.items || [],
      subtotal: money(r.subtotal), taxRate: Number(r.tax_rate), taxAmount: money(r.tax_amount),
      total: money(r.total), currency: r.currency, status: r.status, notes: r.notes || null,
      issuedAt: r.issued_at || null, dueAt: r.due_at || null, paidAt: r.paid_at || null,
      pdfUrl: r.pdf_url || null, createdAt: r.created_at,
    };
  },

  async list(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_customer_invoices WHERE tailor_id=$1 ORDER BY created_at DESC', [tailorId]);
    return rows.map((r) => this.format(r));
  },

  async _nextNumber(tailorId) {
    const { rows } = await query('SELECT COUNT(*)::int n FROM stitchd_customer_invoices WHERE tailor_id=$1', [tailorId]);
    return `INV-${String((rows[0]?.n || 0) + 1).padStart(4, '0')}`;
  },

  async create(tailorId, { customerId, items, taxRate, notes, dueAt }) {
    const totals = computeTotals(items, taxRate);
    const currency = await tenantCurrency(tailorId);
    const number = await this._nextNumber(tailorId);
    const { rows } = await query(
      `INSERT INTO stitchd_customer_invoices (tailor_id, customer_id, number, items, subtotal, tax_rate, tax_amount, total, currency, status, notes, due_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,'draft',$10,$11) RETURNING *`,
      [tailorId, customerId || null, number, JSON.stringify(items || []), totals.subtotal, Number(taxRate) || 0, totals.taxAmount, totals.total, currency, notes || null, dueAt || null]
    );
    return this.format(rows[0]);
  },

  async issue(tailorId, id) {
    // PDF deferred — record only (pdf_url stays null until the renderer lands).
    const { rows } = await query(
      `UPDATE stitchd_customer_invoices SET status='issued', issued_at=COALESCE(issued_at, now())
        WHERE tailor_id=$1 AND id=$2 AND status='draft' RETURNING *`,
      [tailorId, id]
    );
    if (!rows[0]) throw new GraphQLError('Invoice not found or already issued.', { extensions: { code: 'FAILED_PRECONDITION' } });
    return this.format(rows[0]);
  },

  async setStatus(tailorId, id, status) {
    const paidAt = status === 'paid' ? 'now()' : 'paid_at';
    const { rows } = await query(
      `UPDATE stitchd_customer_invoices SET status=$3, paid_at=${paidAt} WHERE tailor_id=$1 AND id=$2 RETURNING *`,
      [tailorId, id, status]
    );
    if (!rows[0]) throw new GraphQLError('Invoice not found.', { extensions: { code: 'NOT_FOUND' } });
    return this.format(rows[0]);
  },

  // ── Tax / VAT reporting export (CSV, in-Node) ─────────────────────────────────
  /** A VAT/tax report over [from, to]: collected payments + issued invoices with tax totals. */
  async taxExportCsv(tailorId, { from, to }) {
    const currency = await tenantCurrency(tailorId);
    const f = from || '1970-01-01';
    const t = to || '2999-12-31';
    const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

    const payments = await query(
      `SELECT created_at::date AS d, amount, currency, channel FROM stitchd_payments
        WHERE tailor_id=$1 AND (status IS NULL OR status='success') AND created_at::date BETWEEN $2 AND $3
        ORDER BY created_at ASC`,
      [tailorId, f, t]
    );
    const invoices = await query(
      `SELECT number, issued_at::date AS d, subtotal, tax_rate, tax_amount, total, currency, status
         FROM stitchd_customer_invoices WHERE tailor_id=$1 AND status IN ('issued','paid')
           AND COALESCE(issued_at::date, created_at::date) BETWEEN $2 AND $3 ORDER BY created_at ASC`,
      [tailorId, f, t]
    );

    const lines = [];
    lines.push(`Tax report,${esc(`${f} to ${t}`)},Currency,${currency}`);
    lines.push('');
    lines.push('PAYMENTS RECEIVED');
    lines.push('Date,Amount,Currency,Channel');
    let totalReceived = 0;
    for (const p of payments.rows) { totalReceived += Number(p.amount) || 0; lines.push([p.d, p.amount, p.currency, p.channel].map(esc).join(',')); }
    lines.push(`Total received,${money(totalReceived)},${currency},`);
    lines.push('');
    lines.push('INVOICES (issued/paid)');
    lines.push('Number,Date,Subtotal,Tax rate,Tax amount,Total,Currency,Status');
    let totalTax = 0;
    for (const i of invoices.rows) { totalTax += Number(i.tax_amount) || 0; lines.push([i.number, i.d, i.subtotal, i.tax_rate, i.tax_amount, i.total, i.currency, i.status].map(esc).join(',')); }
    lines.push(`Total tax,,,${''},${money(totalTax)},,${currency},`);

    return { filename: `tax-report-${f}_${t}.csv`, mimeType: 'text/csv', csv: lines.join('\n') };
  },
};

export default StitchdInvoiceModel;
