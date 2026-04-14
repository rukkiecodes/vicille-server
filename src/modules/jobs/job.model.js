import { query } from '../../infrastructure/database/postgres.js';
import { generateJobNumber } from '../../core/utils/randomCode.js';
import { JOB_STATUS } from '../../core/constants/tailorStatus.js';

function format(row) {
  if (!row) return null;
  const j = {
    id:                   row.id,
    entityId:             row.id,
    jobNumber:            row.job_number,
    clientTag:            row.client_tag,
    order:                row.order_id,
    orderId:              row.order_id,
    orderItems:           row.order_item_ids || [],
    user:                 row.user_id,
    userId:               row.user_id,
    tailor:               row.tailor_id,
    tailorId:             row.tailor_id,
    assignedBy:           row.assigned_by,
    assignmentType:       row.assignment_type,
    measurements:         row.measurements,
    stylistInstructions:  row.stylist_instructions,
    notes:                row.notes || null,
    priority:             row.priority || null,
    materialsRequired:    row.materials_required || [],
    materialsIssued:      row.materials_issued,
    materialsReceivedAt:  row.materials_received_at,
    materialsReceivedBy:  row.materials_received_by,
    dueDate:              row.due_date,
    startedAt:            row.started_at,
    completedAt:          row.completed_at,
    status:               row.status,
    statusHistory:        row.status_history || [],
    completionProof:      row.completion_proof,
    qcReview:             row.qc_review_id,
    commission:           row.commission,
    payout:               row.payout_id,
    isPaid:               row.is_paid,
    reassignments:        row.reassignments || [],
    isFlagged:            row.is_flagged,
    flagReason:           row.flag_reason,
    flaggedBy:            row.flagged_by,
    resolvedAt:           row.resolved_at,
    revisionNotes:        row.revision_notes || null,
    createdAt:            row.created_at,
    updatedAt:            row.updated_at,
  };

  Object.defineProperties(j, {
    isOverdue: { get() {
      if (!this.dueDate) return false;
      const done = [JOB_STATUS.COMPLETED, JOB_STATUS.QC_APPROVED, JOB_STATUS.QC_REJECTED];
      if (done.includes(this.status)) return false;
      return new Date() > new Date(this.dueDate);
    }},
    daysUntilDue: { get() {
      if (!this.dueDate) return null;
      return Math.ceil((new Date(this.dueDate) - new Date()) / 86400000);
    }},
    isComplete: { get() {
      return [JOB_STATUS.COMPLETED, JOB_STATUS.QC_APPROVED].includes(this.status);
    }},
  });

  j.toSafeJSON = () => ({
    ...j, isOverdue: j.isOverdue, daysUntilDue: j.daysUntilDue, isComplete: j.isComplete,
  });

  return j;
}

const JobModel = {
  async create(data) {
    const jobNumber = data.jobNumber || generateJobNumber();
    const initialStatusHistory = [{
      status: data.status || JOB_STATUS.ASSIGNED,
      changedAt: new Date().toISOString(),
      notes: 'Job created',
    }];

    const { rows } = await query(
      `INSERT INTO jobs
         (job_number, client_tag, order_id, order_item_ids, user_id, tailor_id, assigned_by,
          assignment_type, measurements, stylist_instructions, materials_required, materials_issued,
          materials_received_at, materials_received_by, due_date, started_at, completed_at,
          status, status_history, completion_proof, qc_review_id, commission, payout_id, is_paid,
          reassignments, is_flagged, flag_reason, flagged_by, resolved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       RETURNING *`,
      [
        jobNumber,
        data.clientTag || null,
        data.order || data.orderId || null,
        data.orderItems || [],
        data.user || data.userId || null,
        data.tailor || data.tailorId || null,
        data.assignedBy || null,
        data.assignmentType || 'manual',
        data.measurements ? JSON.stringify(data.measurements) : null,
        data.stylistInstructions || null,
        JSON.stringify(data.materialsRequired || []),
        data.materialsIssued || false,
        data.materialsReceivedAt || null,
        data.materialsReceivedBy || null,
        data.dueDate || null,
        data.startedAt || null,
        data.completedAt || null,
        data.status || JOB_STATUS.ASSIGNED,
        JSON.stringify(initialStatusHistory),
        data.completionProof ? JSON.stringify(data.completionProof) : null,
        data.qcReview || data.qcReviewId || null,
        data.commission || 0,
        data.payout || data.payoutId || null,
        data.isPaid || false,
        JSON.stringify(data.reassignments || []),
        data.isFlagged || false,
        data.flagReason || null,
        data.flaggedBy || null,
        data.resolvedAt || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM jobs WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByJobNumber(jobNumber) {
    const { rows } = await query('SELECT * FROM jobs WHERE job_number=$1', [jobNumber]);
    return format(rows[0] || null);
  },

  async findByClientTag(clientTag) {
    const { rows } = await query('SELECT * FROM jobs WHERE client_tag=$1', [clientTag]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      clientTag:           'client_tag',
      tailor:              'tailor_id',
      tailorId:            'tailor_id',
      assignedBy:          'assigned_by',
      assignmentType:      'assignment_type',
      measurements:        'measurements',
      stylistInstructions: 'stylist_instructions',
      materialsRequired:   'materials_required',
      materialsIssued:     'materials_issued',
      materialsReceivedAt: 'materials_received_at',
      materialsReceivedBy: 'materials_received_by',
      dueDate:             'due_date',
      startedAt:           'started_at',
      completedAt:         'completed_at',
      status:              'status',
      statusHistory:       'status_history',
      completionProof:     'completion_proof',
      qcReview:            'qc_review_id',
      commission:          'commission',
      payout:              'payout_id',
      isPaid:              'is_paid',
      reassignments:       'reassignments',
      isFlagged:           'is_flagged',
      flagReason:          'flag_reason',
      flaggedBy:           'flagged_by',
      resolvedAt:          'resolved_at',
      revisionNotes:       'revision_notes',
    };
    // JSONB columns must be serialised to a JSON string so the pg driver
    // doesn't accidentally format arrays/objects as Postgres array literals.
    const jsonbCols = new Set([
      'status_history', 'measurements', 'materials_required',
      'reassignments', 'completion_proof',
    ]);
    const fields = [];
    const values = [];
    let i = 1;
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) {
        fields.push(`${dbCol}=$${i++}`);
        const val = updates[jsKey];
        values.push(jsonbCols.has(dbCol) && val !== null && val !== undefined
          ? JSON.stringify(val)
          : val);
      }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE jobs SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async updateStatus(id, newStatus, notes) {
    const job = await this.findById(id);
    if (!job) return null;
    const statusHistory = [...(job.statusHistory || []), {
      status: newStatus, changedAt: new Date().toISOString(), notes,
    }];
    const updates = { status: newStatus, statusHistory };
    if (newStatus === JOB_STATUS.IN_PROGRESS && !job.startedAt) updates.startedAt = new Date();
    if (newStatus === JOB_STATUS.COMPLETED) updates.completedAt = new Date();
    return this.findByIdAndUpdate(id, updates);
  },

  async acknowledgeMaterialReceipt(id, tailorId) {
    const job = await this.findById(id);
    if (!job) return null;
    const statusHistory = [...(job.statusHistory || []), {
      status: JOB_STATUS.IN_PROGRESS, changedAt: new Date().toISOString(), notes: 'Materials received',
    }];
    return this.findByIdAndUpdate(id, {
      materialsReceivedAt: new Date(),
      materialsReceivedBy: tailorId,
      status: JOB_STATUS.IN_PROGRESS,
      statusHistory,
      startedAt: job.startedAt || new Date(),
    });
  },

  async submitCompletionProof(id, proofData) {
    const job = await this.findById(id);
    if (!job) return null;
    const proof = {
      ...proofData,
      groupPhoto: { ...proofData.groupPhoto, uploadedAt: new Date().toISOString() },
    };
    const statusHistory = [...(job.statusHistory || []), {
      status: JOB_STATUS.COMPLETED, changedAt: new Date().toISOString(), notes: 'Completion proof submitted',
    }];
    return this.findByIdAndUpdate(id, {
      completionProof: proof,
      status: JOB_STATUS.COMPLETED,
      completedAt: new Date(),
      statusHistory,
    });
  },

  async reassign(id, newTailorId, reason, reassignedBy) {
    const job = await this.findById(id);
    if (!job) return null;
    const reassignments = [...(job.reassignments || []), {
      fromTailor: job.tailor, toTailor: newTailorId, reason, reassignedBy,
      reassignedAt: new Date().toISOString(),
    }];
    return this.findByIdAndUpdate(id, { tailor: newTailorId, assignmentType: 'reassigned', reassignments });
  },

  async flag(id, reason, flaggedBy) {
    return this.findByIdAndUpdate(id, { isFlagged: true, flagReason: reason, flaggedBy });
  },

  async resolveFlag(id) {
    return this.findByIdAndUpdate(id, { isFlagged: false, resolvedAt: new Date() });
  },

  async findByTailor(tailorId, status = null) {
    if (status) {
      const { rows } = await query(
        'SELECT * FROM jobs WHERE tailor_id=$1 AND status=$2 ORDER BY due_date ASC', [tailorId, status]
      );
      return rows.map(format);
    }
    const { rows } = await query(
      'SELECT * FROM jobs WHERE tailor_id=$1 ORDER BY due_date ASC', [tailorId]
    );
    return rows.map(format);
  },

  async findByOrder(orderId) {
    const { rows } = await query('SELECT * FROM jobs WHERE order_id=$1', [orderId]);
    return rows.map(format);
  },

  async findOverdue() {
    const { rows } = await query(
      `SELECT * FROM jobs WHERE due_date < NOW()
       AND status NOT IN ('completed','qc_approved','qc_rejected')`
    );
    return rows.map(format);
  },

  async findAwaitingQC() {
    const { rows } = await query(`SELECT * FROM jobs WHERE status='under_qc'`);
    return rows.map(format);
  },

  async findUnpaidCompleted() {
    const { rows } = await query(`SELECT * FROM jobs WHERE status='qc_approved' AND is_paid=FALSE`);
    return rows.map(format);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.tailor)               { conds.push(`tailor_id=$${i++}`); vals.push(filters.tailor); }
    if (filters.status)               { conds.push(`status=$${i++}`);    vals.push(filters.status); }
    if (filters.order)                { conds.push(`order_id=$${i++}`);  vals.push(filters.order); }
    if (filters.isPaid !== undefined) { conds.push(`is_paid=$${i++}`);   vals.push(filters.isPaid); }
    const { rows } = await query(
      `SELECT * FROM jobs WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.tailor) { conds.push(`tailor_id=$${i++}`); vals.push(filters.tailor); }
    if (filters.status) { conds.push(`status=$${i++}`);    vals.push(filters.status); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM jobs WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM jobs WHERE id=$1', [id]);
  },
};

export default JobModel;
