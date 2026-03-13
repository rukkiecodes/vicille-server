import { query } from '../../infrastructure/database/postgres.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';

const CACHE_TTL = 3600;

function normalizeCapturedBy(capturedBy) {
  const raw = typeof capturedBy === 'object'
    ? (capturedBy?.type || capturedBy?.name || '')
    : (capturedBy || '');
  const value = String(raw).trim().toLowerCase();
  if (value === 'tailor') return 'tailor';
  if (value === 'vicelle_staff') return 'vicelle_staff';
  return 'user';
}

function format(row) {
  if (!row) return null;
  return {
    id:              row.id,
    entityId:        row.id,
    user:            row.user_id,
    userId:          row.user_id,
    source:          row.source,
    capturedBy:      row.captured_by,
    measurements:    row.measurements,
    fit:             row.fit,
    version:         row.version,
    previousVersion: row.previous_version,
    delta:           row.delta,
    isActive:        row.is_active,
    queuedForCycle:  row.queued_for_cycle,
    notes:           row.notes,
    capturedAt:      row.captured_at,
    appliedAt:       row.applied_at,
    createdAt:       row.created_at,
    updatedAt:       row.updated_at,
  };
}

async function cacheMeasurement(m) {
  try {
    const redis = getRedisClient();
    if (redis && m?.id) await redis.set(`measurement:${m.id}`, JSON.stringify(m), { EX: CACHE_TTL });
  } catch { /* non-fatal */ }
}

async function getCachedMeasurement(id) {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(`measurement:${id}`);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

async function clearMeasurementCache(id) {
  try { const redis = getRedisClient(); await redis.del(`measurement:${id}`); } catch { /* non-fatal */ }
}

const MeasurementModel = {
  async create(data) {
    let version = 1;
    let previousVersion = null;
    const userId = data.user || data.userId;
    if (userId) {
      const { rows: prev } = await query(
        'SELECT id, version FROM measurements WHERE user_id=$1 ORDER BY version DESC LIMIT 1', [userId]
      );
      if (prev.length) { version = (prev[0].version || 0) + 1; previousVersion = prev[0].id; }
    }

    const { rows } = await query(
      `INSERT INTO measurements
         (user_id, source, captured_by, measurements, fit, version, previous_version,
          delta, is_active, queued_for_cycle, notes, captured_at, applied_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        userId,
        data.source || 'self',
        normalizeCapturedBy(data.capturedBy),
        data.measurements || {},
        data.fit || 'regular',
        data.version || version,
        data.previousVersion || previousVersion,
        data.delta || null,
        data.isActive || false,
        data.queuedForCycle || null,
        data.notes || null,
        data.capturedAt || new Date(),
        data.appliedAt || null,
      ]
    );
    const m = format(rows[0]);
    await cacheMeasurement(m);
    return m;
  },

  async findById(id) {
    const cached = await getCachedMeasurement(id);
    if (cached) return cached;
    const { rows } = await query('SELECT * FROM measurements WHERE id=$1', [id]);
    const m = format(rows[0] || null);
    if (m) await cacheMeasurement(m);
    return m;
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      source:         'source',
      capturedBy:     'captured_by',
      measurements:   'measurements',
      fit:            'fit',
      isActive:       'is_active',
      queuedForCycle: 'queued_for_cycle',
      notes:          'notes',
      appliedAt:      'applied_at',
      delta:          'delta',
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
      `UPDATE measurements SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    const m = format(rows[0] || null);
    if (m) { await clearMeasurementCache(id); await cacheMeasurement(m); }
    return m;
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.user)   { conds.push(`user_id=$${i++}`); vals.push(filters.user); }
    if (filters.userId) { conds.push(`user_id=$${i++}`); vals.push(filters.userId); }
    if (filters.source) { conds.push(`source=$${i++}`);  vals.push(filters.source); }
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`); vals.push(filters.isActive); }
    if (filters.queuedForCycle !== undefined) { conds.push(`queued_for_cycle=$${i++}`); vals.push(filters.queuedForCycle); }
    const total = parseInt(
      (await query(`SELECT COUNT(*) AS cnt FROM measurements WHERE ${conds.join(' AND ')}`, vals)).rows[0].cnt, 10
    );
    const { rows } = await query(
      `SELECT * FROM measurements WHERE ${conds.join(' AND ')} ORDER BY captured_at DESC LIMIT $${i++} OFFSET $${i++}`,
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
    if (filters.user)   { conds.push(`user_id=$${i++}`); vals.push(filters.user); }
    if (filters.source) { conds.push(`source=$${i++}`);  vals.push(filters.source); }
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`); vals.push(filters.isActive); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM measurements WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM measurements WHERE id=$1', [id]);
    await clearMeasurementCache(id);
  },

  async getActiveForUser(userId) {
    const { rows } = await query(
      'SELECT * FROM measurements WHERE user_id=$1 AND is_active=TRUE LIMIT 1', [userId]
    );
    return format(rows[0] || null);
  },

  async getHistoryForUser(userId, limit = 10) {
    const { rows } = await query(
      'SELECT * FROM measurements WHERE user_id=$1 ORDER BY version DESC LIMIT $2', [userId, limit]
    );
    return rows.map(format);
  },

  async getQueuedForCycle(cycleNumber) {
    const { rows } = await query(
      'SELECT * FROM measurements WHERE queued_for_cycle=$1 AND is_active=FALSE', [cycleNumber]
    );
    return rows.map(format);
  },

  async makeActive(id) {
    const m = await this.findById(id);
    if (!m) return null;
    await query('UPDATE measurements SET is_active=FALSE WHERE user_id=$1 AND id<>$2', [m.userId, id]);
    const { rows } = await query(
      'UPDATE measurements SET is_active=TRUE, applied_at=NOW() WHERE id=$1 RETURNING *', [id]
    );
    const updated = format(rows[0] || null);
    if (updated) { await clearMeasurementCache(id); await cacheMeasurement(updated); }
    return updated;
  },

  async queueForNextCycle(id, cycleNumber) {
    const { rows } = await query(
      'UPDATE measurements SET queued_for_cycle=$1 WHERE id=$2 RETURNING *', [cycleNumber, id]
    );
    const updated = format(rows[0] || null);
    if (updated) { await clearMeasurementCache(id); await cacheMeasurement(updated); }
    return updated;
  },
};

export default MeasurementModel;
