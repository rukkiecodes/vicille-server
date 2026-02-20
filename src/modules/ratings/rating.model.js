import { query } from '../../infrastructure/database/postgres.js';

function calcOverall(craftsmanship, accuracy, timeliness, communication) {
  return (craftsmanship + accuracy + timeliness + communication) / 4;
}

function format(row) {
  if (!row) return null;
  const r = {
    id:                  row.id,
    entityId:            row.id,
    tailor:              row.tailor_id,
    tailorId:            row.tailor_id,
    job:                 row.job_id,
    jobId:               row.job_id,
    qcReview:            row.qc_review_id,
    ratedBy:             row.rated_by,
    craftsmanship:       row.craftsmanship,
    accuracy:            row.accuracy,
    timeliness:          row.timeliness,
    communication:       row.communication,
    overallRating:       row.overall_rating,
    comments:            row.comments,
    internalNotes:       row.internal_notes,
    impactsPerformance:  row.impacts_performance,
    ratedAt:             row.rated_at,
    createdAt:           row.created_at,
    updatedAt:           row.updated_at,
  };

  Object.defineProperty(r, 'isPositive', { get() { return this.overallRating >= 4; }});

  r.toSafeJSON = () => ({ ...r, isPositive: r.isPositive });

  return r;
}

const RatingModel = {
  async create(data) {
    const overallRating = data.overallRating || calcOverall(
      data.craftsmanship, data.accuracy, data.timeliness, data.communication
    );
    const { rows } = await query(
      `INSERT INTO ratings
         (tailor_id, job_id, qc_review_id, rated_by, craftsmanship, accuracy, timeliness,
          communication, overall_rating, comments, internal_notes, impacts_performance, rated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        data.tailor || data.tailorId,
        data.job || data.jobId,
        data.qcReview || data.qcReviewId || null,
        data.ratedBy,
        data.craftsmanship,
        data.accuracy,
        data.timeliness,
        data.communication,
        overallRating,
        data.comments || null,
        data.internalNotes || null,
        data.impactsPerformance !== false,
        data.ratedAt || new Date(),
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM ratings WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByTailor(tailorId) {
    const { rows } = await query(
      'SELECT * FROM ratings WHERE tailor_id=$1 ORDER BY created_at DESC', [tailorId]
    );
    return rows.map(format);
  },

  async calculateTailorAverage(tailorId) {
    const { rows } = await query(
      `SELECT
         COUNT(*) AS cnt,
         AVG(overall_rating)   AS avg_overall,
         AVG(craftsmanship)    AS avg_craftsmanship,
         AVG(accuracy)         AS avg_accuracy,
         AVG(timeliness)       AS avg_timeliness,
         AVG(communication)    AS avg_communication
       FROM ratings WHERE tailor_id=$1 AND impacts_performance=TRUE`,
      [tailorId]
    );
    const r = rows[0];
    return {
      avgOverall:       parseFloat(r.avg_overall   || 0),
      avgCraftsmanship: parseFloat(r.avg_craftsmanship || 0),
      avgAccuracy:      parseFloat(r.avg_accuracy   || 0),
      avgTimeliness:    parseFloat(r.avg_timeliness  || 0),
      avgCommunication: parseFloat(r.avg_communication || 0),
      count:            parseInt(r.cnt, 10),
    };
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      craftsmanship:      'craftsmanship',
      accuracy:           'accuracy',
      timeliness:         'timeliness',
      communication:      'communication',
      overallRating:      'overall_rating',
      comments:           'comments',
      internalNotes:      'internal_notes',
      impactsPerformance: 'impacts_performance',
    };
    // Recalculate overall if sub-ratings change
    if ((updates.craftsmanship !== undefined || updates.accuracy !== undefined ||
         updates.timeliness !== undefined || updates.communication !== undefined) &&
        !('overallRating' in updates)) {
      const existing = await this.findById(id);
      if (existing) {
        updates.overallRating = calcOverall(
          updates.craftsmanship  ?? existing.craftsmanship,
          updates.accuracy       ?? existing.accuracy,
          updates.timeliness     ?? existing.timeliness,
          updates.communication  ?? existing.communication,
        );
      }
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
      `UPDATE ratings SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.tailor)  { conds.push(`tailor_id=$${i++}`); vals.push(filters.tailor); }
    if (filters.ratedBy) { conds.push(`rated_by=$${i++}`);  vals.push(filters.ratedBy); }
    const { rows } = await query(
      `SELECT * FROM ratings WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.tailor)  { conds.push(`tailor_id=$${i++}`); vals.push(filters.tailor); }
    if (filters.ratedBy) { conds.push(`rated_by=$${i++}`);  vals.push(filters.ratedBy); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM ratings WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM ratings WHERE id=$1', [id]);
  },
};

export default RatingModel;
