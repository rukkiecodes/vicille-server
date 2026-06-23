/**
 * StitchdAnalyticsModel — business insights for the tailor (batch 14).
 *
 * Live per-tenant aggregate queries (no materialized views — small per-tailor data, always
 * fresh). "Revenue" = gross COLLECTED money: cash payments + successful in-app collections
 * (same definition as the Money dashboard), by `paid_on`. Garment sales come from order
 * items (order value). Tenant isolation (doc 01 §3): every method takes `tailorId` first.
 */
import { query } from '../../infrastructure/database/postgres.js';

const num = (v) => (v == null ? 0 : Number(v));

// Collected money only: cash rows (status NULL) or in-app rows marked success.
const COLLECTED = `(status IS NULL OR status = 'success')`;

/** 'YYYY-MM' for `d` (UTC). */
function ym(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

const StitchdAnalyticsModel = {
  /** Monthly collected revenue for the last `months` (gap-filled, oldest→newest). */
  async monthlyRevenue(tailorId, months = 6) {
    const n = Math.min(24, Math.max(1, Number(months) || 6));
    const { rows } = await query(
      `SELECT to_char(date_trunc('month', paid_on), 'YYYY-MM') AS month,
              COALESCE(SUM(amount),0) AS gross, COUNT(*) AS cnt
         FROM stitchd_payments
        WHERE tailor_id=$1 AND ${COLLECTED}
          AND paid_on >= date_trunc('month', now()) - ($2::int - 1) * INTERVAL '1 month'
        GROUP BY 1`,
      [tailorId, n]
    );
    const map = new Map(rows.map((r) => [r.month, { gross: num(r.gross), count: Number(r.cnt) || 0 }]));
    const series = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const key = ym(d);
      const hit = map.get(key);
      series.push({ month: key, gross: hit?.gross || 0, count: hit?.count || 0 });
    }
    return series;
  },

  /** Top customers by collected spend. */
  async topCustomers(tailorId, limit = 10) {
    const lim = Math.min(50, Math.max(1, Number(limit) || 10));
    const { rows } = await query(
      `SELECT c.id AS customer_id, c.name, c.profile_photo,
              COALESCE(SUM(p.amount),0) AS total_spend,
              COUNT(DISTINCT p.order_id) FILTER (WHERE p.order_id IS NOT NULL) AS order_count
         FROM stitchd_payments p
         JOIN stitchd_customers c ON c.id = p.customer_id
        WHERE p.tailor_id=$1 AND ${'(p.status IS NULL OR p.status = \'success\')'}
        GROUP BY c.id, c.name, c.profile_photo
        HAVING SUM(p.amount) > 0
        ORDER BY total_spend DESC
        LIMIT $2`,
      [tailorId, lim]
    );
    return rows.map((r) => ({
      customerId: r.customer_id, name: r.name, profilePhoto: r.profile_photo || null,
      totalSpend: num(r.total_spend), orderCount: Number(r.order_count) || 0,
    }));
  },

  /** Best-selling garment types by order-item revenue (non-deleted orders). */
  async bestSellingGarments(tailorId, limit = 8) {
    const lim = Math.min(20, Math.max(1, Number(limit) || 8));
    const { rows } = await query(
      `SELECT COALESCE(NULLIF(TRIM(i.garment_type), ''), 'Other') AS garment_type,
              COALESCE(SUM(i.quantity * i.unit_price),0) AS revenue,
              COALESCE(SUM(i.quantity),0) AS qty
         FROM stitchd_order_items i
         JOIN stitchd_orders o ON o.id = i.order_id AND o.deleted_at IS NULL
        WHERE i.tailor_id=$1
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT $2`,
      [tailorId, lim]
    );
    return rows.map((r) => ({ garmentType: r.garment_type, revenue: num(r.revenue), qty: Number(r.qty) || 0 }));
  },

  /** Customers with at least one order but none in `days`+ days. */
  async dormantCustomers(tailorId, days = 90) {
    const d = Math.min(365, Math.max(1, Number(days) || 90));
    const { rows } = await query(
      `SELECT c.id, c.name, c.phone, c.profile_photo,
              MAX(o.created_on) AS last_order
         FROM stitchd_customers c
         JOIN stitchd_orders o ON o.customer_id = c.id AND o.tailor_id = c.tailor_id AND o.deleted_at IS NULL
        WHERE c.tailor_id=$1
        GROUP BY c.id, c.name, c.phone, c.profile_photo
        HAVING MAX(o.created_on) < now() - ($2::int * INTERVAL '1 day')
        ORDER BY last_order ASC`,
      [tailorId, d]
    );
    return rows.map((r) => {
      const last = r.last_order ? new Date(r.last_order) : null;
      const daysSince = last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null;
      return { id: r.id, name: r.name, phone: r.phone || null, profilePhoto: r.profile_photo || null, lastOrderDate: r.last_order || null, daysSince };
    });
  },

  /** Build a CSV export of the analytics summary for the tailor. */
  async exportCsv(tailorId) {
    const [revenue, customers, garments, dormant] = await Promise.all([
      this.monthlyRevenue(tailorId, 12),
      this.topCustomers(tailorId, 10),
      this.bestSellingGarments(tailorId, 20),
      this.dormantCustomers(tailorId, 90),
    ]);
    const esc = (v) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [];
    lines.push('Monthly revenue');
    lines.push('Month,Gross (NGN),Payments');
    revenue.forEach((r) => lines.push([r.month, r.gross, r.count].map(esc).join(',')));
    lines.push('');
    lines.push('Top customers by spend');
    lines.push('Customer,Total spend (NGN),Orders');
    customers.forEach((c) => lines.push([c.name, c.totalSpend, c.orderCount].map(esc).join(',')));
    lines.push('');
    lines.push('Best-selling garments');
    lines.push('Garment,Revenue (NGN),Quantity');
    garments.forEach((g) => lines.push([g.garmentType, g.revenue, g.qty].map(esc).join(',')));
    lines.push('');
    lines.push('Dormant customers (90+ days)');
    lines.push('Customer,Phone,Last order,Days since');
    dormant.forEach((d) => lines.push([d.name, d.phone, d.lastOrderDate ? String(d.lastOrderDate).slice(0, 10) : '', d.daysSince].map(esc).join(',')));
    return lines.join('\n');
  },
};

export default StitchdAnalyticsModel;
