import { query } from '../../infrastructure/database/postgres.js';
import { generatePayoutNumber } from '../../core/utils/randomCode.js';
import { PAYOUT_STATUS } from '../../core/constants/paymentStatus.js';

function format(row) {
  if (!row) return null;
  const p = {
    id:                row.id,
    entityId:          row.id,
    payoutNumber:      row.payout_number,
    tailor:            row.tailor_id,
    tailorId:          row.tailor_id,
    period:            row.period,
    jobs:              row.jobs || [],
    totalAmount:       row.total_amount,
    currency:          row.currency,
    breakdown:         row.breakdown || [],
    advanceAmount:     row.advance_amount,
    netAmount:         row.net_amount,
    status:            row.status,
    paymentMethod:     row.payment_method,
    bankDetails:       row.bank_details,
    processedBy:       row.processed_by,
    processedAt:       row.processed_at,
    providerReference: row.provider_reference,
    providerResponse:  row.provider_response,
    paidAt:            row.paid_at,
    failedAt:          row.failed_at,
    failureReason:     row.failure_reason,
    createdAt:         row.created_at,
    updatedAt:         row.updated_at,
  };

  Object.defineProperties(p, {
    formattedAmount: { get() { return `₦${(this.totalAmount / 100).toLocaleString()}`; }},
    isPaid:          { get() { return this.status === PAYOUT_STATUS.PAID; }},
    jobCount:        { get() { return (this.jobs || []).length; }},
  });

  p.toSafeJSON = () => ({
    ...p, formattedAmount: p.formattedAmount, isPaid: p.isPaid, jobCount: p.jobCount,
  });

  return p;
}

const PayoutModel = {
  async create(data) {
    const totalAmount   = data.totalAmount   || 0;
    const advanceAmount = data.advanceAmount || 0;
    const netAmount     = data.netAmount !== undefined ? data.netAmount : totalAmount - advanceAmount;
    const payoutNumber  = data.payoutNumber || generatePayoutNumber((data.period?.weekNumber) || 1);

    const { rows } = await query(
      `INSERT INTO payouts
         (payout_number, tailor_id, period, jobs, total_amount, currency, breakdown,
          advance_amount, net_amount, status, payment_method, bank_details, processed_by,
          processed_at, provider_reference, provider_response, paid_at, failed_at, failure_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [
        payoutNumber,
        data.tailor || data.tailorId,
        data.period || null,
        data.jobs || [],
        totalAmount,
        data.currency || 'NGN',
        data.breakdown || [],
        advanceAmount,
        netAmount,
        data.status || PAYOUT_STATUS.PENDING,
        data.paymentMethod || 'bank_transfer',
        data.bankDetails || null,
        data.processedBy || null,
        data.processedAt || null,
        data.providerReference || null,
        data.providerResponse || null,
        data.paidAt || null,
        data.failedAt || null,
        data.failureReason || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM payouts WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByPayoutNumber(payoutNumber) {
    const { rows } = await query('SELECT * FROM payouts WHERE payout_number=$1', [payoutNumber]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      status:            'status',
      period:            'period',
      jobs:              'jobs',
      totalAmount:       'total_amount',
      advanceAmount:     'advance_amount',
      netAmount:         'net_amount',
      breakdown:         'breakdown',
      paymentMethod:     'payment_method',
      bankDetails:       'bank_details',
      processedBy:       'processed_by',
      processedAt:       'processed_at',
      providerReference: 'provider_reference',
      providerResponse:  'provider_response',
      paidAt:            'paid_at',
      failedAt:          'failed_at',
      failureReason:     'failure_reason',
    };
    const fields = [];
    const values = [];
    let i = 1;
    // Recalculate net if total or advance change without explicit netAmount
    if ((updates.totalAmount !== undefined || updates.advanceAmount !== undefined) && !('netAmount' in updates)) {
      updates.netAmount = (updates.totalAmount ?? 0) - (updates.advanceAmount ?? 0);
    }
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) { fields.push(`${dbCol}=$${i++}`); values.push(updates[jsKey]); }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE payouts SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async markAsProcessing(id, processedBy) {
    return this.findByIdAndUpdate(id, {
      status: PAYOUT_STATUS.PROCESSING, processedBy, processedAt: new Date(),
    });
  },

  async markAsPaid(id, providerResponse) {
    return this.findByIdAndUpdate(id, {
      status: PAYOUT_STATUS.PAID,
      paidAt: new Date(),
      providerReference: providerResponse?.reference,
      providerResponse,
    });
  },

  async markAsFailed(id, reason) {
    return this.findByIdAndUpdate(id, {
      status: PAYOUT_STATUS.FAILED, failedAt: new Date(), failureReason: reason,
    });
  },

  async findByTailor(tailorId) {
    const { rows } = await query(
      'SELECT * FROM payouts WHERE tailor_id=$1 ORDER BY created_at DESC', [tailorId]
    );
    return rows.map(format);
  },

  async findPending() {
    const { rows } = await query(
      `SELECT * FROM payouts WHERE status='${PAYOUT_STATUS.PENDING}' ORDER BY created_at ASC`
    );
    return rows.map(format);
  },

  async getTailorEarningsSummary(tailorId) {
    const { rows } = await query(
      `SELECT status, COALESCE(SUM(total_amount), 0) AS total, COUNT(*) AS cnt
       FROM payouts WHERE tailor_id=$1 GROUP BY status`,
      [tailorId]
    );
    const summary = {};
    for (const r of rows) {
      summary[r.status] = { total: parseInt(r.total, 10), count: parseInt(r.cnt, 10) };
    }
    return summary;
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.tailor) { conds.push(`tailor_id=$${i++}`); vals.push(filters.tailor); }
    if (filters.status) { conds.push(`status=$${i++}`);    vals.push(filters.status); }
    const { rows } = await query(
      `SELECT * FROM payouts WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.tailor) { conds.push(`tailor_id=$${i++}`); vals.push(filters.tailor); }
    if (filters.status) { conds.push(`status=$${i++}`);    vals.push(filters.status); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM payouts WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM payouts WHERE id=$1', [id]);
  },
};

export default PayoutModel;
