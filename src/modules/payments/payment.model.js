import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateTransactionReference } from '../../core/utils/randomCode.js';
import { PAYMENT_STATUS, PAYMENT_TYPE } from '../../core/constants/paymentStatus.js';

// Payment Entity class
class Model {
  // Get parsed payment method object
  get paymentMethodParsed() {
    return this.paymentMethod ? JSON.parse(this.paymentMethod) : null;
  }

  // Get parsed metadata object
  get metadataParsed() {
    return this.metadata ? JSON.parse(this.metadata) : null;
  }

  // Get parsed refund object
  get refundParsed() {
    return this.refund ? JSON.parse(this.refund) : null;
  }

  // Get parsed provider response object
  get providerResponseParsed() {
    return this.providerResponse ? JSON.parse(this.providerResponse) : null;
  }

  // Virtual for formattedAmount
  get formattedAmount() {
    const amount = this.amount / 100;
    return `₦${amount.toLocaleString()}`;
  }

  // Virtual for isPaid
  get isPaid() {
    return this.status === PAYMENT_STATUS.SUCCESS;
  }

  // Virtual for canRetry
  get canRetry() {
    return this.status === PAYMENT_STATUS.FAILED && this.retryCount < 3;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      transactionReference: this.transactionReference,
      user: this.user,
      order: this.order,
      subscription: this.subscription,
      paymentType: this.paymentType,
      amount: this.amount,
      currency: this.currency,
      paymentMethod: this.paymentMethodParsed,
      status: this.status,
      providerReference: this.providerReference,
      providerResponse: this.providerResponseParsed,
      metadata: this.metadataParsed,
      refund: this.refundParsed,
      retryCount: this.retryCount,
      nextRetryAt: this.nextRetryAt,
      lastAttemptAt: this.lastAttemptAt,
      paidAt: this.paidAt,
      failedAt: this.failedAt,
      refundedAt: this.refundedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      formattedAmount: this.formattedAmount,
      isPaid: this.isPaid,
      canRetry: this.canRetry,
    };
  }
}

// Payment Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const PaymentModel = {
  /**
   * Create a new payment
   */
  async create(paymentData) {
    const repo = await getPaymentRepository();

    const now = new Date();
    const transactionReference = paymentData.transactionReference || generateTransactionReference();

    const payment = await repo.save({
      transactionReference,
      user: paymentData.user,
      order: paymentData.order,
      subscription: paymentData.subscription,
      paymentType: paymentData.paymentType,
      amount: paymentData.amount,
      currency: paymentData.currency || 'NGN',
      paymentMethod: paymentData.paymentMethod ? JSON.stringify(paymentData.paymentMethod) : null,
      status: paymentData.status || PAYMENT_STATUS.PENDING,
      providerReference: paymentData.providerReference,
      providerResponse: paymentData.providerResponse ? JSON.stringify(paymentData.providerResponse) : null,
      metadata: paymentData.metadata ? JSON.stringify(paymentData.metadata) : null,
      refund: paymentData.refund ? JSON.stringify(paymentData.refund) : null,
      retryCount: paymentData.retryCount || 0,
      nextRetryAt: paymentData.nextRetryAt,
      lastAttemptAt: paymentData.lastAttemptAt,
      paidAt: paymentData.paidAt,
      failedAt: paymentData.failedAt,
      refundedAt: paymentData.refundedAt,
      createdAt: now,
      updatedAt: now,
    });

    return payment;
  },

  /**
   * Find payment by ID
   */
  async findById(id) {
    const repo = await getPaymentRepository();
    const payment = await repo.fetch(id);
    if (!payment || !payment.transactionReference) return null;
    return payment;
  },

  /**
   * Find payment by transaction reference
   */
  async findByTransactionReference(transactionReference) {
    const repo = await getPaymentRepository();
    const payment = await repo.search()
      .where('transactionReference').equals(transactionReference)
      .return.first();
    return payment;
  },

  /**
   * Update payment by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getPaymentRepository();
    const payment = await repo.fetch(id);
    if (!payment || !payment.transactionReference) return null;

    // Serialize complex objects
    const jsonFields = ['paymentMethod', 'providerResponse', 'metadata', 'refund'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(payment, updateData, { updatedAt: new Date() });
    await repo.save(payment);

    return options.new !== false ? payment : null;
  },

  /**
   * Find payments with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getPaymentRepository();
    let search = repo.search();

    // Apply filters
    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.order) {
      search = search.where('order').equals(query.order);
    }
    if (query.subscription) {
      search = search.where('subscription').equals(query.subscription);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }
    if (query.paymentType) {
      search = search.where('paymentType').equals(query.paymentType);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const payments = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return payments;
  },

  /**
   * Count payments
   */
  async countDocuments(query = {}) {
    const repo = await getPaymentRepository();
    let search = repo.search();

    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }
    if (query.paymentType) {
      search = search.where('paymentType').equals(query.paymentType);
    }

    return search.return.count();
  },

  /**
   * Delete payment (hard delete)
   */
  async delete(id) {
    const repo = await getPaymentRepository();
    await repo.remove(id);
  },

  /**
   * Find payments by user
   */
  async findByUser(userId, options = {}) {
    const repo = await getPaymentRepository();
    const limit = options.limit || 20;

    return repo.search()
      .where('user').equals(userId)
      .sortBy('createdAt', 'DESC')
      .return.page(0, limit);
  },

  /**
   * Find successful payments for user
   */
  async findSuccessful(userId) {
    const repo = await getPaymentRepository();
    return repo.search()
      .where('user').equals(userId)
      .where('status').equals(PAYMENT_STATUS.SUCCESS)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Find payments due for retry
   */
  async findDueForRetry() {
    const repo = await getPaymentRepository();
    const now = new Date();
    const payments = await repo.search()
      .where('status').equals(PAYMENT_STATUS.FAILED)
      .return.all();

    // Filter by nextRetryAt and retryCount
    return payments.filter(payment => {
      return payment.nextRetryAt &&
        new Date(payment.nextRetryAt) <= now &&
        payment.retryCount < 3;
    });
  },

  /**
   * Mark payment as successful
   */
  async markAsSuccess(id, providerResponse) {
    const repo = await getPaymentRepository();
    const payment = await repo.fetch(id);
    if (!payment || !payment.transactionReference) return null;

    payment.status = PAYMENT_STATUS.SUCCESS;
    payment.paidAt = new Date();
    payment.providerReference = providerResponse?.reference || providerResponse?.data?.reference;
    payment.providerResponse = JSON.stringify(providerResponse);
    payment.updatedAt = new Date();
    await repo.save(payment);

    return payment;
  },

  /**
   * Mark payment as failed
   */
  async markAsFailed(id, providerResponse, scheduleRetry = true) {
    const repo = await getPaymentRepository();
    const payment = await repo.fetch(id);
    if (!payment || !payment.transactionReference) return null;

    payment.status = PAYMENT_STATUS.FAILED;
    payment.failedAt = new Date();
    payment.lastAttemptAt = new Date();
    payment.providerResponse = JSON.stringify(providerResponse);

    if (scheduleRetry && payment.retryCount < 3) {
      payment.retryCount = (payment.retryCount || 0) + 1;
      // Schedule retry in 24 hours
      payment.nextRetryAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    payment.updatedAt = new Date();
    await repo.save(payment);

    return payment;
  },

  /**
   * Process refund
   */
  async processRefund(id, amount, reason, refundReference) {
    const repo = await getPaymentRepository();
    const payment = await repo.fetch(id);
    if (!payment || !payment.transactionReference) return null;

    payment.status = PAYMENT_STATUS.REFUNDED;
    payment.refundedAt = new Date();
    payment.refund = JSON.stringify({
      amount: amount || payment.amount,
      reason,
      refundedAt: new Date().toISOString(),
      refundReference,
    });
    payment.updatedAt = new Date();
    await repo.save(payment);

    return payment;
  },

  /**
   * Calculate revenue for a date range
   */
  async calculateRevenue(startDate, endDate) {
    const repo = await getPaymentRepository();
    const payments = await repo.search()
      .where('status').equals(PAYMENT_STATUS.SUCCESS)
      .return.all();

    // Filter by paidAt date range and sum
    const filteredPayments = payments.filter(payment => {
      if (!payment.paidAt) return false;
      const paidAt = new Date(payment.paidAt);
      return paidAt >= startDate && paidAt <= endDate;
    });

    const totalAmount = filteredPayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);

    return {
      totalAmount,
      count: filteredPayments.length,
    };
  },
};

export default PaymentModel;
