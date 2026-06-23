/**
 * StitchdAccountModel — data export & account deletion (batch 15, trust §2.5/§5.8).
 *
 * Full-account CSV export, and a deletion flow that emails a data takeout, opens a cancelable
 * grace window, then hard-purges all stitchd_* rows for the tenant. Deletion is BLOCKED while
 * a payout is in flight (batch 10). Tenant isolation (doc 01 §3): scoped by `tailorId`.
 */
import { GraphQLError } from 'graphql';
import { query, getClient } from '../../infrastructure/database/postgres.js';
import emailService from '../../services/email.service.js';
import logger from '../../core/logger/index.js';

const GRACE_DAYS = 7;

// Child→parent delete order so FK constraints are satisfied during a purge.
const PURGE_ORDER = [
  'stitchd_payout_items', 'stitchd_payment_events', 'stitchd_order_activity', 'stitchd_order_items',
  'stitchd_ai_messages', 'stitchd_ai_briefs', 'stitchd_ai_designs', 'stitchd_ai_usage',
  'stitchd_messages', 'stitchd_threads', 'stitchd_message_templates', 'stitchd_customer_tags',
  'stitchd_measurement_sets', 'stitchd_payments', 'stitchd_payouts', 'stitchd_payout_bank_accounts',
  'stitchd_billing_invoices', 'stitchd_payment_methods', 'stitchd_dunning_events',
  'stitchd_orders', 'stitchd_customers',
  'stitchd_analytics_events', 'stitchd_feedback', 'stitchd_data_exports', 'stitchd_tailor_profile',
];

const csvEsc = (v) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
function section(title, header, rows) {
  return [title, header, ...rows].join('\n');
}

const StitchdAccountModel = {
  GRACE_DAYS,

  /** Full-account CSV (customers, orders, payments). Records an export row. */
  async exportAllCsv(tailorId) {
    const [cust, orders, pays] = await Promise.all([
      query(`SELECT name, phone, email, address, dob, created_at FROM stitchd_customers WHERE tailor_id=$1 AND deleted_at IS NULL ORDER BY created_at`, [tailorId]),
      query(`SELECT o.order_number, c.name AS customer, o.status, o.total_price, o.deposit_paid, o.balance_owed, o.due_date, o.created_on
               FROM stitchd_orders o JOIN stitchd_customers c ON c.id=o.customer_id
              WHERE o.tailor_id=$1 AND o.deleted_at IS NULL ORDER BY o.order_number`, [tailorId]),
      query(`SELECT p.paid_on, c.name AS customer, p.type, p.method, p.amount, p.status, p.settlement_status
               FROM stitchd_payments p JOIN stitchd_customers c ON c.id=p.customer_id
              WHERE p.tailor_id=$1 ORDER BY p.paid_on`, [tailorId]),
    ]);
    const csv = [
      section('Customers', 'Name,Phone,Email,Address,DOB,Created',
        cust.rows.map((r) => [r.name, r.phone, r.email, r.address, r.dob ? String(r.dob).slice(0, 10) : '', r.created_at ? String(r.created_at).slice(0, 10) : ''].map(csvEsc).join(','))),
      '',
      section('Orders', 'Order,Customer,Status,Total,Deposit,Balance,Due,Created',
        orders.rows.map((r) => [`#${String(r.order_number).padStart(3, '0')}`, r.customer, r.status, r.total_price, r.deposit_paid, r.balance_owed, r.due_date || '', r.created_on ? String(r.created_on).slice(0, 10) : ''].map(csvEsc).join(','))),
      '',
      section('Payments', 'Date,Customer,Type,Method,Amount,Status,Settlement',
        pays.rows.map((r) => [r.paid_on ? String(r.paid_on).slice(0, 10) : '', r.customer, r.type, r.method, r.amount, r.status || '', r.settlement_status].map(csvEsc).join(','))),
    ].join('\n');

    await query(
      `INSERT INTO stitchd_data_exports (tailor_id, scope, format, status, completed_at)
       VALUES ($1,'full','csv','completed', now())`,
      [tailorId]
    );
    const stamp = new Date().toISOString().slice(0, 10);
    return { filename: `stitchd-data-${stamp}.csv`, mimeType: 'text/csv', csv };
  },

  /** True if a payout is in flight (blocks deletion until settled — batch 10). */
  async hasPendingPayout(tailorId) {
    const { rows } = await query(
      `SELECT 1 FROM stitchd_payouts WHERE tailor_id=$1 AND status IN ('pending','processing') LIMIT 1`,
      [tailorId]
    );
    return rows.length > 0;
  },

  async activeDeletion(tailorId) {
    const { rows } = await query(
      `SELECT * FROM stitchd_account_deletions WHERE tailor_id=$1 AND status IN ('requested','archived') ORDER BY requested_at DESC LIMIT 1`,
      [tailorId]
    );
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, status: r.status, requestedAt: r.requested_at, scheduledPurgeAt: r.scheduled_purge_at, archiveEmailedAt: r.archive_emailed_at || null };
  },

  /**
   * Request deletion: block if a payout is pending, email the data takeout (best-effort), and
   * open a cancelable grace window. Idempotent — returns the existing active request.
   */
  async requestDeletion(tailorId) {
    if (await this.hasPendingPayout(tailorId)) {
      throw new GraphQLError('You have a payout on the way. Please try again after it settles.', { extensions: { code: 'FAILED_PRECONDITION' } });
    }
    const existing = await this.activeDeletion(tailorId);
    if (existing) return existing;

    const purge = new Date(Date.now() + GRACE_DAYS * 86400000);
    const { rows } = await query(
      `INSERT INTO stitchd_account_deletions (tailor_id, status, scheduled_purge_at)
       VALUES ($1,'requested',$2) RETURNING *`,
      [tailorId, purge]
    );
    const row = rows[0];

    // Email the takeout (best-effort; only if the tailor has a real email).
    try {
      const { rows: tr } = await query('SELECT email FROM tailors WHERE id=$1', [tailorId]);
      const email = tr[0]?.email;
      if (email && email.includes('@')) {
        const { csv } = await this.exportAllCsv(tailorId);
        await emailService.sendEmail(
          email,
          'Your Stitchd data export',
          `<p>You requested to delete your Stitchd account. Your data is attached/below. Your account and all data will be permanently deleted on ${purge.toDateString()} unless you cancel from the app.</p><pre>${csv.slice(0, 4000)}</pre>`,
          `You requested to delete your Stitchd account. Your data export is below. Deletion is scheduled for ${purge.toDateString()} unless you cancel from the app.\n\n${csv}`
        );
        await query('UPDATE stitchd_account_deletions SET status=$2, archive_emailed_at=now() WHERE id=$1', [row.id, 'archived']);
        row.status = 'archived';
        row.archive_emailed_at = new Date();
      }
    } catch (e) {
      logger.error('[account] deletion takeout email failed:', e.message);
    }

    return { id: row.id, status: row.status, requestedAt: row.requested_at, scheduledPurgeAt: row.scheduled_purge_at, archiveEmailedAt: row.archive_emailed_at || null };
  },

  async cancelDeletion(tailorId) {
    await query(
      `UPDATE stitchd_account_deletions SET status='canceled', canceled_at=now()
        WHERE tailor_id=$1 AND status IN ('requested','archived')`,
      [tailorId]
    );
    return true;
  },

  /** Hard-purge all stitchd_* rows for the tenant (transactional, child→parent order). */
  async _purgeTenant(client, tailorId) {
    for (const table of PURGE_ORDER) {
      try {
        await client.query(`DELETE FROM ${table} WHERE tailor_id=$1`, [tailorId]);
      } catch (e) {
        logger.error(`[account] purge ${table} failed:`, e.message);
        throw e;
      }
    }
  },

  /**
   * Cron: purge accounts past their grace window. Re-checks the pending-payout block per
   * tenant and skips (leaves scheduled) if a payout is now in flight. Idempotent.
   */
  async purgeDue(now = new Date()) {
    const { rows } = await query(
      `SELECT id, tailor_id FROM stitchd_account_deletions
        WHERE status IN ('requested','archived') AND scheduled_purge_at <= $1`,
      [now]
    );
    const results = [];
    for (const d of rows) {
      if (await this.hasPendingPayout(d.tailor_id)) { results.push({ tailorId: d.tailor_id, skipped: 'pending_payout' }); continue; }
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await this._purgeTenant(client, d.tailor_id);
        await client.query(`UPDATE stitchd_account_deletions SET status='purged', purged_at=now() WHERE id=$1`, [d.id]);
        await client.query('COMMIT');
        results.push({ tailorId: d.tailor_id, purged: true });
        logger.info('[account] tenant purged', { tailorId: d.tailor_id });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        results.push({ tailorId: d.tailor_id, error: e.message });
      } finally {
        client.release();
      }
    }
    return results;
  },
};

export default StitchdAccountModel;
