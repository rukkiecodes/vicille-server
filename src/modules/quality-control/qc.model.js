import { query } from '../../infrastructure/database/postgres.js';

function calcCriteriaOverall(criteria) {
  if (!criteria) return criteria;
  const ratings = [criteria.craftsmanship, criteria.accuracy, criteria.finishing, criteria.timeliness]
    .filter(r => r !== undefined);
  if (ratings.length > 0) {
    criteria.overallRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }
  return criteria;
}

function format(row) {
  if (!row) return null;
  const q = {
    id:               row.id,
    entityId:         row.id,
    job:              row.job_id,
    jobId:            row.job_id,
    order:            row.order_id,
    orderId:          row.order_id,
    tailor:           row.tailor_id,
    tailorId:         row.tailor_id,
    reviewedBy:       row.reviewed_by,
    decision:         row.decision,
    criteria:         row.criteria,
    groupPhotoReview: row.group_photo_review,
    issues:           row.issues || [],
    feedback:         row.feedback,
    internalNotes:    row.internal_notes,
    reworkRequired:   row.rework_required,
    reworkDeadline:   row.rework_deadline,
    reworkCompleted:  row.rework_completed,
    reviewedAt:       row.reviewed_at,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };

  Object.defineProperties(q, {
    isApproved:         { get() { return this.decision === 'approved'; }},
    hasIssues:          { get() { return (this.issues || []).length > 0; }},
    criticalIssueCount: { get() {
      return (this.issues || []).filter(i => i.severity === 'critical').length;
    }},
  });

  q.toSafeJSON = () => ({
    ...q, isApproved: q.isApproved, hasIssues: q.hasIssues, criticalIssueCount: q.criticalIssueCount,
  });

  return q;
}

const QCReviewModel = {
  async create(data) {
    let criteria = data.criteria;
    if (criteria) criteria = calcCriteriaOverall({ ...criteria });

    const { rows } = await query(
      `INSERT INTO qc_reviews
         (job_id, order_id, tailor_id, reviewed_by, decision, criteria, group_photo_review,
          issues, feedback, internal_notes, rework_required, rework_deadline, rework_completed, reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [
        data.job || data.jobId,
        data.order || data.orderId || null,
        data.tailor || data.tailorId,
        data.reviewedBy,
        data.decision,
        criteria || null,
        data.groupPhotoReview || null,
        data.issues || [],
        data.feedback || null,
        data.internalNotes || null,
        data.reworkRequired || false,
        data.reworkDeadline || null,
        data.reworkCompleted || false,
        data.reviewedAt || new Date(),
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM qc_reviews WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByJob(jobId) {
    const { rows } = await query('SELECT * FROM qc_reviews WHERE job_id=$1 LIMIT 1', [jobId]);
    return format(rows[0] || null);
  },

  async findByTailor(tailorId) {
    const { rows } = await query(
      'SELECT * FROM qc_reviews WHERE tailor_id=$1 ORDER BY created_at DESC', [tailorId]
    );
    return rows.map(format);
  },

  async findPendingRework() {
    const { rows } = await query(
      'SELECT * FROM qc_reviews WHERE rework_required=TRUE AND rework_completed=FALSE'
    );
    return rows.map(format);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      decision:         'decision',
      criteria:         'criteria',
      groupPhotoReview: 'group_photo_review',
      issues:           'issues',
      feedback:         'feedback',
      internalNotes:    'internal_notes',
      reworkRequired:   'rework_required',
      reworkDeadline:   'rework_deadline',
      reworkCompleted:  'rework_completed',
      reviewedAt:       'reviewed_at',
    };
    if (updates.criteria && typeof updates.criteria === 'object') {
      updates.criteria = calcCriteriaOverall({ ...updates.criteria });
    }
    const fields = [];
    const values = [];
    let i = 1;
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) { fields.push(`${dbCol}=$${i++}`); values.push(updates[jsKey]); }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE qc_reviews SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async getTailorStats(tailorId) {
    const { rows } = await query(
      `SELECT decision, COUNT(*) AS cnt FROM qc_reviews WHERE tailor_id=$1 GROUP BY decision`,
      [tailorId]
    );
    const stats = { approved: 0, rejected: 0, needs_rework: 0 };
    for (const r of rows) {
      if (r.decision in stats) stats[r.decision] = parseInt(r.cnt, 10);
    }
    return stats;
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.job)        { conds.push(`job_id=$${i++}`);       vals.push(filters.job); }
    if (filters.tailor)     { conds.push(`tailor_id=$${i++}`);    vals.push(filters.tailor); }
    if (filters.reviewedBy) { conds.push(`reviewed_by=$${i++}`);  vals.push(filters.reviewedBy); }
    if (filters.decision)   { conds.push(`decision=$${i++}`);     vals.push(filters.decision); }
    const { rows } = await query(
      `SELECT * FROM qc_reviews WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.job)      { conds.push(`job_id=$${i++}`);    vals.push(filters.job); }
    if (filters.tailor)   { conds.push(`tailor_id=$${i++}`); vals.push(filters.tailor); }
    if (filters.decision) { conds.push(`decision=$${i++}`);  vals.push(filters.decision); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM qc_reviews WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM qc_reviews WHERE id=$1', [id]);
  },
};

export default QCReviewModel;
