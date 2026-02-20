import { query } from '../../infrastructure/database/postgres.js';
import { generateTransactionReference } from '../../core/utils/randomCode.js';
import { PAYMENT_STATUS } from '../../core/constants/paymentStatus.js';

function format(row) {
  if (!row) return null;
  const p = {
    id:                   row.id,
    entityId:             row.id,
    transactionReference: row.transaction_reference,
    user:                 row.user_id,
    userId:               row.user_id,
    order:                row.order_id,
    orderId:              row.order_id,
    subscription:         row.subscription_id,
    subscriptionId:       row.subscription_id,
    paymentType:          row.payment_type,
    amount:               row.amount,
    currency:             row.currency,
    paymentMethod:        row.payment_method,
    status:               row.status,
    providerReference:    row.provider_reference,
    providerResponse:     row.provider_response,
    metadata:             row.metadata,
    refund:               row.refund,
    retryCount:           row.retry_count,
    nextRetryAt:          row.next_retry_at,
    lastAttemptAt:        row.last_attempt_at,
    paidAt:               row.paid_at,
    failedAt:             row.failed_at,
    refundedAt:           row.refunded_at,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  };

  Object.defineProperties(p, {
    formattedAmount: { get() { return `₦${(this.amount / 100).toLocaleString()}`; }},
    isPaid:          { get() { return this.status === PAYMENT_STATUS.SUCCESS; }},
    canRetry:        { get() { return this.status === PAYMENT_STATUS.FAILED && this.retryCount < 3; }},
  });

  p.toSafeJSON = () => ({
    ...p, formattedAmount: p.formattedAmount, isPaid: p.isPaid, canRetry: p.canRetry,
  });

  return p;
}

const PaymentModel = {
  async create(data) {
    const transactionReference = data.transactionReference || generateTransactionReference();
    const { rows } = await query(
      `INSERT INTO payments
         (transaction_reference, user_id, order_id, subscription_id, payment_type,
          amount, currency, payment_method, status, provider_reference, provider_response,
          metadata, refund, retry_count, next_retry_at, last_attempt_at, paid_at, failed_at, refunded_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [
        transactionReference,
        data.user || data.userId,
        data.order || data.orderId || null,
        data.subscription || data.subscriptionId || null,
        data.paymentType,
        data.amount,
        data.currency || 'NGN',
        data.paymentMethod || null,
        data.status || PAYMENT_STATUS.PENDING,
        data.providerReference || null,
        data.providerResponse || null,
        data.metadata || null,
        data.refund || null,
        data.retryCount || 0,
        data.nextRetryAt || null,
        data.lastAttemptAt || null,
        data.paidAt || null,
        data.failedAt || null,
        data.refundedAt || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM payments WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByTransactionReference(ref) {
    const { rows } = await query('SELECT * FROM payments WHERE transaction_reference=$1', [ref]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      status:            'status',
      providerReference: 'provider_reference',
      providerResponse:  'provider_response',
      metadata:          'metadata',
      refund:            'refund',
      retryCount:        'retry_count',
      nextRetryAt:       'next_retry_at',
      lastAttemptAt:     'last_attempt_at',
      paidAt:            'paid_at',
      failedAt:          'failed_at',
      refundedAt:        'refunded_at',
    };
    const fields = [];
    const values = [];
    let i = 1;
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) { fields.push(`${dbCol}=$${i++}`); values.push(updates[jsKey]); }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE payments SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)         { conds.push(`user_id=$${i++}`);         vals.push(filters.user); }
    if (filters.order)        { conds.push(`order_id=$${i++}`);        vals.push(filters.order); }
    if (filters.subscription) { conds.push(`subscription_id=$${i++}`); vals.push(filters.subscription); }
    if (filters.status)       { conds.push(`status=$${i++}`);          vals.push(filters.status); }
    if (filters.paymentType)  { conds.push(`payment_type=$${i++}`);    vals.push(filters.paymentType); }
    const { rows } = await query(
      `SELECT * FROM payments WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)        { conds.push(`user_id=$${i++}`);      vals.push(filters.user); }
    if (filters.status)      { conds.push(`status=$${i++}`);       vals.push(filters.status); }
    if (filters.paymentType) { conds.push(`payment_type=$${i++}`); vals.push(filters.paymentType); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM payments WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM payments WHERE id=$1', [id]);
  },

  async findByUser(userId, options = {}) {
    const limit = options.limit || 20;
    const { rows } = await query(
      'SELECT * FROM payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, limit]
    );
    return rows.map(format);
  },

  async findSuccessful(userId) {
    const { rows } = await query(
      `SELECT * FROM payments WHERE user_id=$1 AND status='${PAYMENT_STATUS.SUCCESS}' ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map(format);
  },

  async findDueForRetry() {
    const { rows } = await query(
      `SELECT * FROM payments WHERE status='${PAYMENT_STATUS.FAILED}' AND next_retry_at <= NOW() AND retry_count < 3`
    );
    return rows.map(format);
  },

  async markAsSuccess(id, providerResponse) {
    return this.findByIdAndUpdate(id, {
      status: PAYMENT_STATUS.SUCCESS,
      paidAt: new Date(),
      providerReference: providerResponse?.reference || providerResponse?.data?.reference,
      providerResponse,
    });
  },

  async markAsFailed(id, providerResponse, scheduleRetry = true) {
    const payment = await this.findById(id);
    if (!payment) return null;
    const updates = {
      status: PAYMENT_STATUS.FAILED,
      failedAt: new Date(),
      lastAttemptAt: new Date(),
      providerResponse,
    };
    if (scheduleRetry && payment.retryCount < 3) {
      updates.retryCount = (payment.retryCount || 0) + 1;
      updates.nextRetryAt = new Date(Date.now() + 86400000);
    }
    return this.findByIdAndUpdate(id, updates);
  },

  async processRefund(id, amount, reason, refundReference) {
    const payment = await this.findById(id);
    if (!payment) return null;
    return this.findByIdAndUpdate(id, {
      status: PAYMENT_STATUS.REFUNDED,
      refundedAt: new Date(),
      refund: { amount: amount || payment.amount, reason, refundedAt: new Date().toISOString(), refundReference },
    });
  },

  async calculateRevenue(startDate, endDate) {
    const { rows } = await query(
      `SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS cnt FROM payments
       WHERE status='${PAYMENT_STATUS.SUCCESS}' AND paid_at >= $1 AND paid_at <= $2`,
      [startDate, endDate]
    );
    return { totalAmount: parseInt(rows[0].total, 10), count: parseInt(rows[0].cnt, 10) };
  },
};

export default PaymentModel;
