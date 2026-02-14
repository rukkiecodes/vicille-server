import { getFirestore } from '../../infrastructure/database/firebase.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';

const COLLECTION = 'subscriptionPlans';
const CACHE_TTL = 3600; // 1 hour

// Helper to parse JSON fields
const parseJsonFields = (plan) => {
  if (!plan) return null;
  return {
    ...plan,
    pricing: plan.pricing && typeof plan.pricing === 'string' ? JSON.parse(plan.pricing) : plan.pricing || null,
    features: plan.features && typeof plan.features === 'string' ? JSON.parse(plan.features) : plan.features || null,
    stylingWindow: plan.stylingWindow && typeof plan.stylingWindow === 'string' 
      ? JSON.parse(plan.stylingWindow) 
      : plan.stylingWindow || {
          daysBeforeProduction: 7,
          reminderDays: [7, 3, 1],
        },
  };
};

// Helper to stringify JSON fields for storage
const stringifyJsonFields = (data) => {
  const cleaned = { ...data };
  if (cleaned.pricing && typeof cleaned.pricing === 'object') {
    cleaned.pricing = JSON.stringify(cleaned.pricing);
  }
  if (cleaned.features && typeof cleaned.features === 'object') {
    cleaned.features = JSON.stringify(cleaned.features);
  }
  if (cleaned.stylingWindow && typeof cleaned.stylingWindow === 'object') {
    cleaned.stylingWindow = JSON.stringify(cleaned.stylingWindow);
  }
  return cleaned;
};

// Helper to cache plan in Redis
const cachePlan = async (id, plan) => {
  try {
    const redis = getRedisClient();
    await redis.setex(`subscriptionPlan:${id}`, CACHE_TTL, JSON.stringify(plan));
  } catch (err) {
    // Redis errors are non-fatal for caching
    console.error('Cache error for plan:', err.message);
  }
};

// Helper to get cached plan
const getCachedPlan = async (id) => {
  try {
    const redis = getRedisClient();
    const cached = await redis.get(`subscriptionPlan:${id}`);
    return cached ? JSON.parse(cached) : null;
  } catch (err) {
    return null;
  }
};

// Helper to clear plan cache
const clearPlanCache = async (id) => {
  try {
    const redis = getRedisClient();
    await redis.del(`subscriptionPlan:${id}`);
  } catch (err) {
    console.error('Cache clear error:', err.message);
  }
};

const SubscriptionPlanModel = {
  /**
   * Create a new subscription plan
   */
  async create(planData) {
    const db = getFirestore();
    const now = new Date();

    const docData = {
      name: planData.name,
      slug: planData.slug?.toLowerCase() || '',
      description: planData.description || '',
      pricing: planData.pricing || null,
      features: planData.features || null,
      stylingWindow: planData.stylingWindow || {
        daysBeforeProduction: 7,
        reminderDays: [7, 3, 1],
      },
      isActive: planData.isActive !== false,
      displayOrder: planData.displayOrder || 0,
      createdAt: now,
      updatedAt: now,
    };

    // Store complex objects normally (Firestore handles nested objects)
    const docRef = await db.collection(COLLECTION).add(docData);
    
    const plan = {
      id: docRef.id,
      ...docData,
    };

    await cachePlan(plan.id, parseJsonFields(plan));
    return parseJsonFields(plan);
  },

  /**
   * Find subscription plan by ID
   */
  async findById(id) {
    // Try cache first
    let plan = await getCachedPlan(id);
    if (plan) return plan;

    const db = getFirestore();
    const docSnapshot = await db.collection(COLLECTION).doc(id).get();
    
    if (!docSnapshot.exists) return null;
    
    const plan_data = {
      id: docSnapshot.id,
      ...docSnapshot.data(),
    };

    const parsed = parseJsonFields(plan_data);
    await cachePlan(id, parsed);
    return parsed;
  },

  /**
   * Find subscription plan by slug
   */
  async findBySlug(slug) {
    const db = getFirestore();
    const query = db.collection(COLLECTION)
      .where('slug', '==', slug.toLowerCase())
      .where('isActive', '==', true);
    
    const querySnapshot = await query.limit(1).get();
    
    if (querySnapshot.empty) return null;
    
    const doc = querySnapshot.docs[0];
    const plan = {
      id: doc.id,
      ...doc.data(),
    };

    return parseJsonFields(plan);
  },

  /**
   * Update subscription plan by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const db = getFirestore();
    
    // Check if plan exists
    const docSnapshot = await db.collection(COLLECTION).doc(id).get();
    if (!docSnapshot.exists) return null;

    // Prepare update data
    const dataToUpdate = {
      ...updateData,
      updatedAt: new Date(),
    };

    // Ensure slug is lowercase
    if (dataToUpdate.slug) {
      dataToUpdate.slug = dataToUpdate.slug.toLowerCase();
    }

    // Update in Firestore
    await db.collection(COLLECTION).doc(id).update(dataToUpdate);

    // Clear cache
    await clearPlanCache(id);

    // Return updated document if requested
    if (options.new !== false) {
      return this.findById(id);
    }

    return null;
  },

  /**
   * Find subscription plans with filters and pagination
   */
  async find(query = {}, options = {}) {
    const db = getFirestore();
    let firestoreQuery = db.collection(COLLECTION);

    // Apply filters
    if (query.isActive !== undefined) {
      firestoreQuery = firestoreQuery.where('isActive', '==', query.isActive);
    }

    // Sort by display order
    firestoreQuery = firestoreQuery.orderBy('displayOrder', 'asc')
      .orderBy('createdAt', 'desc');

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    // Get total count
    const countQuery = await firestoreQuery.count().get();
    const total = countQuery.data().count;

    // Get paginated results
    const querySnapshot = await firestoreQuery
      .offset(offset)
      .limit(limit)
      .get();

    const plans = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })).map(parseJsonFields);

    return {
      data: plans,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Count subscription plans
   */
  async countDocuments(query = {}) {
    const db = getFirestore();
    let firestoreQuery = db.collection(COLLECTION);

    if (query.isActive !== undefined) {
      firestoreQuery = firestoreQuery.where('isActive', '==', query.isActive);
    }

    const countQuery = await firestoreQuery.count().get();
    return countQuery.data().count;
  },

  /**
   * Delete subscription plan (hard delete)
   */
  async delete(id) {
    const db = getFirestore();
    await clearPlanCache(id);
    await db.collection(COLLECTION).doc(id).delete();
  },

  /**
   * Find active plans sorted by display order
   */
  async findActive() {
    const db = getFirestore();
    const querySnapshot = await db.collection(COLLECTION)
      .where('isActive', '==', true)
      .orderBy('displayOrder', 'asc')
      .get();

    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })).map(parseJsonFields);
  },

  /**
   * Check if slug exists
   */
  async slugExists(slug) {
    const db = getFirestore();
    const querySnapshot = await db.collection(COLLECTION)
      .where('slug', '==', slug.toLowerCase())
      .limit(1)
      .get();

    return !querySnapshot.empty;
  },
};

export default SubscriptionPlanModel;
