import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generatePayoutNumber } from '../../core/utils/randomCode.js';
import { PAYOUT_STATUS } from '../../core/constants/paymentStatus.js';

// Payout Entity class
class Model {
  // Get parsed period
  get periodParsed() {
    return this.period ? JSON.parse(this.period) : null;
  }

  // Get parsed breakdown
  get breakdownParsed() {
    return this.breakdown ? JSON.parse(this.breakdown) : [];
  }

  // Get parsed bank details
  get bankDetailsParsed() {
    return this.bankDetails ? JSON.parse(this.bankDetails) : null;
  }

  // Get parsed provider response
  get providerResponseParsed() {
    return this.providerResponse ? JSON.parse(this.providerResponse) : null;
  }

  // Get parsed jobs array
  get jobsParsed() {
    return this.jobs ? JSON.parse(this.jobs) : [];
  }

  // Get formatted amount
  get formattedAmount() {
    const amount = this.totalAmount / 100;
    return `₦${amount.toLocaleString()}`;
  }

  // Check if payout is paid
  get isPaid() {
    return this.status === PAYOUT_STATUS.PAID;
  }

  // Get job count
  get jobCount() {
    const jobs = this.jobsParsed;
    return jobs?.length || 0;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      payoutNumber: this.payoutNumber,
      tailor: this.tailor,
      period: this.periodParsed,
      jobs: this.jobsParsed,
      totalAmount: this.totalAmount,
      currency: this.currency,
      breakdown: this.breakdownParsed,
      advanceAmount: this.advanceAmount,
      netAmount: this.netAmount,
      status: this.status,
      paymentMethod: this.paymentMethod,
      bankDetails: this.bankDetailsParsed,
      processedBy: this.processedBy,
      processedAt: this.processedAt,
      providerReference: this.providerReference,
      providerResponse: this.providerResponseParsed,
      paidAt: this.paidAt,
      failedAt: this.failedAt,
      failureReason: this.failureReason,
      formattedAmount: this.formattedAmount,
      isPaid: this.isPaid,
      jobCount: this.jobCount,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// Payout Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const PayoutModel = {
  /**
   * Create a new payout
   */
  async create(payoutData) {
    const repo = await getPayoutRepository();

    const now = new Date();
    const periodData = payoutData.period || {};
    const payoutNumber = payoutData.payoutNumber || generatePayoutNumber(periodData.weekNumber || 1);

    // Calculate net amount
    const totalAmount = payoutData.totalAmount || 0;
    const advanceAmount = payoutData.advanceAmount || 0;
    const netAmount = totalAmount - advanceAmount;

    const payout = await repo.save({
      payoutNumber,
      tailor: payoutData.tailor,
      period: payoutData.period ? JSON.stringify(payoutData.period) : null,
      jobs: payoutData.jobs ? JSON.stringify(payoutData.jobs) : '[]',
      totalAmount,
      currency: payoutData.currency || 'NGN',
      breakdown: payoutData.breakdown ? JSON.stringify(payoutData.breakdown) : '[]',
      advanceAmount,
      netAmount: payoutData.netAmount !== undefined ? payoutData.netAmount : netAmount,
      status: payoutData.status || PAYOUT_STATUS.PENDING,
      paymentMethod: payoutData.paymentMethod || 'bank_transfer',
      bankDetails: payoutData.bankDetails ? JSON.stringify(payoutData.bankDetails) : null,
      processedBy: payoutData.processedBy,
      processedAt: payoutData.processedAt,
      providerReference: payoutData.providerReference,
      providerResponse: payoutData.providerResponse ? JSON.stringify(payoutData.providerResponse) : null,
      paidAt: payoutData.paidAt,
      failedAt: payoutData.failedAt,
      failureReason: payoutData.failureReason,
      createdAt: now,
      updatedAt: now,
    });

    return payout;
  },

  /**
   * Find payout by ID
   */
  async findById(id) {
    const repo = await getPayoutRepository();
    const payout = await repo.fetch(id);
    if (!payout || !payout.payoutNumber) return null;
    return payout;
  },

  /**
   * Find payout by payout number
   */
  async findByPayoutNumber(payoutNumber) {
    const repo = await getPayoutRepository();
    const payout = await repo.search()
      .where('payoutNumber').equals(payoutNumber)
      .return.first();
    return payout;
  },

  /**
   * Update payout by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getPayoutRepository();
    const payout = await repo.fetch(id);
    if (!payout || !payout.payoutNumber) return null;

    // Serialize complex objects
    const jsonFields = ['period', 'jobs', 'breakdown', 'bankDetails', 'providerResponse'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Recalculate net amount if relevant fields are updated
    if (updateData.totalAmount !== undefined || updateData.advanceAmount !== undefined) {
      const totalAmount = updateData.totalAmount !== undefined ? updateData.totalAmount : payout.totalAmount;
      const advanceAmount = updateData.advanceAmount !== undefined ? updateData.advanceAmount : payout.advanceAmount;
      updateData.netAmount = totalAmount - advanceAmount;
    }

    // Update fields
    Object.assign(payout, updateData, { updatedAt: new Date() });
    await repo.save(payout);

    return options.new !== false ? payout : null;
  },

  /**
   * Mark payout as processing
   */
  async markAsProcessing(id, processedBy) {
    const repo = await getPayoutRepository();
    const payout = await repo.fetch(id);
    if (!payout || !payout.payoutNumber) return null;

    payout.status = PAYOUT_STATUS.PROCESSING;
    payout.processedBy = processedBy;
    payout.processedAt = new Date();
    payout.updatedAt = new Date();
    await repo.save(payout);

    return payout;
  },

  /**
   * Mark payout as paid
   */
  async markAsPaid(id, providerResponse) {
    const repo = await getPayoutRepository();
    const payout = await repo.fetch(id);
    if (!payout || !payout.payoutNumber) return null;

    payout.status = PAYOUT_STATUS.PAID;
    payout.paidAt = new Date();
    payout.providerReference = providerResponse?.reference;
    payout.providerResponse = providerResponse ? JSON.stringify(providerResponse) : null;
    payout.updatedAt = new Date();
    await repo.save(payout);

    return payout;
  },

  /**
   * Mark payout as failed
   */
  async markAsFailed(id, reason) {
    const repo = await getPayoutRepository();
    const payout = await repo.fetch(id);
    if (!payout || !payout.payoutNumber) return null;

    payout.status = PAYOUT_STATUS.FAILED;
    payout.failedAt = new Date();
    payout.failureReason = reason;
    payout.updatedAt = new Date();
    await repo.save(payout);

    return payout;
  },

  /**
   * Find payouts by tailor
   */
  async findByTailor(tailorId) {
    const repo = await getPayoutRepository();
    return repo.search()
      .where('tailor').equals(tailorId)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Find pending payouts
   */
  async findPending() {
    const repo = await getPayoutRepository();
    return repo.search()
      .where('status').equals(PAYOUT_STATUS.PENDING)
      .sortBy('createdAt', 'ASC')
      .return.all();
  },

  /**
   * Get tailor earnings summary
   */
  async getTailorEarningsSummary(tailorId) {
    const repo = await getPayoutRepository();
    const payouts = await repo.search()
      .where('tailor').equals(tailorId)
      .return.all();

    const summary = {};
    for (const payout of payouts) {
      if (!summary[payout.status]) {
        summary[payout.status] = { total: 0, count: 0 };
      }
      summary[payout.status].total += payout.totalAmount || 0;
      summary[payout.status].count += 1;
    }

    return summary;
  },

  /**
   * Find all payouts with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getPayoutRepository();
    let search = repo.search();

    // Apply filters
    if (query.tailor) {
      search = search.where('tailor').equals(query.tailor);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const payouts = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return payouts;
  },

  /**
   * Count payouts
   */
  async countDocuments(query = {}) {
    const repo = await getPayoutRepository();
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
   * Delete payout (hard delete)
   */
  async delete(id) {
    const repo = await getPayoutRepository();
    await repo.remove(id);
  },
};

export default PayoutModel;
