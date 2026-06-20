/**
 * StitchdPaymentModel — tenant-scoped payments + money aggregates (batch 05).
 *
 * P1 records cash only. Payments are the single source of truth for money received; the
 * DB trigger (migration 049) recomputes each order's deposit_paid / balance_owed, so this
 * model never has to touch order balances directly.
 *
 * Tenant isolation (doc 01 §3): every method takes `tailorId` first and scopes by it;
 * customer + order ownership is validated on write.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import StitchdOrderModel from './stitchdOrder.model.js';

const num = (v) => (v == null ? 0 : Number(v));

function format(row) {
  if (!row) return null;
  return {
    id:               row.id,
    clientUuid:       row.client_uuid,
    customerId:       row.customer_id,
    customerName:     row.customer_name ?? null,
    orderId:          row.order_id || null,
    type:             row.type,
    amount:           num(row.amount),
    currency:         row.currency,
    paidOn:           row.paid_on,
    method:           row.method,
    reference:        row.reference || null,
    settlementStatus: row.settlement_status,
    note:             row.note || null,
    createdAt:        row.created_at,
  };
}

/** Monday 00:00 UTC of the week containing `d` (default: now). */
function weekStartOf(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (date.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dow);
  return date;
}

const StitchdPaymentModel = {
  format,
  weekStartOf,

  async customerBelongsToTailor(tailorId, customerId) {
    const { rows } = await query('SELECT 1 FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
    return rows.length > 0;
  },

  async orderBelongsToTailor(tailorId, orderId) {
    const { rows } = await query('SELECT 1 FROM stitchd_orders WHERE id=$1 AND tailor_id=$2', [orderId, tailorId]);
    return rows.length > 0;
  },

  /**
   * Record a cash payment. Idempotent on (tailorId, clientUuid): a replayed offline write
   * returns the existing row. Returns { payment, order } — order reflects the trigger's
   * recomputed balance (null for a standalone payment).
   */
  async recordCash(tailorId, input = {}) {
    if (!input.clientUuid) throw new GraphQLError('Missing payment id.', { extensions: { code: 'BAD_USER_INPUT' } });
    const amount = Number(input.amount);
    if (!(amount > 0)) throw new GraphQLError('Enter an amount greater than zero.', { extensions: { code: 'BAD_USER_INPUT' } });
    if (!(await this.customerBelongsToTailor(tailorId, input.customerId))) {
      throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    }
    if (input.orderId && !(await this.orderBelongsToTailor(tailorId, input.orderId))) {
      throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });
    }

    const { rows } = await query(
      `INSERT INTO stitchd_payments
         (client_uuid, tailor_id, customer_id, order_id, type, amount, currency, paid_on, method, note)
       VALUES ($1,$2,$3,$4,'cash_recorded',$5,$6, COALESCE($7, now()), 'cash', $8)
       ON CONFLICT (tailor_id, client_uuid) DO NOTHING
       RETURNING *`,
      [
        input.clientUuid, tailorId, input.customerId, input.orderId || null,
        amount, input.currency || 'NGN', input.paidOn || null, input.note || null,
      ]
    );

    let paymentRow = rows[0];
    if (!paymentRow) {
      // Idempotent replay — return the existing payment.
      const existing = await query(
        'SELECT * FROM stitchd_payments WHERE tailor_id=$1 AND client_uuid=$2',
        [tailorId, input.clientUuid]
      );
      paymentRow = existing.rows[0];
    }

    const order = input.orderId ? await StitchdOrderModel.findById(tailorId, input.orderId) : null;
    return { payment: format(paymentRow), order };
  },

  /** Payment history for one customer, newest first. */
  async byCustomer(tailorId, customerId) {
    const { rows } = await query(
      `SELECT p.*, c.name AS customer_name
         FROM stitchd_payments p JOIN stitchd_customers c ON c.id = p.customer_id
        WHERE p.tailor_id=$1 AND p.customer_id=$2
        ORDER BY p.paid_on DESC`,
      [tailorId, customerId]
    );
    return rows.map(format);
  },

  /** Customers who owe, aggregated across their orders. sort = 'AMOUNT' | 'AGE'. */
  async outstandingBalances(tailorId, sort = 'AMOUNT') {
    const orderBy = sort === 'AGE' ? 'oldest_unpaid ASC' : 'total_owed DESC';
    const { rows } = await query(
      `SELECT c.id AS customer_id, c.name, c.phone, c.profile_photo,
              SUM(o.balance_owed) AS total_owed,
              MIN(o.created_on)  AS oldest_unpaid,
              COUNT(*)           AS open_count
         FROM stitchd_orders o JOIN stitchd_customers c ON c.id = o.customer_id
        WHERE o.tailor_id=$1 AND o.balance_owed > 0 AND o.deleted_at IS NULL
        GROUP BY c.id, c.name, c.phone, c.profile_photo
        ORDER BY ${orderBy}`,
      [tailorId]
    );
    return rows.map((r) => ({
      customerId:           r.customer_id,
      name:                 r.name,
      phone:                r.phone || null,
      profilePhoto:         r.profile_photo || null,
      totalOwed:            num(r.total_owed),
      oldestUnpaidOrderDate: r.oldest_unpaid || null,
      openOrderCount:       Number(r.open_count) || 0,
    }));
  },

  /** Aggregates for the Money Dashboard (this-week paid/pending, outstanding, trend, recent). */
  async moneyDashboard(tailorId, weekStartInput = null) {
    const weekStart = weekStartInput ? new Date(weekStartInput) : weekStartOf();
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

    const [paidRes, pendingRes, outstandingRes, trendRes, recentRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(amount),0) AS v FROM stitchd_payments
          WHERE tailor_id=$1 AND paid_on >= $2 AND paid_on < $3`,
        [tailorId, weekStart, weekEnd]
      ),
      query(
        `SELECT COALESCE(SUM(balance_owed),0) AS v FROM stitchd_orders
          WHERE tailor_id=$1 AND deleted_at IS NULL AND due_date >= $2::date AND due_date < $3::date
            AND status NOT IN ('Closed')`,
        [tailorId, weekStart.toISOString().slice(0, 10), weekEnd.toISOString().slice(0, 10)]
      ),
      query(
        `SELECT COALESCE(SUM(balance_owed),0) AS total,
                COUNT(DISTINCT customer_id) FILTER (WHERE balance_owed > 0) AS customers
           FROM stitchd_orders WHERE tailor_id=$1 AND balance_owed > 0 AND deleted_at IS NULL`,
        [tailorId]
      ),
      query(
        `SELECT to_char(date_trunc('month', paid_on), 'YYYY-MM') AS month, COALESCE(SUM(amount),0) AS paid
           FROM stitchd_payments
          WHERE tailor_id=$1 AND paid_on >= (now() - INTERVAL '6 months')
          GROUP BY 1 ORDER BY 1`,
        [tailorId]
      ),
      query(
        `SELECT p.*, c.name AS customer_name
           FROM stitchd_payments p JOIN stitchd_customers c ON c.id = p.customer_id
          WHERE p.tailor_id=$1 ORDER BY p.paid_on DESC LIMIT 10`,
        [tailorId]
      ),
    ]);

    return {
      weekStart: weekStart.toISOString().slice(0, 10),
      thisWeekPaid: num(paidRes.rows[0]?.v),
      thisWeekPending: num(pendingRes.rows[0]?.v),
      outstandingTotal: num(outstandingRes.rows[0]?.total),
      outstandingCustomerCount: Number(outstandingRes.rows[0]?.customers) || 0,
      monthlyTrend: trendRes.rows.map((r) => ({ month: r.month, paid: num(r.paid) })),
      recentTransactions: recentRes.rows.map(format),
    };
  },
};

export default StitchdPaymentModel;
