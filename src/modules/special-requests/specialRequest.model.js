import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateSpecialRequestNumber } from '../../core/utils/randomCode.js';

// SpecialRequest Entity class
class Model {
  // Get parsed inspiration
  get inspirationParsed() {
    return this.inspiration ? JSON.parse(this.inspiration) : [];
  }

  // Get parsed pricing
  get pricingParsed() {
    return this.pricing ? JSON.parse(this.pricing) : null;
  }

  // Get parsed communications
  get communicationsParsed() {
    return this.communications ? JSON.parse(this.communications) : [];
  }

  // Virtual for isQuoteApproved
  get isQuoteApproved() {
    return !!this.quoteApprovedAt;
  }

  // Virtual for isDepositPaid
  get isDepositPaid() {
    return !!this.depositPayment;
  }

  // Virtual for isFullyPaid
  get isFullyPaid() {
    return !!this.depositPayment && !!this.balancePayment;
  }

  // Virtual for formattedQuote
  get formattedQuote() {
    const pricing = this.pricingParsed;
    if (!pricing?.totalQuote) return null;
    const amount = pricing.totalQuote / 100;
    return `₦${amount.toLocaleString()}`;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      requestNumber: this.requestNumber,
      user: this.user,
      eventOccasion: this.eventOccasion,
      description: this.description,
      urgency: this.urgency,
      inspiration: this.inspirationParsed,
      pricing: this.pricingParsed,
      quoteApprovedBy: this.quoteApprovedBy,
      quoteApprovedAt: this.quoteApprovedAt,
      depositPayment: this.depositPayment,
      balancePayment: this.balancePayment,
      measurement: this.measurement,
      order: this.order,
      status: this.status,
      reviewedBy: this.reviewedBy,
      reviewNotes: this.reviewNotes,
      communications: this.communicationsParsed,
      requestedDeliveryDate: this.requestedDeliveryDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isQuoteApproved: this.isQuoteApproved,
      isDepositPaid: this.isDepositPaid,
      isFullyPaid: this.isFullyPaid,
      formattedQuote: this.formattedQuote,
    };
  }
}

// SpecialRequest Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const SpecialRequestModel = {
  /**
   * Create a new special request
   */
  async create(requestData) {
    const repo = await getSpecialRequestRepository();

    const now = new Date();
    const requestNumber = requestData.requestNumber || generateSpecialRequestNumber();

    // Calculate pricing if provided
    let pricing = requestData.pricing;
    if (pricing && pricing.totalQuote) {
      pricing.depositAmount = Math.ceil(pricing.totalQuote * 0.5);
      pricing.balanceAmount = pricing.totalQuote - pricing.depositAmount;
    }

    const specialRequest = await repo.save({
      requestNumber,
      user: requestData.user,
      eventOccasion: requestData.eventOccasion,
      description: requestData.description,
      urgency: requestData.urgency || 'standard',
      inspiration: requestData.inspiration ? JSON.stringify(requestData.inspiration) : '[]',
      pricing: pricing ? JSON.stringify(pricing) : null,
      quoteApprovedBy: requestData.quoteApprovedBy,
      quoteApprovedAt: requestData.quoteApprovedAt,
      depositPayment: requestData.depositPayment,
      balancePayment: requestData.balancePayment,
      measurement: requestData.measurement,
      order: requestData.order,
      status: requestData.status || 'pending_quote',
      reviewedBy: requestData.reviewedBy,
      reviewNotes: requestData.reviewNotes,
      communications: requestData.communications ? JSON.stringify(requestData.communications) : '[]',
      requestedDeliveryDate: requestData.requestedDeliveryDate,
      createdAt: now,
      updatedAt: now,
    });

    return specialRequest;
  },

  /**
   * Find special request by ID
   */
  async findById(id) {
    const repo = await getSpecialRequestRepository();
    const request = await repo.fetch(id);
    if (!request || !request.requestNumber) return null;
    return request;
  },

  /**
   * Find by request number
   */
  async findByRequestNumber(requestNumber) {
    const repo = await getSpecialRequestRepository();
    const request = await repo.search()
      .where('requestNumber').equals(requestNumber)
      .return.first();
    return request;
  },

  /**
   * Update special request by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getSpecialRequestRepository();
    const request = await repo.fetch(id);
    if (!request || !request.requestNumber) return null;

    // Serialize complex objects
    const jsonFields = ['inspiration', 'pricing', 'communications'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(request, updateData, { updatedAt: new Date() });
    await repo.save(request);

    return options.new !== false ? request : null;
  },

  /**
   * Send quote
   */
  async sendQuote(id, pricingData, reviewedBy, notes) {
    const repo = await getSpecialRequestRepository();
    const request = await repo.fetch(id);
    if (!request || !request.requestNumber) return null;

    const totalQuote =
      (pricingData.materialCost || 0) +
      (pricingData.urgencyFee || 0) +
      (pricingData.deliveryFee || 0) +
      (pricingData.serviceFee || 0);

    const pricing = {
      ...pricingData,
      totalQuote,
      depositAmount: Math.ceil(totalQuote * 0.5),
      balanceAmount: totalQuote - Math.ceil(totalQuote * 0.5),
    };

    request.pricing = JSON.stringify(pricing);
    request.status = 'quote_sent';
    request.reviewedBy = reviewedBy;
    request.reviewNotes = notes;
    request.updatedAt = new Date();

    await repo.save(request);
    return request;
  },

  /**
   * Approve quote
   */
  async approveQuote(id, userId) {
    const repo = await getSpecialRequestRepository();
    const request = await repo.fetch(id);
    if (!request || !request.requestNumber) return null;

    request.quoteApprovedBy = userId;
    request.quoteApprovedAt = new Date();
    request.status = 'deposit_pending';
    request.updatedAt = new Date();

    await repo.save(request);
    return request;
  },

  /**
   * Add communication
   */
  async addCommunication(id, from, message) {
    const repo = await getSpecialRequestRepository();
    const request = await repo.fetch(id);
    if (!request || !request.requestNumber) return null;

    const communications = request.communicationsParsed;
    communications.push({
      from,
      message,
      timestamp: new Date().toISOString(),
    });

    request.communications = JSON.stringify(communications);
    request.updatedAt = new Date();

    await repo.save(request);
    return request;
  },

  /**
   * Find by user
   */
  async findByUser(userId) {
    const repo = await getSpecialRequestRepository();
    return repo.search()
      .where('user').equals(userId)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Find pending quote
   */
  async findPendingQuote() {
    const repo = await getSpecialRequestRepository();
    return repo.search()
      .where('status').equals('pending_quote')
      .sortBy('createdAt', 'ASC')
      .return.all();
  },

  /**
   * Find awaiting deposit
   */
  async findAwaitingDeposit() {
    const repo = await getSpecialRequestRepository();
    return repo.search()
      .where('status').equals('deposit_pending')
      .sortBy('createdAt', 'ASC')
      .return.all();
  },

  /**
   * Find all special requests with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getSpecialRequestRepository();
    let search = repo.search();

    // Apply filters
    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const requests = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return requests;
  },

  /**
   * Count special requests
   */
  async countDocuments(query = {}) {
    const repo = await getSpecialRequestRepository();
    let search = repo.search();

    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    return search.return.count();
  },

  /**
   * Delete special request (hard delete)
   */
  async delete(id) {
    const repo = await getSpecialRequestRepository();
    await repo.remove(id);
  },
};

export default SpecialRequestModel;
