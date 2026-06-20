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
import crypto from 'crypto';
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import StitchdOrderModel from './stitchdOrder.model.js';
import paymentsService from '../../services/paymentsService.js';
import logger from '../../core/logger/index.js';

const num = (v) => (v == null ? 0 : Number(v));

/** Platform transaction fee in basis points (config; 1.5–2.5% per spec). Default 2.0%. */
const FEE_BPS = (() => {
  const v = parseInt(process.env.STITCHD_FEE_BPS || '200', 10);
  return Number.isFinite(v) && v >= 0 ? v : 200;
})();

/** A gateway charge reference unique to this collection. */
function newReference() {
  return `STC-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

const CHANNELS = new Set(['card', 'transfer', 'ussd']);

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
    // Digital-collection fields (batch 09) — null/0 for cash rows.
    status:           row.status || null,
    provider:         row.provider || null,
    channel:          row.channel || null,
    authUrl:          row.auth_url || null,
    ussdCode:         row.ussd_code || null,
    feeAmount:        num(row.fee_amount),
    netAmount:        row.net_amount == null ? null : num(row.net_amount),
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

  // ── Digital collection (batch 09) ────────────────────────────────────────────

  FEE_BPS,

  /** Customer email (or a synthesized placeholder Paystack accepts) + name. */
  async customerContact(tailorId, customerId) {
    const { rows } = await query(
      'SELECT name, email FROM stitchd_customers WHERE id=$1 AND tailor_id=$2',
      [customerId, tailorId]
    );
    const c = rows[0];
    if (!c) return null;
    const email = (c.email && c.email.includes('@')) ? c.email : `customer-${customerId}@stitchd.ng`;
    return { name: c.name, email };
  },

  async writeEvent(paymentId, tailorId, kind, payload = {}) {
    await query(
      `INSERT INTO stitchd_payment_events (payment_id, tailor_id, kind, payload)
       VALUES ($1,$2,$3,$4::jsonb)`,
      [paymentId, tailorId, kind, JSON.stringify(payload || {})]
    );
  },

  /**
   * Initiate a digital collection. Idempotent on (tailorId, clientUuid): a replayed init
   * returns the existing intent instead of charging twice. Creates a `status='initiated'`
   * row (NOT counted toward the balance until the webhook marks it 'success'), calls the
   * payments service for a hosted-page URL, and records the provider reference.
   * Returns { paymentId, authUrl, ussdCode, reference, status }.
   */
  async initiateCollection(tailorId, input = {}) {
    if (!input.clientUuid) throw new GraphQLError('Missing payment id.', { extensions: { code: 'BAD_USER_INPUT' } });
    const amount = Number(input.amount);
    if (!(amount > 0)) throw new GraphQLError('Enter an amount greater than zero.', { extensions: { code: 'BAD_USER_INPUT' } });
    const channel = CHANNELS.has(input.channel) ? input.channel : 'card';

    const contact = await this.customerContact(tailorId, input.customerId);
    if (!contact) throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    if (input.orderId && !(await this.orderBelongsToTailor(tailorId, input.orderId))) {
      throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });
    }

    // Idempotent re-init: return the existing intent.
    const existing = await query(
      'SELECT * FROM stitchd_payments WHERE tailor_id=$1 AND client_uuid=$2',
      [tailorId, input.clientUuid]
    );
    if (existing.rows[0]) {
      const r = existing.rows[0];
      return { paymentId: r.id, authUrl: r.auth_url, ussdCode: r.ussd_code, reference: r.provider_reference || r.reference, status: r.status };
    }

    const reference = newReference();
    const { rows } = await query(
      `INSERT INTO stitchd_payments
         (client_uuid, tailor_id, customer_id, order_id, type, amount, currency, method,
          channel, status, provider, fee_bps, idempotency_key, reference)
       VALUES ($1,$2,$3,$4,'in_app_collected',$5,$6,$7,$7,'initiated','paystack',$8,$1,$9)
       ON CONFLICT (tailor_id, client_uuid) DO NOTHING
       RETURNING *`,
      [input.clientUuid, tailorId, input.customerId, input.orderId || null, amount,
       input.currency || 'NGN', channel, FEE_BPS, reference]
    );
    let row = rows[0];
    if (!row) {
      const again = await query('SELECT * FROM stitchd_payments WHERE tailor_id=$1 AND client_uuid=$2', [tailorId, input.clientUuid]);
      row = again.rows[0];
      return { paymentId: row.id, authUrl: row.auth_url, ussdCode: row.ussd_code, reference: row.provider_reference || row.reference, status: row.status };
    }

    await this.writeEvent(row.id, tailorId, 'initiated', { channel, amount, reference });

    // Call the payments service for the hosted page. On failure, mark the row failed.
    try {
      const resp = await paymentsService.initiateStitchdCollection({
        email: contact.email,
        amountKobo: Math.round(amount * 100),
        channel,
        reference,
        metadata: {
          purpose: 'stitchd_collection',
          paymentId: row.id,
          tailorId,
          orderId: input.orderId || null,
          customerId: input.customerId,
          feeBps: FEE_BPS,
        },
      });
      await query(
        `UPDATE stitchd_payments
            SET provider_reference=$1, auth_url=$2, ussd_code=$3, status='pending', updated_at=now()
          WHERE id=$4`,
        [resp.reference || reference, resp.authorizationUrl || null, resp.ussdCode || null, row.id]
      );
      return { paymentId: row.id, authUrl: resp.authorizationUrl || null, ussdCode: resp.ussdCode || null, reference: resp.reference || reference, status: 'pending' };
    } catch (e) {
      logger.error('initiateCollection payments-service error:', e.message);
      await query(`UPDATE stitchd_payments SET status='failed', last_error=$1, updated_at=now() WHERE id=$2`, [String(e.message).slice(0, 300), row.id]);
      await this.writeEvent(row.id, tailorId, 'failed', { stage: 'initiate', error: String(e.message).slice(0, 300) });
      throw new GraphQLError('Could not start the payment. Please try again.', { extensions: { code: 'BAD_GATEWAY' } });
    }
  },

  /** Poll status for a collection the tailor owns, by our reference / provider reference / id. */
  async collectionStatus(tailorId, ref) {
    const { rows } = await query(
      `SELECT * FROM stitchd_payments
        WHERE tailor_id=$1 AND (reference=$2 OR provider_reference=$2 OR id::text=$2)
        ORDER BY created_at DESC LIMIT 1`,
      [tailorId, ref]
    );
    return rows[0] ? format(rows[0]) : null;
  },

  /**
   * Mark a collection successful (called from the internal webhook route, scoped by the
   * row's own tailor_id — NOT requireTailor). Idempotent on provider_reference: a replayed
   * webhook returns the already-success row without double-counting. Computes fee/net, flags
   * pending_payout, sets paid_on; the balance trigger then recomputes the order.
   */
  async recordCollectionSuccess({ providerReference, channel = null, paidAt = null }) {
    if (!providerReference) return null;
    const { rows } = await query('SELECT * FROM stitchd_payments WHERE provider_reference=$1', [providerReference]);
    const row = rows[0];
    if (!row) return null;
    if (row.status === 'success') return format(row); // idempotent replay

    const amount = num(row.amount);
    const feeBps = Number(row.fee_bps) || 0;
    const feeAmount = Math.round(amount * feeBps) / 10000;
    const netAmount = Math.max(0, amount - feeAmount);

    const { rows: upd } = await query(
      `UPDATE stitchd_payments
          SET status='success', settlement_status='pending_payout',
              fee_amount=$1, net_amount=$2, channel=COALESCE($3, channel),
              paid_on=COALESCE($4, now()), updated_at=now()
        WHERE id=$5
        RETURNING *`,
      [feeAmount, netAmount, channel, paidAt, row.id]
    );
    await this.writeEvent(row.id, row.tailor_id, 'success', { providerReference, feeAmount, netAmount });
    return format(upd[0]);
  },

  /** Mark a collection failed/abandoned (internal webhook route). No-op if already success. */
  async recordCollectionFailure({ providerReference, reason = null, kind = 'failed' }) {
    if (!providerReference) return null;
    const { rows } = await query('SELECT * FROM stitchd_payments WHERE provider_reference=$1', [providerReference]);
    const row = rows[0];
    if (!row || row.status === 'success') return row ? format(row) : null;
    const status = kind === 'abandoned' ? 'abandoned' : 'failed';
    const { rows: upd } = await query(
      `UPDATE stitchd_payments SET status=$1, last_error=$2, updated_at=now() WHERE id=$3 RETURNING *`,
      [status, reason ? String(reason).slice(0, 300) : null, row.id]
    );
    await this.writeEvent(row.id, row.tailor_id, 'failed', { providerReference, reason });
    return format(upd[0]);
  },

  /**
   * Retry a failed/abandoned collection: issue a fresh gateway charge on the same row with a
   * new reference, bumping retry_count. Returns the new intent.
   */
  async retryCollection(tailorId, paymentId) {
    const { rows } = await query('SELECT * FROM stitchd_payments WHERE tailor_id=$1 AND id=$2', [tailorId, paymentId]);
    const row = rows[0];
    if (!row) throw new GraphQLError('Payment not found.', { extensions: { code: 'NOT_FOUND' } });
    if (row.type !== 'in_app_collected') throw new GraphQLError('Only digital payments can be retried.', { extensions: { code: 'BAD_USER_INPUT' } });
    if (row.status === 'success') throw new GraphQLError('This payment already succeeded.', { extensions: { code: 'BAD_USER_INPUT' } });

    const contact = await this.customerContact(tailorId, row.customer_id);
    if (!contact) throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });

    const reference = newReference();
    try {
      const resp = await paymentsService.initiateStitchdCollection({
        email: contact.email,
        amountKobo: Math.round(num(row.amount) * 100),
        channel: row.channel || 'card',
        reference,
        metadata: { purpose: 'stitchd_collection', paymentId: row.id, tailorId, orderId: row.order_id, customerId: row.customer_id, feeBps: Number(row.fee_bps) || FEE_BPS },
      });
      const { rows: upd } = await query(
        `UPDATE stitchd_payments
            SET provider_reference=$1, auth_url=$2, ussd_code=$3, status='pending',
                retry_count=retry_count+1, last_error=NULL, updated_at=now()
          WHERE id=$4 RETURNING *`,
        [resp.reference || reference, resp.authorizationUrl || null, resp.ussdCode || null, row.id]
      );
      await this.writeEvent(row.id, tailorId, 'retried', { reference });
      const r = upd[0];
      return { paymentId: r.id, authUrl: r.auth_url, ussdCode: r.ussd_code, reference: r.provider_reference, status: r.status };
    } catch (e) {
      logger.error('retryCollection error:', e.message);
      throw new GraphQLError('Could not retry the payment. Please try again.', { extensions: { code: 'BAD_GATEWAY' } });
    }
  },
};

export default StitchdPaymentModel;
