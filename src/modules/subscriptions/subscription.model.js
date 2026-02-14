import { getRedisClient } from '../../infrastructure/database/redis.js';

// Subscription Entity class
class Model {
  // Get parsed billing object
  get billingParsed() {
    return this.billing ? JSON.parse(this.billing) : null;
  }

  // Get parsed current cycle object
  get currentCycleParsed() {
    return this.currentCycle ? JSON.parse(this.currentCycle) : null;
  }

  // Get parsed cancellation object
  get cancellationParsed() {
    return this.cancellation ? JSON.parse(this.cancellation) : null;
  }

  // Virtual for isActive
  get isActive() {
    return this.status === 'active' && this.paymentStatus !== 'overdue';
  }

  // Virtual for isStylingWindowOpen
  get isStylingWindowOpen() {
    const currentCycle = this.currentCycleParsed;
    if (!currentCycle) return false;
    const now = new Date();
    return (
      currentCycle.stylingWindowOpen &&
      currentCycle.stylingWindowClose &&
      now >= new Date(currentCycle.stylingWindowOpen) &&
      now <= new Date(currentCycle.stylingWindowClose)
    );
  }

  // Virtual for daysUntilNextBilling
  get daysUntilNextBilling() {
    const billing = this.billingParsed;
    if (!billing || !billing.nextBillingDate) {
      return null;
    }
    const now = new Date();
    const diff = new Date(billing.nextBillingDate) - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // Virtual for isInGracePeriod
  get isInGracePeriod() {
    if (!this.gracePeriodEnds) {
      return false;
    }
    return new Date() <= new Date(this.gracePeriodEnds);
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      user: this.user,
      plan: this.plan,
      status: this.status,
      billing: this.billingParsed,
      currentCycle: this.currentCycleParsed,
      paymentStatus: this.paymentStatus,
      gracePeriodEnds: this.gracePeriodEnds,
      startDate: this.startDate,
      endDate: this.endDate,
      renewalEnabled: this.renewalEnabled,
      cancellation: this.cancellationParsed,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive,
      isStylingWindowOpen: this.isStylingWindowOpen,
      daysUntilNextBilling: this.daysUntilNextBilling,
      isInGracePeriod: this.isInGracePeriod,
    };
  }
}

// Subscription Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const SubscriptionModel = {
  /**
   * Create a new subscription
   */
  async create(subscriptionData) {
    const repo = await getSubscriptionRepository();

    const now = new Date();

    const subscription = await repo.save({
      user: subscriptionData.user,
      plan: subscriptionData.plan,
      status: subscriptionData.status || 'active',
      billing: subscriptionData.billing ? JSON.stringify(subscriptionData.billing) : null,
      currentCycle: subscriptionData.currentCycle ? JSON.stringify(subscriptionData.currentCycle) : null,
      paymentStatus: subscriptionData.paymentStatus || 'pending',
      gracePeriodEnds: subscriptionData.gracePeriodEnds,
      startDate: subscriptionData.startDate || now,
      endDate: subscriptionData.endDate,
      renewalEnabled: subscriptionData.renewalEnabled !== false,
      cancellation: subscriptionData.cancellation ? JSON.stringify(subscriptionData.cancellation) : null,
      createdAt: now,
      updatedAt: now,
    });

    return subscription;
  },

  /**
   * Find subscription by ID
   */
  async findById(id) {
    const repo = await getSubscriptionRepository();
    const subscription = await repo.fetch(id);
    if (!subscription || !subscription.user) return null;
    return subscription;
  },

  /**
   * Update subscription by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getSubscriptionRepository();
    const subscription = await repo.fetch(id);
    if (!subscription || !subscription.user) return null;

    // Serialize complex objects
    const jsonFields = ['billing', 'currentCycle', 'cancellation'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(subscription, updateData, { updatedAt: new Date() });
    await repo.save(subscription);

    return options.new !== false ? subscription : null;
  },

  /**
   * Find subscriptions with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getSubscriptionRepository();
    let search = repo.search();

    // Apply filters
    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }
    if (query.paymentStatus) {
      search = search.where('paymentStatus').equals(query.paymentStatus);
    }
    if (query.plan) {
      search = search.where('plan').equals(query.plan);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const subscriptions = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return subscriptions;
  },

  /**
   * Count subscriptions
   */
  async countDocuments(query = {}) {
    const repo = await getSubscriptionRepository();
    let search = repo.search();

    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }
    if (query.paymentStatus) {
      search = search.where('paymentStatus').equals(query.paymentStatus);
    }

    return search.return.count();
  },

  /**
   * Delete subscription (hard delete)
   */
  async delete(id) {
    const repo = await getSubscriptionRepository();
    await repo.remove(id);
  },

  /**
   * Find active subscriptions
   */
  async findActive() {
    const repo = await getSubscriptionRepository();
    return repo.search()
      .where('status').equals('active')
      .return.all();
  },

  /**
   * Find subscriptions due for billing
   */
  async findDueForBilling() {
    const repo = await getSubscriptionRepository();
    const subscriptions = await repo.search()
      .where('status').equals('active')
      .where('renewalEnabled').equals(true)
      .return.all();

    // Filter by nextBillingDate (need to parse billing JSON)
    const now = new Date();
    return subscriptions.filter(sub => {
      const billing = sub.billingParsed;
      return billing && billing.nextBillingDate && new Date(billing.nextBillingDate) <= now;
    });
  },

  /**
   * Find overdue subscriptions
   */
  async findOverdue() {
    const repo = await getSubscriptionRepository();
    const now = new Date();
    const subscriptions = await repo.search()
      .where('status').equals('active')
      .where('paymentStatus').equals('overdue')
      .return.all();

    // Filter by gracePeriodEnds
    return subscriptions.filter(sub => {
      return sub.gracePeriodEnds && new Date(sub.gracePeriodEnds) < now;
    });
  },

  /**
   * Find subscription by user
   */
  async findByUser(userId) {
    const repo = await getSubscriptionRepository();
    return repo.search()
      .where('user').equals(userId)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Advance subscription to next cycle
   */
  async advanceToNextCycle(id) {
    const repo = await getSubscriptionRepository();
    const subscription = await repo.fetch(id);
    if (!subscription || !subscription.user) return null;

    const currentCycle = subscription.currentCycleParsed;
    if (!currentCycle) return null;

    let nextMonth = currentCycle.month + 1;
    let nextYear = currentCycle.year;

    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    const newCycle = {
      cycleNumber: currentCycle.cycleNumber + 1,
      month: nextMonth,
      year: nextYear,
      stylingWindowOpen: null,
      stylingWindowClose: null,
      productionStartDate: null,
      estimatedDeliveryDate: null,
    };

    subscription.currentCycle = JSON.stringify(newCycle);
    subscription.updatedAt = new Date();
    await repo.save(subscription);

    return subscription;
  },

  /**
   * Cancel subscription
   */
  async cancel(id, reason, cancelledBy, cancelledByModel) {
    const repo = await getSubscriptionRepository();
    const subscription = await repo.fetch(id);
    if (!subscription || !subscription.user) return null;

    subscription.status = 'cancelled';
    subscription.cancellation = JSON.stringify({
      cancelledAt: new Date().toISOString(),
      reason,
      cancelledBy,
      cancelledByModel,
    });
    subscription.updatedAt = new Date();
    await repo.save(subscription);

    return subscription;
  },

  /**
   * Pause subscription
   */
  async pause(id) {
    const repo = await getSubscriptionRepository();
    const subscription = await repo.fetch(id);
    if (!subscription || !subscription.user) return null;

    subscription.status = 'paused';
    subscription.updatedAt = new Date();
    await repo.save(subscription);

    return subscription;
  },

  /**
   * Resume subscription
   */
  async resume(id) {
    const repo = await getSubscriptionRepository();
    const subscription = await repo.fetch(id);
    if (!subscription || !subscription.user) return null;

    subscription.status = 'active';
    subscription.updatedAt = new Date();
    await repo.save(subscription);

    return subscription;
  },
};

export default SubscriptionModel;
