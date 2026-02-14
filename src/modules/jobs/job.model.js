import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateJobNumber } from '../../core/utils/randomCode.js';
import { JOB_STATUS } from '../../core/constants/tailorStatus.js';

// Job Entity class
class Model {
  // Get parsed materials required
  get materialsRequiredParsed() {
    return this.materialsRequired ? JSON.parse(this.materialsRequired) : [];
  }

  // Get parsed status history
  get statusHistoryParsed() {
    return this.statusHistory ? JSON.parse(this.statusHistory) : [];
  }

  // Get parsed completion proof
  get completionProofParsed() {
    return this.completionProof ? JSON.parse(this.completionProof) : null;
  }

  // Get parsed reassignments
  get reassignmentsParsed() {
    return this.reassignments ? JSON.parse(this.reassignments) : [];
  }

  // Get parsed measurements
  get measurementsParsed() {
    return this.measurements ? JSON.parse(this.measurements) : null;
  }

  // Get parsed order items
  get orderItemsParsed() {
    return this.orderItems ? JSON.parse(this.orderItems) : [];
  }

  // Check if overdue
  get isOverdue() {
    if (!this.dueDate) return false;
    const completedStatuses = [JOB_STATUS.COMPLETED, JOB_STATUS.QC_APPROVED, JOB_STATUS.QC_REJECTED];
    if (completedStatuses.includes(this.status)) return false;
    return new Date() > new Date(this.dueDate);
  }

  // Get days until due
  get daysUntilDue() {
    if (!this.dueDate) return null;
    const now = new Date();
    const diff = new Date(this.dueDate) - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // Check if complete
  get isComplete() {
    return [JOB_STATUS.COMPLETED, JOB_STATUS.QC_APPROVED].includes(this.status);
  }

  // Convert to safe JSON
  toSafeJSON() {
    return {
      id: this.entityId,
      jobNumber: this.jobNumber,
      clientTag: this.clientTag,
      order: this.order,
      orderItems: this.orderItemsParsed,
      user: this.user,
      tailor: this.tailor,
      assignedBy: this.assignedBy,
      assignmentType: this.assignmentType,
      measurements: this.measurementsParsed,
      stylistInstructions: this.stylistInstructions,
      materialsRequired: this.materialsRequiredParsed,
      materialsIssued: this.materialsIssued,
      materialsReceivedAt: this.materialsReceivedAt,
      materialsReceivedBy: this.materialsReceivedBy,
      dueDate: this.dueDate,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      status: this.status,
      statusHistory: this.statusHistoryParsed,
      completionProof: this.completionProofParsed,
      qcReview: this.qcReview,
      commission: this.commission,
      payout: this.payout,
      isPaid: this.isPaid,
      reassignments: this.reassignmentsParsed,
      isFlagged: this.isFlagged,
      flagReason: this.flagReason,
      flaggedBy: this.flaggedBy,
      resolvedAt: this.resolvedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isOverdue: this.isOverdue,
      daysUntilDue: this.daysUntilDue,
      isComplete: this.isComplete,
    };
  }
}

// Job Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods
const JobModel = {
  /**
   * Create a new job
   */
  async create(jobData) {
    const repo = await getJobRepository();

    const now = new Date();
    const jobNumber = jobData.jobNumber || generateJobNumber();

    const initialStatusHistory = [{
      status: jobData.status || JOB_STATUS.ASSIGNED,
      changedAt: now.toISOString(),
      notes: 'Job created',
    }];

    const job = await repo.save({
      jobNumber,
      clientTag: jobData.clientTag,
      order: jobData.order,
      orderItems: jobData.orderItems ? JSON.stringify(jobData.orderItems) : '[]',
      user: jobData.user,
      tailor: jobData.tailor,
      assignedBy: jobData.assignedBy,
      assignmentType: jobData.assignmentType || 'manual',
      measurements: jobData.measurements ? JSON.stringify(jobData.measurements) : null,
      stylistInstructions: jobData.stylistInstructions,
      materialsRequired: jobData.materialsRequired ? JSON.stringify(jobData.materialsRequired) : '[]',
      materialsIssued: jobData.materialsIssued || false,
      materialsReceivedAt: jobData.materialsReceivedAt,
      materialsReceivedBy: jobData.materialsReceivedBy,
      dueDate: jobData.dueDate,
      startedAt: jobData.startedAt,
      completedAt: jobData.completedAt,
      status: jobData.status || JOB_STATUS.ASSIGNED,
      statusHistory: JSON.stringify(initialStatusHistory),
      completionProof: jobData.completionProof ? JSON.stringify(jobData.completionProof) : null,
      qcReview: jobData.qcReview,
      commission: jobData.commission || 0,
      payout: jobData.payout,
      isPaid: jobData.isPaid || false,
      reassignments: jobData.reassignments ? JSON.stringify(jobData.reassignments) : '[]',
      isFlagged: jobData.isFlagged || false,
      flagReason: jobData.flagReason,
      flaggedBy: jobData.flaggedBy,
      resolvedAt: jobData.resolvedAt,
      createdAt: now,
      updatedAt: now,
    });

    return job;
  },

  /**
   * Find job by ID
   */
  async findById(id) {
    const repo = await getJobRepository();
    const job = await repo.fetch(id);
    if (!job || !job.jobNumber) return null;
    return job;
  },

  /**
   * Find job by job number
   */
  async findByJobNumber(jobNumber) {
    const repo = await getJobRepository();
    return repo.search()
      .where('jobNumber').equals(jobNumber)
      .return.first();
  },

  /**
   * Find job by client tag
   */
  async findByClientTag(clientTag) {
    const repo = await getJobRepository();
    return repo.search()
      .where('clientTag').equals(clientTag)
      .return.first();
  },

  /**
   * Update job by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getJobRepository();
    const job = await repo.fetch(id);
    if (!job || !job.jobNumber) return null;

    const jsonFields = ['orderItems', 'measurements', 'materialsRequired', 'statusHistory', 'completionProof', 'reassignments'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    Object.assign(job, updateData, { updatedAt: new Date() });
    await repo.save(job);

    return options.new !== false ? job : null;
  },

  /**
   * Update job status
   */
  async updateStatus(id, newStatus, notes) {
    const repo = await getJobRepository();
    const job = await repo.fetch(id);
    if (!job || !job.jobNumber) return null;

    job.status = newStatus;
    const statusHistory = job.statusHistoryParsed;
    statusHistory.push({
      status: newStatus,
      changedAt: new Date().toISOString(),
      notes,
    });
    job.statusHistory = JSON.stringify(statusHistory);

    if (newStatus === JOB_STATUS.IN_PROGRESS && !job.startedAt) {
      job.startedAt = new Date();
    }
    if (newStatus === JOB_STATUS.COMPLETED) {
      job.completedAt = new Date();
    }

    job.updatedAt = new Date();
    await repo.save(job);

    return job;
  },

  /**
   * Acknowledge material receipt
   */
  async acknowledgeMaterialReceipt(id, tailorId) {
    const repo = await getJobRepository();
    const job = await repo.fetch(id);
    if (!job || !job.jobNumber) return null;

    job.materialsReceivedAt = new Date();
    job.materialsReceivedBy = tailorId;
    job.status = JOB_STATUS.IN_PROGRESS;

    const statusHistory = job.statusHistoryParsed;
    statusHistory.push({
      status: JOB_STATUS.IN_PROGRESS,
      changedAt: new Date().toISOString(),
      notes: 'Materials received',
    });
    job.statusHistory = JSON.stringify(statusHistory);

    if (!job.startedAt) {
      job.startedAt = new Date();
    }
    job.updatedAt = new Date();
    await repo.save(job);

    return job;
  },

  /**
   * Submit completion proof
   */
  async submitCompletionProof(id, proofData) {
    const repo = await getJobRepository();
    const job = await repo.fetch(id);
    if (!job || !job.jobNumber) return null;

    job.completionProof = JSON.stringify({
      ...proofData,
      groupPhoto: {
        ...proofData.groupPhoto,
        uploadedAt: new Date().toISOString(),
      },
    });
    job.status = JOB_STATUS.COMPLETED;
    job.completedAt = new Date();

    const statusHistory = job.statusHistoryParsed;
    statusHistory.push({
      status: JOB_STATUS.COMPLETED,
      changedAt: new Date().toISOString(),
      notes: 'Completion proof submitted',
    });
    job.statusHistory = JSON.stringify(statusHistory);
    job.updatedAt = new Date();

    await repo.save(job);
    return job;
  },

  /**
   * Reassign job
   */
  async reassign(id, newTailorId, reason, reassignedBy) {
    const repo = await getJobRepository();
    const job = await repo.fetch(id);
    if (!job || !job.jobNumber) return null;

    const reassignments = job.reassignmentsParsed;
    reassignments.push({
      fromTailor: job.tailor,
      toTailor: newTailorId,
      reason,
      reassignedBy,
      reassignedAt: new Date().toISOString(),
    });

    job.reassignments = JSON.stringify(reassignments);
    job.tailor = newTailorId;
    job.assignmentType = 'reassigned';
    job.updatedAt = new Date();

    await repo.save(job);
    return job;
  },

  /**
   * Flag job
   */
  async flag(id, reason, flaggedBy) {
    const repo = await getJobRepository();
    const job = await repo.fetch(id);
    if (!job || !job.jobNumber) return null;

    job.isFlagged = true;
    job.flagReason = reason;
    job.flaggedBy = flaggedBy;
    job.updatedAt = new Date();

    await repo.save(job);
    return job;
  },

  /**
   * Resolve flag
   */
  async resolveFlag(id) {
    const repo = await getJobRepository();
    const job = await repo.fetch(id);
    if (!job || !job.jobNumber) return null;

    job.isFlagged = false;
    job.resolvedAt = new Date();
    job.updatedAt = new Date();

    await repo.save(job);
    return job;
  },

  /**
   * Find jobs by tailor
   */
  async findByTailor(tailorId, status = null) {
    const repo = await getJobRepository();
    let search = repo.search().where('tailor').equals(tailorId);
    if (status) {
      search = search.where('status').equals(status);
    }
    return search.sortBy('dueDate', 'ASC').return.all();
  },

  /**
   * Find overdue jobs
   */
  async findOverdue() {
    const repo = await getJobRepository();
    const jobs = await repo.search().return.all();
    const completedStatuses = [JOB_STATUS.COMPLETED, JOB_STATUS.QC_APPROVED, JOB_STATUS.QC_REJECTED];

    return jobs.filter(job => {
      if (!job.dueDate || completedStatuses.includes(job.status)) return false;
      return new Date() > new Date(job.dueDate);
    });
  },

  /**
   * Find jobs awaiting QC
   */
  async findAwaitingQC() {
    const repo = await getJobRepository();
    return repo.search()
      .where('status').equals(JOB_STATUS.UNDER_QC)
      .return.all();
  },

  /**
   * Find unpaid completed jobs
   */
  async findUnpaidCompleted() {
    const repo = await getJobRepository();
    return repo.search()
      .where('status').equals(JOB_STATUS.QC_APPROVED)
      .where('isPaid').equals(false)
      .return.all();
  },

  /**
   * Find jobs by order
   */
  async findByOrder(orderId) {
    const repo = await getJobRepository();
    return repo.search()
      .where('order').equals(orderId)
      .return.all();
  },

  /**
   * Find all jobs with filters
   */
  async find(query = {}, options = {}) {
    const repo = await getJobRepository();
    let search = repo.search();

    if (query.tailor) {
      search = search.where('tailor').equals(query.tailor);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }
    if (query.order) {
      search = search.where('order').equals(query.order);
    }
    if (query.isPaid !== undefined) {
      search = search.where('isPaid').equals(query.isPaid);
    }

    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    return search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);
  },

  /**
   * Count jobs
   */
  async countDocuments(query = {}) {
    const repo = await getJobRepository();
    let search = repo.search();

    if (query.tailor) {
      search = search.where('tailor').equals(query.tailor);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    return search.return.count();
  },

  /**
   * Delete job
   */
  async delete(id) {
    const repo = await getJobRepository();
    await repo.remove(id);
  },
};

export default JobModel;
