import { query } from '../../infrastructure/database/postgres.js';
import { generateSpecialRequestNumber } from '../../core/utils/randomCode.js';

function format(row) {
  if (!row) return null;
  const s = {
    id:                     row.id,
    entityId:               row.id,
    requestNumber:          row.request_number,
    user:                   row.user_id,
    userId:                 row.user_id,
    eventOccasion:          row.event_occasion,
    description:            row.description,
    urgency:                row.urgency,
    inspiration:            row.inspiration || [],
    pricing:                row.pricing,
    quoteApprovedBy:        row.quote_approved_by,
    quoteApprovedAt:        row.quote_approved_at,
    depositPayment:         row.deposit_payment_id,
    balancePayment:         row.balance_payment_id,
    measurement:            row.measurement_id,
    order:                  row.order_id,
    status:                 row.status,
    reviewedBy:             row.reviewed_by,
    reviewNotes:            row.review_notes,
    communications:         row.communications || [],
    requestedDeliveryDate:  row.requested_delivery_date,
    createdAt:              row.created_at,
    updatedAt:              row.updated_at,
  };

  Object.defineProperties(s, {
    isQuoteApproved: { get() { return !!this.quoteApprovedAt; }},
    isDepositPaid:   { get() { return !!this.depositPayment; }},
    isFullyPaid:     { get() { return !!this.depositPayment && !!this.balancePayment; }},
    formattedQuote:  { get() {
      if (!this.pricing?.totalQuote) return null;
      return `₦${(this.pricing.totalQuote / 100).toLocaleString()}`;
    }},
  });

  s.toSafeJSON = () => ({
    id: s.entityId, requestNumber: s.requestNumber, user: s.user,
    eventOccasion: s.eventOccasion, description: s.description, urgency: s.urgency,
    inspiration: s.inspiration, pricing: s.pricing, quoteApprovedBy: s.quoteApprovedBy,
    quoteApprovedAt: s.quoteApprovedAt, depositPayment: s.depositPayment,
    balancePayment: s.balancePayment, measurement: s.measurement, order: s.order,
    status: s.status, reviewedBy: s.reviewedBy, reviewNotes: s.reviewNotes,
    communications: s.communications, requestedDeliveryDate: s.requestedDeliveryDate,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
    isQuoteApproved: s.isQuoteApproved, isDepositPaid: s.isDepositPaid,
    isFullyPaid: s.isFullyPaid, formattedQuote: s.formattedQuote,
  });

  return s;
}

const SpecialRequestModel = {
  async create(data) {
    const requestNumber = data.requestNumber || generateSpecialRequestNumber();
    let pricing = data.pricing;
    if (pricing?.totalQuote) {
      pricing.depositAmount = Math.ceil(pricing.totalQuote * 0.5);
      pricing.balanceAmount  = pricing.totalQuote - pricing.depositAmount;
    }

    const { rows } = await query(
      `INSERT INTO special_requests
         (request_number, user_id, event_occasion, description, urgency, inspiration, pricing,
          quote_approved_by, quote_approved_at, deposit_payment_id, balance_payment_id,
          measurement_id, order_id, status, reviewed_by, review_notes, communications,
          requested_delivery_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        requestNumber,
        data.user || data.userId,
        data.eventOccasion || null,
        data.description || null,
        data.urgency || 'standard',
        data.inspiration || [],
        pricing || null,
        data.quoteApprovedBy || null,
        data.quoteApprovedAt || null,
        data.depositPayment || null,
        data.balancePayment || null,
        data.measurement || data.measurementId || null,
        data.order || data.orderId || null,
        data.status || 'pending_quote',
        data.reviewedBy || null,
        data.reviewNotes || null,
        data.communications || [],
        data.requestedDeliveryDate || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM special_requests WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByRequestNumber(requestNumber) {
    const { rows } = await query('SELECT * FROM special_requests WHERE request_number=$1', [requestNumber]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      eventOccasion:         'event_occasion',
      description:           'description',
      urgency:               'urgency',
      inspiration:           'inspiration',
      pricing:               'pricing',
      quoteApprovedBy:       'quote_approved_by',
      quoteApprovedAt:       'quote_approved_at',
      depositPayment:        'deposit_payment_id',
      balancePayment:        'balance_payment_id',
      measurement:           'measurement_id',
      order:                 'order_id',
      status:                'status',
      reviewedBy:            'reviewed_by',
      reviewNotes:           'review_notes',
      communications:        'communications',
      requestedDeliveryDate: 'requested_delivery_date',
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
      `UPDATE special_requests SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async sendQuote(id, pricingData, reviewedBy, notes) {
    const totalQuote =
      (pricingData.materialCost || 0) +
      (pricingData.urgencyFee   || 0) +
      (pricingData.deliveryFee  || 0) +
      (pricingData.serviceFee   || 0);
    const pricing = {
      ...pricingData, totalQuote,
      depositAmount: Math.ceil(totalQuote * 0.5),
      balanceAmount: totalQuote - Math.ceil(totalQuote * 0.5),
    };
    return this.findByIdAndUpdate(id, { pricing, status: 'quote_sent', reviewedBy, reviewNotes: notes });
  },

  async approveQuote(id, userId) {
    return this.findByIdAndUpdate(id, {
      quoteApprovedBy: userId,
      quoteApprovedAt: new Date(),
      status: 'deposit_pending',
    });
  },

  async addCommunication(id, from, message) {
    const req = await this.findById(id);
    if (!req) return null;
    const comms = [...(req.communications || []), { from, message, timestamp: new Date().toISOString() }];
    return this.findByIdAndUpdate(id, { communications: comms });
  },

  async findByUser(userId) {
    const { rows } = await query(
      'SELECT * FROM special_requests WHERE user_id=$1 ORDER BY created_at DESC', [userId]
    );
    return rows.map(format);
  },

  async findPendingQuote() {
    const { rows } = await query(
      `SELECT * FROM special_requests WHERE status='pending_quote' ORDER BY created_at ASC`
    );
    return rows.map(format);
  },

  async findAwaitingDeposit() {
    const { rows } = await query(
      `SELECT * FROM special_requests WHERE status='deposit_pending' ORDER BY created_at ASC`
    );
    return rows.map(format);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)   { conds.push(`user_id=$${i++}`); vals.push(filters.user); }
    if (filters.status) { conds.push(`status=$${i++}`);  vals.push(filters.status); }
    const { rows } = await query(
      `SELECT * FROM special_requests WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)   { conds.push(`user_id=$${i++}`); vals.push(filters.user); }
    if (filters.status) { conds.push(`status=$${i++}`);  vals.push(filters.status); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM special_requests WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM special_requests WHERE id=$1', [id]);
  },
};

export default SpecialRequestModel;
