import { query } from '../../infrastructure/database/postgres.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';

const CACHE_TTL = 3600;

function format(row) {
  if (!row) return null;
  return {
    id:            row.id,
    entityId:      row.id,
    name:          row.name,
    slug:          row.slug,
    description:   row.description,
    pricing:       row.pricing,
    features:      row.features,
    stylingWindow: row.styling_window || { daysBeforeProduction: 7, reminderDays: [7, 3, 1] },
    isActive:           row.is_active,
    displayOrder:       row.display_order,
    referralRewardNgn:  row.referral_reward_ngn != null ? Number(row.referral_reward_ngn) : null,
    createdAt:          row.created_at,
    updatedAt:          row.updated_at,
  };
}

async function cachePlan(plan) {
  try {
    const redis = getRedisClient();
    if (redis && plan?.id) await redis.set(`subscriptionPlan:${plan.id}`, JSON.stringify(plan), { EX: CACHE_TTL });
  } catch { /* non-fatal */ }
}

async function getCachedPlan(id) {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(`subscriptionPlan:${id}`);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

async function clearPlanCache(id) {
  try { const redis = getRedisClient(); await redis.del(`subscriptionPlan:${id}`); } catch { /* non-fatal */ }
}

const SubscriptionPlanModel = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO subscription_plans
         (name, slug, description, pricing, features, styling_window, is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        data.name,
        data.slug?.toLowerCase() || '',
        data.description || '',
        data.pricing || null,
        data.features || null,
        data.stylingWindow || { daysBeforeProduction: 7, reminderDays: [7, 3, 1] },
        data.isActive !== false,
        data.displayOrder || 0,
      ]
    );
    const plan = format(rows[0]);
    await cachePlan(plan);
    return plan;
  },

  async findById(id) {
    const cached = await getCachedPlan(id);
    if (cached) return cached;
    const { rows } = await query('SELECT * FROM subscription_plans WHERE id=$1', [id]);
    const plan = format(rows[0] || null);
    if (plan) await cachePlan(plan);
    return plan;
  },

  async findBySlug(slug) {
    const { rows } = await query(
      'SELECT * FROM subscription_plans WHERE slug=$1 AND is_active=TRUE LIMIT 1',
      [slug.toLowerCase()]
    );
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      name:          'name',
      slug:          'slug',
      description:   'description',
      pricing:       'pricing',
      features:      'features',
      stylingWindow: 'styling_window',
      isActive:      'is_active',
      displayOrder:  'display_order',
    };
    const fields = [];
    const values = [];
    let i = 1;
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) {
        let val = updates[jsKey];
        if (jsKey === 'slug' && val) val = val.toLowerCase();
        fields.push(`${dbCol}=$${i++}`);
        values.push(val);
      }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE subscription_plans SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    const plan = format(rows[0] || null);
    if (plan) { await clearPlanCache(id); await cachePlan(plan); }
    return plan;
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`); vals.push(filters.isActive); }
    const total = parseInt(
      (await query(`SELECT COUNT(*) AS cnt FROM subscription_plans WHERE ${conds.join(' AND ')}`, vals)).rows[0].cnt, 10
    );
    const { rows } = await query(
      `SELECT * FROM subscription_plans WHERE ${conds.join(' AND ')} ORDER BY display_order ASC, created_at DESC LIMIT $${i++} OFFSET $${i++}`,
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
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`); vals.push(filters.isActive); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM subscription_plans WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await clearPlanCache(id);
    await query('DELETE FROM subscription_plans WHERE id=$1', [id]);
  },

  async findActive() {
    const { rows } = await query(
      'SELECT * FROM subscription_plans WHERE is_active=TRUE ORDER BY display_order ASC'
    );
    return rows.map(format);
  },

  async slugExists(slug) {
    const { rows } = await query(
      'SELECT id FROM subscription_plans WHERE slug=$1 LIMIT 1', [slug.toLowerCase()]
    );
    return rows.length > 0;
  },
};

export default SubscriptionPlanModel;
