import { getFirestore } from '../../infrastructure/database/firebase.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';

const COLLECTION = 'measurements';
const CACHE_TTL = 3600; // 1 hour

// Helper: Parse JSON fields from Firestore
function parseJsonFields(measurement) {
  if (!measurement) return null;
  return {
    ...measurement,
    capturedBy: typeof measurement.capturedBy === 'string' ? JSON.parse(measurement.capturedBy) : measurement.capturedBy,
    measurements: typeof measurement.measurements === 'string' ? JSON.parse(measurement.measurements) : measurement.measurements,
    delta: typeof measurement.delta === 'string' ? JSON.parse(measurement.delta) : measurement.delta,
  };
}

// Helper: Stringify JSON fields for Firestore
function stringifyJsonFields(data) {
  const result = { ...data };
  if (result.capturedBy && typeof result.capturedBy === 'object') {
    result.capturedBy = JSON.stringify(result.capturedBy);
  }
  if (result.measurements && typeof result.measurements === 'object') {
    result.measurements = JSON.stringify(result.measurements);
  }
  if (result.delta && typeof result.delta === 'object') {
    result.delta = JSON.stringify(result.delta);
  }
  return result;
}

// Helper: Cache management
async function cacheMeasurement(measurement) {
  try {
    const redis = getRedisClient();
    if (redis && measurement?.id) {
      await redis.setex(
        `measurement:${measurement.id}`,
        CACHE_TTL,
        JSON.stringify(measurement)
      );
    }
  } catch (error) {
    // Cache errors are non-fatal
  }
}

async function getCachedMeasurement(id) {
  try {
    const redis = getRedisClient();
    if (redis) {
      const cached = await redis.get(`measurement:${id}`);
      if (cached) return JSON.parse(cached);
    }
  } catch (error) {
    // Cache errors are non-fatal
  }
  return null;
}

async function clearMeasurementCache(id) {
  try {
    const redis = getRedisClient();
    if (redis && id) {
      await redis.del(`measurement:${id}`);
    }
  } catch (error) {
    // Cache errors are non-fatal
  }
}

// Measurement Model
const MeasurementModel = {
  /**
   * Create a new measurement
   */
  async create(measurementData) {
    const db = getFirestore();
    const now = new Date();
    const docRef = db.collection(COLLECTION).doc();

    // Get the latest version for this user to auto-increment version
    let version = 1;
    let previousVersion = null;

    if (measurementData.user) {
      const query = db.collection(COLLECTION)
        .where('user', '==', measurementData.user)
        .orderBy('version', 'desc')
        .limit(1);
      
      const snapshot = await query.get();
      if (!snapshot.empty) {
        const latest = snapshot.docs[0].data();
        version = (latest.version || 0) + 1;
        previousVersion = snapshot.docs[0].id;
      }
    }

    const measurementWithDefaults = stringifyJsonFields({
      user: measurementData.user,
      source: measurementData.source,
      capturedBy: measurementData.capturedBy || null,
      measurements: measurementData.measurements || null,
      fit: measurementData.fit || 'regular',
      version: measurementData.version || version,
      previousVersion: measurementData.previousVersion || previousVersion,
      delta: measurementData.delta || null,
      isActive: measurementData.isActive || false,
      queuedForCycle: measurementData.queuedForCycle || null,
      notes: measurementData.notes || null,
      capturedAt: measurementData.capturedAt || now,
      appliedAt: measurementData.appliedAt || null,
      createdAt: now,
      updatedAt: now,
    });

    await docRef.set(measurementWithDefaults);
    const created = parseJsonFields({ id: docRef.id, ...measurementWithDefaults });
    
    await cacheMeasurement(created);
    return created;
  },

  /**
   * Find measurement by ID
   */
  async findById(id) {
    // Try cache first
    const cached = await getCachedMeasurement(id);
    if (cached) return cached;

    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(id).get();
    
    if (!doc.exists || !doc.data().user) return null;
    
    const measurement = parseJsonFields({ id: doc.id, ...doc.data() });
    await cacheMeasurement(measurement);
    
    return measurement;
  },

  /**
   * Update measurement by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists || !doc.data().user) return null;

    const updateWithDefaults = stringifyJsonFields({
      ...updateData,
      updatedAt: new Date(),
    });

    await docRef.update(updateWithDefaults);
    
    const updated = doc.data();
    const result = parseJsonFields({ id: doc.id, ...updated, ...updateWithDefaults });
    
    await clearMeasurementCache(id);
    await cacheMeasurement(result);
    
    return result;
  },

  /**
   * Find measurements with filters and pagination
   */
  async find(query = {}, options = {}) {
    const db = getFirestore();
    let firestoreQuery = db.collection(COLLECTION);

    // Apply filters
    if (query.user) {
      firestoreQuery = firestoreQuery.where('user', '==', query.user);
    }
    if (query.source) {
      firestoreQuery = firestoreQuery.where('source', '==', query.source);
    }
    if (query.isActive !== undefined) {
      firestoreQuery = firestoreQuery.where('isActive', '==', query.isActive);
    }
    if (query.queuedForCycle !== undefined) {
      firestoreQuery = firestoreQuery.where('queuedForCycle', '==', query.queuedForCycle);
    }

    // Apply sorting and pagination
    firestoreQuery = firestoreQuery.orderBy('capturedAt', 'desc');
    
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const countQuery = await firestoreQuery.count().get();
    const total = countQuery.data().count;

    const querySnapshot = await firestoreQuery
      .offset(offset)
      .limit(limit)
      .get();

    const measurements = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })).map(parseJsonFields);

    return {
      data: measurements,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Count measurements
   */
  async countDocuments(query = {}) {
    const db = getFirestore();
    let firestoreQuery = db.collection(COLLECTION);

    if (query.user) {
      firestoreQuery = firestoreQuery.where('user', '==', query.user);
    }
    if (query.source) {
      firestoreQuery = firestoreQuery.where('source', '==', query.source);
    }
    if (query.isActive !== undefined) {
      firestoreQuery = firestoreQuery.where('isActive', '==', query.isActive);
    }

    const countQuery = await firestoreQuery.count().get();
    return countQuery.data().count;
  },

  /**
   * Delete measurement (hard delete)
   */
  async delete(id) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).delete();
    await clearMeasurementCache(id);
  },

  /**
   * Get active measurement for user
   */
  async getActiveForUser(userId) {
    const db = getFirestore();
    const query = db.collection(COLLECTION)
      .where('user', '==', userId)
      .where('isActive', '==', true)
      .limit(1);
    
    const snapshot = await query.get();
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    return parseJsonFields({ id: doc.id, ...doc.data() });
  },

  /**
   * Get measurement history for user
   */
  async getHistoryForUser(userId, limit = 10) {
    const db = getFirestore();
    const query = db.collection(COLLECTION)
      .where('user', '==', userId)
      .orderBy('version', 'desc')
      .limit(limit);
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => parseJsonFields({ id: doc.id, ...doc.data() }));
  },

  /**
   * Get queued measurements for a cycle
   */
  async getQueuedForCycle(cycleNumber) {
    const db = getFirestore();
    const query = db.collection(COLLECTION)
      .where('queuedForCycle', '==', cycleNumber)
      .where('isActive', '==', false);
    
    const snapshot = await query.get();
    return snapshot.docs.map(doc => parseJsonFields({ id: doc.id, ...doc.data() }));
  },

  /**
   * Make measurement active
   */
  async makeActive(id) {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists || !doc.data().user) return null;

    const measurement = doc.data();
    const userId = measurement.user;

    // Deactivate all other measurements for this user
    const userMeasurements = await db.collection(COLLECTION)
      .where('user', '==', userId)
      .get();

    const batch = db.batch();

    for (const userDoc of userMeasurements.docs) {
      if (userDoc.id !== id && userDoc.data().isActive) {
        batch.update(userDoc.ref, {
          isActive: false,
          updatedAt: new Date(),
        });
        await clearMeasurementCache(userDoc.id);
      }
    }

    // Activate this measurement
    batch.update(docRef, {
      isActive: true,
      appliedAt: new Date(),
      updatedAt: new Date(),
    });

    await batch.commit();

    const updated = parseJsonFields({ id, ...measurement, isActive: true, appliedAt: new Date(), updatedAt: new Date() });
    await clearMeasurementCache(id);
    await cacheMeasurement(updated);
    
    return updated;
  },

  /**
   * Queue measurement for next cycle
   */
  async queueForNextCycle(id, cycleNumber) {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists || !doc.data().user) return null;

    const updateData = {
      queuedForCycle: cycleNumber,
      updatedAt: new Date(),
    };

    await docRef.update(updateData);
    
    const updated = parseJsonFields({ id, ...doc.data(), ...updateData });
    await clearMeasurementCache(id);
    await cacheMeasurement(updated);
    
    return updated;
  },
};

export default MeasurementModel;
