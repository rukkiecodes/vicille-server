import { getRedisClient } from '../../infrastructure/database/redis.js';

// PaymentAttempt Entity class
class Model {
  // Get parsed payment method
  get paymentMethodParsed() {
    return this.paymentMethod ? JSON.parse(this.paymentMethod) : null;
  }

  // Get parsed provider response
  get providerResponseParsed() {
    return this.providerResponse ? JSON.parse(this.providerResponse) : null;
  }

  // Check if attempt was successful
  get isSuccess() {
    return this.status === 'success';
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      payment: this.payment,
      user: this.user,
      attemptNumber: this.attemptNumber,
      attemptType: this.attemptType,
      paymentMethod: this.paymentMethodParsed,
      amount: this.amount,
      status: this.status,
      providerReference: this.providerReference,
      providerResponse: this.providerResponseParsed,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
      attemptedAt: this.attemptedAt,
      isSuccess: this.isSuccess,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// PaymentAttempt Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const PaymentAttemptModel = {
  /**
   * Create a new payment attempt
   */
  async create(attemptData) {
    const repo = await getPaymentAttemptRepository();

    const now = new Date();
    const attempt = await repo.save({
      payment: attemptData.payment,
      user: attemptData.user,
      attemptNumber: attemptData.attemptNumber,
      attemptType: attemptData.attemptType,
      paymentMethod: attemptData.paymentMethod ? JSON.stringify(attemptData.paymentMethod) : null,
      amount: attemptData.amount,
      status: attemptData.status,
      providerReference: attemptData.providerReference,
      providerResponse: attemptData.providerResponse ? JSON.stringify(attemptData.providerResponse) : null,
      errorCode: attemptData.errorCode,
      errorMessage: attemptData.errorMessage,
      attemptedAt: attemptData.attemptedAt || now,
      createdAt: now,
      updatedAt: now,
    });

    return attempt;
  },

  /**
   * Find payment attempt by ID
   */
  async findById(id) {
    const repo = await getPaymentAttemptRepository();
    const attempt = await repo.fetch(id);
    if (!attempt || !attempt.payment) return null;
    return attempt;
  },

  /**
   * Update payment attempt by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getPaymentAttemptRepository();
    const attempt = await repo.fetch(id);
    if (!attempt || !attempt.payment) return null;

    // Serialize complex objects
    const jsonFields = ['paymentMethod', 'providerResponse'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(attempt, updateData, { updatedAt: new Date() });
    await repo.save(attempt);

    return options.new !== false ? attempt : null;
  },

  /**
   * Find payment attempts by payment ID
   */
  async findByPayment(paymentId) {
    const repo = await getPaymentAttemptRepository();
    const attempts = await repo.search()
      .where('payment').equals(paymentId)
      .sortBy('attemptedAt', 'ASC')
      .return.all();
    return attempts;
  },

  /**
   * Get last attempt for a payment
   */
  async getLastAttempt(paymentId) {
    const repo = await getPaymentAttemptRepository();
    const attempts = await repo.search()
      .where('payment').equals(paymentId)
      .sortBy('attemptedAt', 'DESC')
      .return.page(0, 1);
    return attempts.length > 0 ? attempts[0] : null;
  },

  /**
   * Find all payment attempts with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getPaymentAttemptRepository();
    let search = repo.search();

    // Apply filters
    if (query.payment) {
      search = search.where('payment').equals(query.payment);
    }
    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }
    if (query.attemptType) {
      search = search.where('attemptType').equals(query.attemptType);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const attempts = await search
      .sortBy('attemptedAt', 'DESC')
      .return.page(offset, limit);

    return attempts;
  },

  /**
   * Count payment attempts
   */
  async countDocuments(query = {}) {
    const repo = await getPaymentAttemptRepository();
    let search = repo.search();

    if (query.payment) {
      search = search.where('payment').equals(query.payment);
    }
    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    return search.return.count();
  },

  /**
   * Delete payment attempt (hard delete)
   */
  async delete(id) {
    const repo = await getPaymentAttemptRepository();
    await repo.remove(id);
  },
};

export default PaymentAttemptModel;
