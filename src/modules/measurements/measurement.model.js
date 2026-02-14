import { getRedisClient } from '../../infrastructure/database/redis.js';

// Measurement Entity class
class Model {
  // Get parsed capturedBy object
  get capturedByParsed() {
    return this.capturedBy ? JSON.parse(this.capturedBy) : null;
  }

  // Get parsed measurements object
  get measurementsParsed() {
    return this.measurements ? JSON.parse(this.measurements) : null;
  }

  // Get parsed delta object
  get deltaParsed() {
    return this.delta ? JSON.parse(this.delta) : null;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      user: this.user,
      source: this.source,
      capturedBy: this.capturedByParsed,
      measurements: this.measurementsParsed,
      fit: this.fit,
      version: this.version,
      previousVersion: this.previousVersion,
      delta: this.deltaParsed,
      isActive: this.isActive,
      queuedForCycle: this.queuedForCycle,
      notes: this.notes,
      capturedAt: this.capturedAt,
      appliedAt: this.appliedAt,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// Measurement Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const MeasurementModel = {
  /**
   * Create a new measurement
   */
  async create(measurementData) {
    const repo = await getMeasurementRepository();

    const now = new Date();

    // Get the latest version for this user to auto-increment version
    let version = 1;
    let previousVersion = null;

    if (measurementData.user) {
      const latestMeasurement = await repo.search()
        .where('user').equals(measurementData.user)
        .sortBy('version', 'DESC')
        .return.first();

      if (latestMeasurement && latestMeasurement.version) {
        version = latestMeasurement.version + 1;
        previousVersion = latestMeasurement.entityId;
      }
    }

    const measurement = await repo.save({
      user: measurementData.user,
      source: measurementData.source,
      capturedBy: measurementData.capturedBy ? JSON.stringify(measurementData.capturedBy) : null,
      measurements: measurementData.measurements ? JSON.stringify(measurementData.measurements) : null,
      fit: measurementData.fit || 'regular',
      version: measurementData.version || version,
      previousVersion: measurementData.previousVersion || previousVersion,
      delta: measurementData.delta ? JSON.stringify(measurementData.delta) : null,
      isActive: measurementData.isActive || false,
      queuedForCycle: measurementData.queuedForCycle,
      notes: measurementData.notes,
      capturedAt: measurementData.capturedAt || now,
      appliedAt: measurementData.appliedAt,
      createdAt: now,
      updatedAt: now,
    });

    return measurement;
  },

  /**
   * Find measurement by ID
   */
  async findById(id) {
    const repo = await getMeasurementRepository();
    const measurement = await repo.fetch(id);
    if (!measurement || !measurement.user) return null;
    return measurement;
  },

  /**
   * Update measurement by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getMeasurementRepository();
    const measurement = await repo.fetch(id);
    if (!measurement || !measurement.user) return null;

    // Serialize complex objects
    const jsonFields = ['capturedBy', 'measurements', 'delta'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(measurement, updateData, { updatedAt: new Date() });
    await repo.save(measurement);

    return options.new !== false ? measurement : null;
  },

  /**
   * Find measurements with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getMeasurementRepository();
    let search = repo.search();

    // Apply filters
    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.source) {
      search = search.where('source').equals(query.source);
    }
    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }
    if (query.queuedForCycle !== undefined) {
      search = search.where('queuedForCycle').equals(query.queuedForCycle);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const measurements = await search
      .sortBy('capturedAt', 'DESC')
      .return.page(offset, limit);

    return measurements;
  },

  /**
   * Count measurements
   */
  async countDocuments(query = {}) {
    const repo = await getMeasurementRepository();
    let search = repo.search();

    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.source) {
      search = search.where('source').equals(query.source);
    }
    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }

    return search.return.count();
  },

  /**
   * Delete measurement (hard delete)
   */
  async delete(id) {
    const repo = await getMeasurementRepository();
    await repo.remove(id);
  },

  /**
   * Get active measurement for user
   */
  async getActiveForUser(userId) {
    const repo = await getMeasurementRepository();
    return repo.search()
      .where('user').equals(userId)
      .where('isActive').equals(true)
      .return.first();
  },

  /**
   * Get measurement history for user
   */
  async getHistoryForUser(userId, limit = 10) {
    const repo = await getMeasurementRepository();
    return repo.search()
      .where('user').equals(userId)
      .sortBy('version', 'DESC')
      .return.page(0, limit);
  },

  /**
   * Get queued measurements for a cycle
   */
  async getQueuedForCycle(cycleNumber) {
    const repo = await getMeasurementRepository();
    return repo.search()
      .where('queuedForCycle').equals(cycleNumber)
      .where('isActive').equals(false)
      .return.all();
  },

  /**
   * Make measurement active
   */
  async makeActive(id) {
    const repo = await getMeasurementRepository();
    const measurement = await repo.fetch(id);
    if (!measurement || !measurement.user) return null;

    // Deactivate all other measurements for this user
    const userMeasurements = await repo.search()
      .where('user').equals(measurement.user)
      .return.all();

    for (const m of userMeasurements) {
      if (m.entityId !== id && m.isActive) {
        m.isActive = false;
        m.updatedAt = new Date();
        await repo.save(m);
      }
    }

    // Activate this measurement
    measurement.isActive = true;
    measurement.appliedAt = new Date();
    measurement.updatedAt = new Date();
    await repo.save(measurement);

    return measurement;
  },

  /**
   * Queue measurement for next cycle
   */
  async queueForNextCycle(id, cycleNumber) {
    const repo = await getMeasurementRepository();
    const measurement = await repo.fetch(id);
    if (!measurement || !measurement.user) return null;

    measurement.queuedForCycle = cycleNumber;
    measurement.updatedAt = new Date();
    await repo.save(measurement);

    return measurement;
  },
};

export default MeasurementModel;
