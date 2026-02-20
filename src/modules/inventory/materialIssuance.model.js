import { query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  const iso = {
    id:          row.id,
    entityId:    row.id,
    job:         row.job_id,
    jobId:       row.job_id,
    clientTag:   row.client_tag,
    issuedTo:    row.issued_to,
    issuedBy:    row.issued_by,
    materials:   row.materials || [],
    status:      row.status,
    issuedAt:    row.issued_at,
    receivedAt:  row.received_at,
    returns:     row.returns || [],
    losses:      row.losses || [],
    notes:       row.notes,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };

  Object.defineProperties(iso, {
    totalMaterialCount: { get() { return (this.materials || []).length; }},
    hasReturns:         { get() { return (this.returns || []).length > 0; }},
    hasLosses:          { get() { return (this.losses || []).length > 0; }},
    totalPenalty:       { get() {
      return (this.losses || []).reduce((s, l) => s + (l.penaltyAmount || 0), 0);
    }},
  });

  iso.toSafeJSON = () => ({
    ...iso, totalMaterialCount: iso.totalMaterialCount, hasReturns: iso.hasReturns,
    hasLosses: iso.hasLosses, totalPenalty: iso.totalPenalty,
  });

  return iso;
}

const MaterialIssuanceModel = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO inventory_issuances
         (job_id, client_tag, issued_to, issued_by, materials, status, issued_at, received_at, returns, losses, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        data.job || data.jobId,
        data.clientTag || null,
        data.issuedTo,
        data.issuedBy,
        data.materials || [],
        data.status || 'issued',
        data.issuedAt || new Date(),
        data.receivedAt || null,
        data.returns || [],
        data.losses || [],
        data.notes || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM inventory_issuances WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      materials:  'materials',
      status:     'status',
      receivedAt: 'received_at',
      returns:    'returns',
      losses:     'losses',
      notes:      'notes',
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
      `UPDATE inventory_issuances SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async acknowledgeReceipt(id) {
    return this.findByIdAndUpdate(id, { status: 'received', receivedAt: new Date() });
  },

  async recordReturn(id, materialId, quantity, reason, receivedBy) {
    const iso = await this.findById(id);
    if (!iso) return null;
    const returns = [...(iso.returns || []), {
      material: materialId, quantityReturned: quantity, reason,
      returnedAt: new Date().toISOString(), receivedBy,
    }];
    const materials = iso.materials || [];
    const totalIssued   = materials.reduce((s, m) => s + m.quantityIssued, 0);
    const totalReturned = returns.reduce((s, r) => s + r.quantityReturned, 0);
    const status = totalReturned >= totalIssued ? 'fully_returned' : 'partially_returned';
    return this.findByIdAndUpdate(id, { returns, status });
  },

  async recordLoss(id, materialId, quantity, reason, penaltyAmount = 0) {
    const iso = await this.findById(id);
    if (!iso) return null;
    const losses = [...(iso.losses || []), {
      material: materialId, quantityLost: quantity, reason,
      reportedAt: new Date().toISOString(), penaltyAmount,
    }];
    return this.findByIdAndUpdate(id, { losses, status: 'lost' });
  },

  async findByJob(jobId) {
    const { rows } = await query(
      'SELECT * FROM inventory_issuances WHERE job_id=$1 LIMIT 1', [jobId]
    );
    return format(rows[0] || null);
  },

  async findByTailor(tailorId, status = null) {
    if (status) {
      const { rows } = await query(
        'SELECT * FROM inventory_issuances WHERE issued_to=$1 AND status=$2 ORDER BY issued_at DESC',
        [tailorId, status]
      );
      return rows.map(format);
    }
    const { rows } = await query(
      'SELECT * FROM inventory_issuances WHERE issued_to=$1 ORDER BY issued_at DESC', [tailorId]
    );
    return rows.map(format);
  },

  async findPendingReceipt() {
    const { rows } = await query(
      `SELECT * FROM inventory_issuances WHERE status='issued' ORDER BY issued_at ASC`
    );
    return rows.map(format);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.job)       { conds.push(`job_id=$${i++}`);    vals.push(filters.job); }
    if (filters.clientTag) { conds.push(`client_tag=$${i++}`); vals.push(filters.clientTag); }
    if (filters.issuedTo)  { conds.push(`issued_to=$${i++}`); vals.push(filters.issuedTo); }
    if (filters.status)    { conds.push(`status=$${i++}`);    vals.push(filters.status); }
    const { rows } = await query(
      `SELECT * FROM inventory_issuances WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.job)      { conds.push(`job_id=$${i++}`);    vals.push(filters.job); }
    if (filters.issuedTo) { conds.push(`issued_to=$${i++}`); vals.push(filters.issuedTo); }
    if (filters.status)   { conds.push(`status=$${i++}`);    vals.push(filters.status); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM inventory_issuances WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM inventory_issuances WHERE id=$1', [id]);
  },
};

export default MaterialIssuanceModel;
