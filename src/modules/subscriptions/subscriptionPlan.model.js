import { getRedisClient } from '../../infrastructure/database/redis.js';

// SubscriptionPlan Entity class
class Model {
  // Get parsed pricing object
  get pricingParsed() {
    return this.pricing ? JSON.parse(this.pricing) : null;
  }

  // Get parsed features object
  get featuresParsed() {
    return this.features ? JSON.parse(this.features) : null;
  }

  // Get parsed styling window object
  get stylingWindowParsed() {
    return this.stylingWindow ? JSON.parse(this.stylingWindow) : {
      daysBeforeProduction: 7,
      reminderDays: [7, 3, 1],
    };
  }

  // Virtual for formatted price
  get formattedPrice() {
    const pricing = this.pricingParsed;
    if (!pricing) return null;
    const amount = pricing.amount / 100; // Convert from kobo
    return `₦${amount.toLocaleString()}/${pricing.billingCycle}`;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      name: this.name,
      slug: this.slug,
      description: this.description,
      pricing: this.pricingParsed,
      features: this.featuresParsed,
      stylingWindow: this.stylingWindowParsed,
      isActive: this.isActive,
      displayOrder: this.displayOrder,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      formattedPrice: this.formattedPrice,
    };
  }
}

// SubscriptionPlan Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const SubscriptionPlanModel = {
  /**
   * Create a new subscription plan
   */
  async create(planData) {
    const repo = await getSubscriptionPlanRepository();

    const now = new Date();

    const plan = await repo.save({
      name: planData.name,
      slug: planData.slug?.toLowerCase(),
      description: planData.description,
      pricing: planData.pricing ? JSON.stringify(planData.pricing) : null,
      features: planData.features ? JSON.stringify(planData.features) : null,
      stylingWindow: planData.stylingWindow ? JSON.stringify(planData.stylingWindow) : JSON.stringify({
        daysBeforeProduction: 7,
        reminderDays: [7, 3, 1],
      }),
      isActive: planData.isActive !== false,
      displayOrder: planData.displayOrder || 0,
      createdAt: now,
      updatedAt: now,
    });

    return plan;
  },

  /**
   * Find subscription plan by ID
   */
  async findById(id) {
    const repo = await getSubscriptionPlanRepository();
    const plan = await repo.fetch(id);
    if (!plan || !plan.name) return null;
    return plan;
  },

  /**
   * Find subscription plan by slug
   */
  async findBySlug(slug) {
    const repo = await getSubscriptionPlanRepository();
    const plan = await repo.search()
      .where('slug').equals(slug.toLowerCase())
      .where('isActive').equals(true)
      .return.first();
    return plan;
  },

  /**
   * Update subscription plan by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getSubscriptionPlanRepository();
    const plan = await repo.fetch(id);
    if (!plan || !plan.name) return null;

    // Serialize complex objects
    const jsonFields = ['pricing', 'features', 'stylingWindow'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Ensure slug is lowercase
    if (updateData.slug) {
      updateData.slug = updateData.slug.toLowerCase();
    }

    // Update fields
    Object.assign(plan, updateData, { updatedAt: new Date() });
    await repo.save(plan);

    return options.new !== false ? plan : null;
  },

  /**
   * Find subscription plans with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getSubscriptionPlanRepository();
    let search = repo.search();

    // Apply filters
    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const plans = await search
      .sortBy('displayOrder', 'ASC')
      .return.page(offset, limit);

    return plans;
  },

  /**
   * Count subscription plans
   */
  async countDocuments(query = {}) {
    const repo = await getSubscriptionPlanRepository();
    let search = repo.search();

    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }

    return search.return.count();
  },

  /**
   * Delete subscription plan (hard delete)
   */
  async delete(id) {
    const repo = await getSubscriptionPlanRepository();
    await repo.remove(id);
  },

  /**
   * Find active plans sorted by display order
   */
  async findActive() {
    const repo = await getSubscriptionPlanRepository();
    return repo.search()
      .where('isActive').equals(true)
      .sortBy('displayOrder', 'ASC')
      .return.all();
  },

  /**
   * Check if slug exists
   */
  async slugExists(slug) {
    const repo = await getSubscriptionPlanRepository();
    const plan = await repo.search()
      .where('slug').equals(slug.toLowerCase())
      .return.first();
    return !!plan;
  },
};

export default SubscriptionPlanModel;
