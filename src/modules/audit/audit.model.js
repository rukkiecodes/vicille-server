import { query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  return {
    id:            row.id,
    entityId:      row.id,
    eventType:     row.event_type,
    eventCategory: row.event_category,
    actor:         row.actor,
    actorId:       row.actor_id,
    target:        row.target,
    targetId:      row.target_id,
    targetType:    row.target_type,
    changes:       row.changes,
    metadata:      row.metadata,
    description:   row.description,
    severity:      row.severity,
    timestamp:     row.timestamp,
    createdAt:     row.created_at,
  };
}

const AuditLogModel = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO audit_logs
         (event_type, event_category, actor_id, actor, target_id, target_type, target,
          changes, metadata, description, severity, timestamp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        data.eventType,
        data.eventCategory || null,
        data.actor?.id || data.actorId || null,
        data.actor || null,
        data.target?.id || data.targetId || null,
        data.target?.type || data.targetType || null,
        data.target || null,
        data.changes || null,
        data.metadata || null,
        data.description || null,
        data.severity || 'info',
        data.timestamp || new Date(),
      ]
    );
    return format(rows[0]);
  },

  async logEvent(data) {
    return this.create({ ...data, timestamp: new Date() });
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM audit_logs WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByActor(actorId, options = {}) {
    const limit = options.limit || 100;
    const conds = ['actor_id=$1'];
    const vals = [actorId];
    let i = 2;
    if (options.category) { conds.push(`event_category=$${i++}`); vals.push(options.category); }
    vals.push(limit);
    const { rows } = await query(
      `SELECT * FROM audit_logs WHERE ${conds.join(' AND ')} ORDER BY timestamp DESC LIMIT $${i}`, vals
    );
    return rows.map(format);
  },

  async findByTarget(targetType, targetId, options = {}) {
    const limit = options.limit || 50;
    const { rows } = await query(
      'SELECT * FROM audit_logs WHERE target_type=$1 AND target_id=$2 ORDER BY timestamp DESC LIMIT $3',
      [targetType, targetId, limit]
    );
    return rows.map(format);
  },

  async findByEventType(eventType, options = {}) {
    const limit = options.limit || 100;
    const { rows } = await query(
      'SELECT * FROM audit_logs WHERE event_type=$1 ORDER BY timestamp DESC LIMIT $2',
      [eventType, limit]
    );
    return rows.map(format);
  },

  async findCritical(startDate, endDate) {
    const { rows } = await query(
      `SELECT * FROM audit_logs WHERE severity='critical' AND timestamp >= $1 AND timestamp <= $2
       ORDER BY timestamp DESC`,
      [startDate, endDate]
    );
    return rows.map(format);
  },

  async getActivitySummary(actorId, startDate, endDate) {
    const { rows } = await query(
      `SELECT event_category, COUNT(*) AS cnt FROM audit_logs
       WHERE actor_id=$1 AND timestamp >= $2 AND timestamp <= $3
       GROUP BY event_category`,
      [actorId, startDate, endDate]
    );
    const summary = {};
    for (const r of rows) { summary[r.event_category] = parseInt(r.cnt, 10); }
    return summary;
  },

  async find(filters = {}, options = {}) {
    const { limit = 100, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.eventType)     { conds.push(`event_type=$${i++}`);     vals.push(filters.eventType); }
    if (filters.eventCategory) { conds.push(`event_category=$${i++}`); vals.push(filters.eventCategory); }
    const actorId = filters.actorId || filters['actor.id'];
    if (actorId)               { conds.push(`actor_id=$${i++}`);       vals.push(actorId); }
    const targetId = filters.targetId || filters['target.id'];
    if (targetId)              { conds.push(`target_id=$${i++}`);      vals.push(targetId); }
    if (filters.severity)      { conds.push(`severity=$${i++}`);       vals.push(filters.severity); }
    const { rows } = await query(
      `SELECT * FROM audit_logs WHERE ${conds.join(' AND ')} ORDER BY timestamp DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.eventType)     { conds.push(`event_type=$${i++}`);     vals.push(filters.eventType); }
    if (filters.eventCategory) { conds.push(`event_category=$${i++}`); vals.push(filters.eventCategory); }
    const actorId = filters.actorId || filters['actor.id'];
    if (actorId)               { conds.push(`actor_id=$${i++}`);       vals.push(actorId); }
    if (filters.severity)      { conds.push(`severity=$${i++}`);       vals.push(filters.severity); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM audit_logs WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM audit_logs WHERE id=$1', [id]);
  },
};

export default AuditLogModel;
