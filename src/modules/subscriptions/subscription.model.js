import { query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  const s = {
    id:              row.id,
    entityId:        row.id,
    user:            row.user_id,
    userId:          row.user_id,
    plan:            row.plan_id,
    planId:          row.plan_id,
    status:          row.status,
    billing:         row.billing,
    currentCycle:    row.current_cycle,
    paymentStatus:   row.payment_status,
    gracePeriodEnds: row.grace_period_ends,
    startDate:       row.start_date,
    endDate:         row.end_date,
    renewalEnabled:  row.renewal_enabled,
    cancellation:    row.cancellation,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };

  Object.defineProperties(s, {
    isActive: { get() {
      return this.status === 'active' && this.paymentStatus !== 'overdue';
    }},
    isStylingWindowOpen: { get() {
      const cc = this.currentCycle;
      if (!cc) return false;
      const now = new Date();
      return cc.stylingWindowOpen && cc.stylingWindowClose &&
        now >= new Date(cc.stylingWindowOpen) && now <= new Date(cc.stylingWindowClose);
    }},
    daysUntilNextBilling: { get() {
      if (!this.billing?.nextBillingDate) return null;
      return Math.ceil((new Date(this.billing.nextBillingDate) - new Date()) / 86400000);
    }},
    isInGracePeriod: { get() {
      return this.gracePeriodEnds ? new Date() <= new Date(this.gracePeriodEnds) : false;
    }},
  });

  s.toSafeJSON = () => ({
    id: s.entityId, user: s.user, plan: s.plan, status: s.status,
    billing: s.billing, currentCycle: s.currentCycle, paymentStatus: s.paymentStatus,
    gracePeriodEnds: s.gracePeriodEnds, startDate: s.startDate, endDate: s.endDate,
    renewalEnabled: s.renewalEnabled, cancellation: s.cancellation,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
    isActive: s.isActive, isStylingWindowOpen: s.isStylingWindowOpen,
    daysUntilNextBilling: s.daysUntilNextBilling, isInGracePeriod: s.isInGracePeriod,
  });

  return s;
}

const SubscriptionModel = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO user_subscriptions
         (user_id, plan_id, status, billing, current_cycle, payment_status,
          grace_period_ends, start_date, end_date, renewal_enabled, cancellation)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        data.user || data.userId,
        data.plan || data.planId,
        data.status || 'active',
        data.billing || null,
        data.currentCycle || null,
        data.paymentStatus || 'pending',
        data.gracePeriodEnds || null,
        data.startDate || new Date(),
        data.endDate || null,
        data.renewalEnabled !== false,
        data.cancellation || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM user_subscriptions WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      status:          'status',
      billing:         'billing',
      nextBillingDate: 'next_billing_date',
      currentCycle:    'current_cycle',
      paymentStatus:   'payment_status',
      gracePeriodEnds: 'grace_period_ends',
      startDate:       'start_date',
      endDate:         'end_date',
      renewalEnabled:  'renewal_enabled',
      cancellation:    'cancellation',
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
      `UPDATE user_subscriptions SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)          { conds.push(`user_id=$${i++}`);        vals.push(filters.user); }
    if (filters.status)        { conds.push(`status=$${i++}`);         vals.push(filters.status); }
    if (filters.paymentStatus) { conds.push(`payment_status=$${i++}`); vals.push(filters.paymentStatus); }
    if (filters.plan)          { conds.push(`plan_id=$${i++}`);        vals.push(filters.plan); }
    const { rows } = await query(
      `SELECT * FROM user_subscriptions WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)          { conds.push(`user_id=$${i++}`);        vals.push(filters.user); }
    if (filters.status)        { conds.push(`status=$${i++}`);         vals.push(filters.status); }
    if (filters.paymentStatus) { conds.push(`payment_status=$${i++}`); vals.push(filters.paymentStatus); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM user_subscriptions WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM user_subscriptions WHERE id=$1', [id]);
  },

  async findActive() {
    const { rows } = await query(`SELECT * FROM user_subscriptions WHERE status='active'`);
    return rows.map(format);
  },

  async findByUser(userId) {
    const { rows } = await query(
      'SELECT * FROM user_subscriptions WHERE user_id=$1 ORDER BY created_at DESC', [userId]
    );
    return rows.map(format);
  },

  async findDueForBilling() {
    const { rows } = await query(
      `SELECT * FROM user_subscriptions WHERE status='active' AND renewal_enabled=TRUE
       AND (billing->>'nextBillingDate')::timestamptz <= NOW()`
    );
    return rows.map(format);
  },

  async findOverdue() {
    const { rows } = await query(
      `SELECT * FROM user_subscriptions WHERE status='active' AND payment_status='overdue'
       AND grace_period_ends < NOW()`
    );
    return rows.map(format);
  },

  async advanceToNextCycle(id) {
    const sub = await this.findById(id);
    if (!sub || !sub.currentCycle) return null;
    const cc = sub.currentCycle;
    let nextMonth = cc.month + 1;
    let nextYear = cc.year;
    if (nextMonth > 12) { nextMonth = 1; nextYear += 1; }
    const newCycle = {
      cycleNumber: cc.cycleNumber + 1, month: nextMonth, year: nextYear,
      stylingWindowOpen: null, stylingWindowClose: null,
      productionStartDate: null, estimatedDeliveryDate: null,
    };
    return this.findByIdAndUpdate(id, { currentCycle: newCycle });
  },

  async cancel(id, reason, cancelledBy) {
    return this.findByIdAndUpdate(id, {
      status: 'cancelled',
      cancellation: { cancelledAt: new Date().toISOString(), reason, cancelledBy },
    });
  },

  async pause(id) {
    return this.findByIdAndUpdate(id, { status: 'paused' });
  },

  async resume(id) {
    return this.findByIdAndUpdate(id, { status: 'active' });
  },
};

export default SubscriptionModel;
