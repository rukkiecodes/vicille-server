import { query, getClient } from '../../infrastructure/database/postgres.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateOrderNumber, generateClientTag } from '../../core/utils/randomCode.js';
import { ORDER_STATUS, isValidTransition } from '../../core/constants/orderStatus.js';
import logger from '../../core/logger/index.js';

const CACHE_TTL = 3600;

function normalizeOrderType(value) {
  const v = (value || '').toString().trim().toLowerCase();
  if (v === 'subscription') return 'subscription';
  // Keep legacy/custom client values compatible with DB constraint.
  return 'special_request';
}

function format(row) {
  if (!row) return null;
  return {
    id:                    row.id,
    entityId:              row.id,
    orderNumber:           row.order_number,
    clientTag:             row.client_tag,
    user:                  row.user_id,
    userId:                row.user_id,
    subscription:          row.subscription_id,
    subscriptionId:        row.subscription_id,
    stylingWindowId:       row.styling_window_id,
    orderType:             row.order_type,
    status:                row.status,
    stylingWindow: {
      isOpen:   row.styling_window_open,
      lockedAt: row.styling_window_locked_at,
    },
    productionStartedAt:  row.production_started_at,
    productionStartedBy:  row.production_started_by,
    estimatedDeliveryDate:row.estimated_delivery_date,
    deliveryMethod:       row.delivery_method,
    trackingNumber:       row.tracking_number,
    dispatchedAt:         row.dispatched_at,
    deliveredAt:          row.delivered_at,
    deliveredBy:          row.delivered_by,
    deliveryProof:        row.delivery_proof_url,
    totalAmount:          row.total_amount,
    amountPaid:           row.amount_paid,
    outstandingBalance:   row.outstanding_balance,
    paymentStatus:        row.payment_status,
    cancellation: row.cancelled_at ? {
      cancelledAt: row.cancelled_at,
      reason:      row.cancellation_reason,
      cancelledBy: row.cancelled_by,
    } : null,
    notes:         row.notes,
    internalNotes: row.internal_notes,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

async function cacheOrder(order) {
  try {
    const redis = getRedisClient();
    if (redis && order?.id) {
      await redis.set(`order:${order.id}`, JSON.stringify(order), { EX: CACHE_TTL });
    }
  } catch { /* non-fatal */ }
}

async function getCachedOrder(id) {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(`order:${id}`);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

async function clearOrderCache(id) {
  try {
    const redis = getRedisClient();
    await redis.del(`order:${id}`);
  } catch { /* non-fatal */ }
}

const OrderModel = {
  async create(data) {
    const orderNumber = data.orderNumber || generateOrderNumber();
    const clientTag   = data.clientTag   || generateClientTag();

    const { rows } = await query(
      `INSERT INTO orders
         (order_number, client_tag, user_id, subscription_id, order_type,
          total_amount, amount_paid, outstanding_balance, payment_status,
          delivery_method, notes, internal_notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        orderNumber,
        clientTag,
        data.user || data.userId,
        data.subscription || data.subscriptionId || null,
        normalizeOrderType(data.orderType),
        data.totalAmount || 0,
        data.amountPaid || 0,
        data.outstandingBalance || 0,
        data.paymentStatus || 'pending',
        data.deliveryMethod || 'standard',
        data.notes || null,
        data.internalNotes || null,
      ]
    );
    const order = format(rows[0]);
    // Log initial status history
    await query(
      `INSERT INTO order_status_history (order_id, to_status, changed_by_id, changed_by_role, notes)
       VALUES ($1,'styling_in_progress',$2,$3,'Order created')`,
      [order.id, data.createdBy || order.userId, data.createdByRole || 'user']
    );
    await cacheOrder(order);
    return order;
  },

  async findById(id) {
    const cached = await getCachedOrder(id);
    if (cached) return cached;
    const { rows } = await query('SELECT * FROM orders WHERE id=$1', [id]);
    const order = format(rows[0] || null);
    if (order) await cacheOrder(order);
    return order;
  },

  async findByOrderNumber(orderNumber) {
    const { rows } = await query('SELECT * FROM orders WHERE order_number=$1', [orderNumber]);
    return format(rows[0] || null);
  },

  async findByClientTag(clientTag) {
    const { rows } = await query('SELECT * FROM orders WHERE client_tag=$1', [clientTag]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      status:                  'status',
      stylingWindowOpen:       'styling_window_open',
      stylingWindowLockedAt:   'styling_window_locked_at',
      productionStartedAt:     'production_started_at',
      productionStartedBy:     'production_started_by',
      estimatedDeliveryDate:   'estimated_delivery_date',
      deliveryMethod:          'delivery_method',
      trackingNumber:          'tracking_number',
      dispatchedAt:            'dispatched_at',
      deliveredAt:             'delivered_at',
      deliveredBy:             'delivered_by',
      deliveryProofUrl:        'delivery_proof_url',
      totalAmount:             'total_amount',
      amountPaid:              'amount_paid',
      outstandingBalance:      'outstanding_balance',
      paymentStatus:           'payment_status',
      cancelledAt:             'cancelled_at',
      cancellationReason:      'cancellation_reason',
      cancelledBy:             'cancelled_by',
      notes:                   'notes',
      internalNotes:           'internal_notes',
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
      `UPDATE orders SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    const order = format(rows[0] || null);
    if (order) { await clearOrderCache(id); await cacheOrder(order); }
    return order;
  },

  async updateStatus(id, newStatus, changedById, changedByRole, notes) {
    const order = await this.findById(id);
    if (!order) return null;
    if (!isValidTransition(order.status, newStatus)) {
      throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
    }
    const updates = { status: newStatus };
    if (newStatus === ORDER_STATUS.PRODUCTION_IN_PROGRESS) {
      updates.stylingWindowOpen     = false;
      updates.stylingWindowLockedAt = new Date();
      updates.productionStartedAt   = new Date();
      updates.productionStartedBy   = changedById;
    }
    const updated = await this.findByIdAndUpdate(id, updates);
    // Record status history
    await query(
      `INSERT INTO order_status_history
         (order_id, from_status, to_status, changed_by_id, changed_by_role, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, order.status, newStatus, changedById, changedByRole,
       notes || `Status changed from ${order.status} to ${newStatus}`]
    );
    return updated;
  },

  async cancelOrder(id, reason, cancelledBy) {
    const order = await this.findById(id);
    if (!order) return null;
    if (order.status !== ORDER_STATUS.STYLING_IN_PROGRESS) {
      throw new Error('Order cannot be cancelled at this stage');
    }
    const updated = await this.findByIdAndUpdate(id, {
      status:             'cancelled',
      cancelledAt:        new Date(),
      cancellationReason: reason,
      cancelledBy,
    });
    await query(
      `INSERT INTO order_status_history
         (order_id, from_status, to_status, changed_by_id, changed_by_role, notes)
       VALUES ($1,$2,'cancelled',$3,'user',$4)`,
      [id, order.status, cancelledBy, `Cancelled: ${reason}`]
    );
    return updated;
  },

  async findByUser(userId, options = {}) {
    const limit = options.limit || 20;
    const { rows } = await query(
      'SELECT * FROM orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2',
      [userId, limit]
    );
    return rows.map(format);
  },

  async findByStatus(status) {
    const { rows } = await query(
      'SELECT * FROM orders WHERE status=$1 ORDER BY created_at DESC', [status]
    );
    return rows.map(format);
  },

  async findInStylingWindow() {
    const { rows } = await query(
      `SELECT * FROM orders WHERE status='styling_in_progress' AND styling_window_open=TRUE`, []
    );
    return rows.map(format);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.status)    { conds.push(`status=$${i++}`);    vals.push(filters.status); }
    if (filters.orderType) { conds.push(`order_type=$${i++}`); vals.push(filters.orderType); }
    if (filters.user)      { conds.push(`user_id=$${i++}`);   vals.push(filters.user); }
    if (filters.userId)    { conds.push(`user_id=$${i++}`);   vals.push(filters.userId); }
    const total = parseInt(
      (await query(`SELECT COUNT(*) AS cnt FROM orders WHERE ${conds.join(' AND ')}`, vals)).rows[0].cnt, 10
    );
    const { rows } = await query(
      `SELECT * FROM orders WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return {
      data: rows.map(format),
      pagination: { page: Math.floor(offset / limit) + 1, limit, total, pages: Math.ceil(total / limit) },
    };
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.status)    { conds.push(`status=$${i++}`);    vals.push(filters.status); }
    if (filters.orderType) { conds.push(`order_type=$${i++}`); vals.push(filters.orderType); }
    if (filters.user)      { conds.push(`user_id=$${i++}`);   vals.push(filters.user); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM orders WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM orders WHERE id=$1', [id]);
    await clearOrderCache(id);
  },
};

export default OrderModel;
