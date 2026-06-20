/**
 * StitchdDashboardModel — Home dashboard aggregates (batch 07, spec §7.2).
 *
 * The first screen the tailor opens every morning: due-this-week count, outstanding total,
 * this-week paid/pending, a monthly revenue trend, and a recent-activity feed across
 * orders/payments/customers.
 *
 * PARITY: this-week paid/pending and the monthly trend reuse the EXACT week boundary and
 * SQL definitions from batch-05 `StitchdPaymentModel.moneyDashboard` (via `weekStartOf` and
 * the same WHERE clauses) so Home and the Money screen never drift (plan risk: dashboard
 * parity).
 *
 * Tenant isolation (doc 01 §3): every method takes `tailorId` first and scopes by it.
 */
import { query } from '../../infrastructure/database/postgres.js';
import StitchdPaymentModel from './stitchdPayment.model.js';

const num = (v) => (v == null ? 0 : Number(v));

const StitchdDashboardModel = {
  /**
   * One round-trip-batched read for the Home dashboard. `weekStart` (optional ISO date)
   * mirrors the Money dashboard so both screens can be asked for the same week.
   */
  async homeDashboard(tailorId, weekStartInput = null) {
    const weekStart = weekStartInput ? new Date(weekStartInput) : StitchdPaymentModel.weekStartOf();
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const weekStartDate = weekStart.toISOString().slice(0, 10);
    const weekEndDate = weekEnd.toISOString().slice(0, 10);

    const [dueRes, outstandingRes, paidRes, pendingRes, trendRes, activityRes] = await Promise.all([
      // Orders due inside this week that are still open.
      query(
        `SELECT COUNT(*)::int AS n FROM stitchd_orders
          WHERE tailor_id=$1 AND deleted_at IS NULL AND due_date >= $2::date AND due_date < $3::date
            AND status NOT IN ('Delivered','Closed')`,
        [tailorId, weekStartDate, weekEndDate]
      ),
      // Everyone who owes, across all open orders (same definition as Money).
      query(
        `SELECT COALESCE(SUM(balance_owed),0) AS total,
                COUNT(DISTINCT customer_id) FILTER (WHERE balance_owed > 0) AS customers
           FROM stitchd_orders WHERE tailor_id=$1 AND balance_owed > 0 AND deleted_at IS NULL`,
        [tailorId]
      ),
      // This-week paid — identical clause to StitchdPaymentModel.moneyDashboard.
      query(
        `SELECT COALESCE(SUM(amount),0) AS v FROM stitchd_payments
          WHERE tailor_id=$1 AND paid_on >= $2 AND paid_on < $3`,
        [tailorId, weekStart, weekEnd]
      ),
      // This-week pending — identical clause to moneyDashboard.
      query(
        `SELECT COALESCE(SUM(balance_owed),0) AS v FROM stitchd_orders
          WHERE tailor_id=$1 AND deleted_at IS NULL AND due_date >= $2::date AND due_date < $3::date
            AND status NOT IN ('Closed')`,
        [tailorId, weekStartDate, weekEndDate]
      ),
      // Monthly revenue trend — identical clause to moneyDashboard.
      query(
        `SELECT to_char(date_trunc('month', paid_on), 'YYYY-MM') AS month, COALESCE(SUM(amount),0) AS paid
           FROM stitchd_payments
          WHERE tailor_id=$1 AND paid_on >= (now() - INTERVAL '6 months')
          GROUP BY 1 ORDER BY 1`,
        [tailorId]
      ),
      // Recent activity union (orders / payments / customers), newest-first, last 5.
      query(
        `(
           SELECT 'order'::text AS kind, o.id::text AS id, o.customer_id::text AS customer_id,
                  o.id::text AS order_id, c.name AS label, o.order_number::text AS ref,
                  NULL::numeric AS amount, o.created_at AS ts
             FROM stitchd_orders o JOIN stitchd_customers c ON c.id = o.customer_id
            WHERE o.tailor_id=$1 AND o.deleted_at IS NULL
         )
         UNION ALL
         (
           SELECT 'payment'::text, p.id::text, p.customer_id::text, p.order_id::text,
                  c.name, NULL::text, p.amount, COALESCE(p.paid_on, p.created_at)
             FROM stitchd_payments p JOIN stitchd_customers c ON c.id = p.customer_id
            WHERE p.tailor_id=$1
         )
         UNION ALL
         (
           SELECT 'customer'::text, cu.id::text, cu.id::text, NULL::text,
                  cu.name, NULL::text, NULL::numeric, cu.created_at
             FROM stitchd_customers cu
            WHERE cu.tailor_id=$1
         )
         ORDER BY ts DESC
         LIMIT 5`,
        [tailorId]
      ),
    ]);

    return {
      weekStart: weekStartDate,
      dueThisWeekCount: dueRes.rows[0]?.n || 0,
      outstandingTotal: num(outstandingRes.rows[0]?.total),
      outstandingCustomerCount: Number(outstandingRes.rows[0]?.customers) || 0,
      thisWeekPaid: num(paidRes.rows[0]?.v),
      thisWeekPending: num(pendingRes.rows[0]?.v),
      monthlyTrend: trendRes.rows.map((r) => ({ month: r.month, paid: num(r.paid) })),
      recentActivity: activityRes.rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        label: r.label,
        ref: r.ref || null,
        amount: r.amount == null ? null : num(r.amount),
        customerId: r.customer_id || null,
        orderId: r.order_id || null,
        ts: r.ts,
      })),
    };
  },
};

export default StitchdDashboardModel;
