import { query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  const o = {
    id:            row.id,
    entityId:      row.id,
    user:          row.user_id,
    userId:        row.user_id,
    order:         row.order_id,
    orderId:       row.order_id,
    items:         row.items || [],
    totalAmount:   row.total_amount,
    payment:       row.payment_id,
    paymentStatus: row.payment_status,
    status:        row.status,
    deliveredWith: row.delivered_with,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };

  Object.defineProperties(o, {
    itemCount:      { get() { return (this.items || []).reduce((s, i) => s + i.quantity, 0); }},
    isPaid:         { get() { return this.paymentStatus === 'paid'; }},
    formattedTotal: { get() { return `₦${(this.totalAmount / 100).toLocaleString()}`; }},
  });

  o.toSafeJSON = () => ({
    ...o, itemCount: o.itemCount, isPaid: o.isPaid, formattedTotal: o.formattedTotal,
  });

  return o;
}

const AccessoryOrderModel = {
  async create(data) {
    let items = data.items || [];
    let totalAmount = data.totalAmount || 0;
    if (items.length > 0) {
      items = items.map(item => ({ ...item, subtotal: item.price * item.quantity }));
      totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
    }

    const { rows } = await query(
      `INSERT INTO accessory_orders
         (user_id, order_id, items, total_amount, payment_id, payment_status, status, delivered_with)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        data.user || data.userId,
        data.order || data.orderId || null,
        items,
        totalAmount,
        data.payment || null,
        data.paymentStatus || 'pending',
        data.status || 'pending',
        data.deliveredWith || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM accessory_orders WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      items:         'items',
      totalAmount:   'total_amount',
      payment:       'payment_id',
      paymentStatus: 'payment_status',
      status:        'status',
      deliveredWith: 'delivered_with',
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
      `UPDATE accessory_orders SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async markAsPaid(id, paymentId) {
    return this.findByIdAndUpdate(id, { payment: paymentId, paymentStatus: 'paid', status: 'processing' });
  },

  async markAsDelivered(id, deliveredWithOrderId) {
    return this.findByIdAndUpdate(id, { status: 'delivered', deliveredWith: deliveredWithOrderId });
  },

  async findByUser(userId) {
    const { rows } = await query(
      'SELECT * FROM accessory_orders WHERE user_id=$1 ORDER BY created_at DESC', [userId]
    );
    return rows.map(format);
  },

  async findByOrder(orderId) {
    const { rows } = await query('SELECT * FROM accessory_orders WHERE order_id=$1', [orderId]);
    return rows.map(format);
  },

  async findPendingDelivery() {
    const { rows } = await query(
      `SELECT * FROM accessory_orders WHERE payment_status='paid' AND status<>'delivered' ORDER BY created_at ASC`
    );
    return rows.map(format);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)          { conds.push(`user_id=$${i++}`);        vals.push(filters.user); }
    if (filters.order)         { conds.push(`order_id=$${i++}`);       vals.push(filters.order); }
    if (filters.paymentStatus) { conds.push(`payment_status=$${i++}`); vals.push(filters.paymentStatus); }
    if (filters.status)        { conds.push(`status=$${i++}`);         vals.push(filters.status); }
    const { rows } = await query(
      `SELECT * FROM accessory_orders WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)          { conds.push(`user_id=$${i++}`);        vals.push(filters.user); }
    if (filters.order)         { conds.push(`order_id=$${i++}`);       vals.push(filters.order); }
    if (filters.paymentStatus) { conds.push(`payment_status=$${i++}`); vals.push(filters.paymentStatus); }
    if (filters.status)        { conds.push(`status=$${i++}`);         vals.push(filters.status); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM accessory_orders WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM accessory_orders WHERE id=$1', [id]);
  },
};

export default AccessoryOrderModel;
