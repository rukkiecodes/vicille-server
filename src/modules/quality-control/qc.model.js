import { getRedisClient } from '../../infrastructure/database/redis.js';

// QCReview Entity class
class Model {
  // Get parsed criteria
  get criteriaParsed() {
    return this.criteria ? JSON.parse(this.criteria) : null;
  }

  // Get parsed group photo review
  get groupPhotoReviewParsed() {
    return this.groupPhotoReview ? JSON.parse(this.groupPhotoReview) : null;
  }

  // Get parsed issues
  get issuesParsed() {
    return this.issues ? JSON.parse(this.issues) : [];
  }

  // Check if approved
  get isApproved() {
    return this.decision === 'approved';
  }

  // Check if has issues
  get hasIssues() {
    const issues = this.issuesParsed;
    return issues && issues.length > 0;
  }

  // Get critical issue count
  get criticalIssueCount() {
    const issues = this.issuesParsed;
    if (!issues) return 0;
    return issues.filter((i) => i.severity === 'critical').length;
  }

  // Convert to safe JSON
  toSafeJSON() {
    return {
      id: this.entityId,
      job: this.job,
      order: this.order,
      tailor: this.tailor,
      reviewedBy: this.reviewedBy,
      decision: this.decision,
      criteria: this.criteriaParsed,
      groupPhotoReview: this.groupPhotoReviewParsed,
      issues: this.issuesParsed,
      feedback: this.feedback,
      internalNotes: this.internalNotes,
      reworkRequired: this.reworkRequired,
      reworkDeadline: this.reworkDeadline,
      reworkCompleted: this.reworkCompleted,
      reviewedAt: this.reviewedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isApproved: this.isApproved,
      hasIssues: this.hasIssues,
      criticalIssueCount: this.criticalIssueCount,
    };
  }
}

// QCReview Schema for Redis OM
// Schema definition removed
// Repository holder
/**
 * Calculate overall rating from criteria
 */
const calculateOverallRating = (criteria) => {
  if (!criteria) return criteria;

  const ratings = [
    criteria.craftsmanship,
    criteria.accuracy,
    criteria.finishing,
    criteria.timeliness,
  ].filter((r) => r !== undefined);

  if (ratings.length > 0) {
    criteria.overallRating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  }

  return criteria;
};

// Static methods
const QCReviewModel = {
  /**
   * Create a new QC review
   */
  async create(reviewData) {
    const repo = await getQCReviewRepository();

    const now = new Date();

    // Calculate overall rating if criteria provided
    let criteria = reviewData.criteria;
    if (criteria) {
      criteria = calculateOverallRating(criteria);
    }

    const qcReview = await repo.save({
      job: reviewData.job,
      order: reviewData.order,
      tailor: reviewData.tailor,
      reviewedBy: reviewData.reviewedBy,
      decision: reviewData.decision,
      criteria: criteria ? JSON.stringify(criteria) : null,
      groupPhotoReview: reviewData.groupPhotoReview ? JSON.stringify(reviewData.groupPhotoReview) : null,
      issues: reviewData.issues ? JSON.stringify(reviewData.issues) : '[]',
      feedback: reviewData.feedback,
      internalNotes: reviewData.internalNotes,
      reworkRequired: reviewData.reworkRequired || false,
      reworkDeadline: reviewData.reworkDeadline,
      reworkCompleted: reviewData.reworkCompleted || false,
      reviewedAt: reviewData.reviewedAt || now,
      createdAt: now,
      updatedAt: now,
    });

    return qcReview;
  },

  /**
   * Find QC review by ID
   */
  async findById(id) {
    const repo = await getQCReviewRepository();
    const qcReview = await repo.fetch(id);
    if (!qcReview || !qcReview.job) return null;
    return qcReview;
  },

  /**
   * Find QC review by job
   */
  async findByJob(jobId) {
    const repo = await getQCReviewRepository();
    return repo.search()
      .where('job').equals(jobId)
      .return.first();
  },

  /**
   * Find QC reviews by tailor
   */
  async findByTailor(tailorId) {
    const repo = await getQCReviewRepository();
    return repo.search()
      .where('tailor').equals(tailorId)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Find pending rework
   */
  async findPendingRework() {
    const repo = await getQCReviewRepository();
    const reviews = await repo.search()
      .where('reworkRequired').equals(true)
      .where('reworkCompleted').equals(false)
      .return.all();
    return reviews;
  },

  /**
   * Update QC review by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getQCReviewRepository();
    const qcReview = await repo.fetch(id);
    if (!qcReview || !qcReview.job) return null;

    // Handle criteria overall rating calculation
    if (updateData.criteria && typeof updateData.criteria === 'object') {
      updateData.criteria = calculateOverallRating(updateData.criteria);
    }

    const jsonFields = ['criteria', 'groupPhotoReview', 'issues'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    Object.assign(qcReview, updateData, { updatedAt: new Date() });
    await repo.save(qcReview);

    return options.new !== false ? qcReview : null;
  },

  /**
   * Get tailor QC stats
   */
  async getTailorStats(tailorId) {
    const repo = await getQCReviewRepository();
    const reviews = await repo.search()
      .where('tailor').equals(tailorId)
      .return.all();

    const stats = { approved: 0, rejected: 0, needs_rework: 0 };
    for (const review of reviews) {
      if (stats[review.decision] !== undefined) {
        stats[review.decision]++;
      }
    }

    return stats;
  },

  /**
   * Find QC reviews with filters
   */
  async find(query = {}, options = {}) {
    const repo = await getQCReviewRepository();
    let search = repo.search();

    if (query.job) {
      search = search.where('job').equals(query.job);
    }
    if (query.tailor) {
      search = search.where('tailor').equals(query.tailor);
    }
    if (query.reviewedBy) {
      search = search.where('reviewedBy').equals(query.reviewedBy);
    }
    if (query.decision) {
      search = search.where('decision').equals(query.decision);
    }

    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    return search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);
  },

  /**
   * Count QC reviews
   */
  async countDocuments(query = {}) {
    const repo = await getQCReviewRepository();
    let search = repo.search();

    if (query.job) {
      search = search.where('job').equals(query.job);
    }
    if (query.tailor) {
      search = search.where('tailor').equals(query.tailor);
    }
    if (query.decision) {
      search = search.where('decision').equals(query.decision);
    }

    return search.return.count();
  },

  /**
   * Delete QC review
   */
  async delete(id) {
    const repo = await getQCReviewRepository();
    await repo.remove(id);
  },
};

export default QCReviewModel;
