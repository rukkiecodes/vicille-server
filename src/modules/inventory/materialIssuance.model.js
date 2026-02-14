import { getRedisClient } from '../../infrastructure/database/redis.js';

// MaterialIssuance Entity class
class Model {
  // Get parsed materials
  get materialsParsed() {
    return this.materials ? JSON.parse(this.materials) : [];
  }

  // Get parsed returns
  get returnsParsed() {
    return this.returns ? JSON.parse(this.returns) : [];
  }

  // Get parsed losses
  get lossesParsed() {
    return this.losses ? JSON.parse(this.losses) : [];
  }

  // Virtual for totalMaterialCount
  get totalMaterialCount() {
    const materials = this.materialsParsed;
    return materials?.length || 0;
  }

  // Virtual for hasReturns
  get hasReturns() {
    const returns = this.returnsParsed;
    return returns && returns.length > 0;
  }

  // Virtual for hasLosses
  get hasLosses() {
    const losses = this.lossesParsed;
    return losses && losses.length > 0;
  }

  // Virtual for totalPenalty
  get totalPenalty() {
    const losses = this.lossesParsed;
    if (!losses) return 0;
    return losses.reduce((sum, loss) => sum + (loss.penaltyAmount || 0), 0);
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      job: this.job,
      clientTag: this.clientTag,
      issuedTo: this.issuedTo,
      issuedBy: this.issuedBy,
      materials: this.materialsParsed,
      status: this.status,
      issuedAt: this.issuedAt,
      receivedAt: this.receivedAt,
      returns: this.returnsParsed,
      losses: this.lossesParsed,
      notes: this.notes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      totalMaterialCount: this.totalMaterialCount,
      hasReturns: this.hasReturns,
      hasLosses: this.hasLosses,
      totalPenalty: this.totalPenalty,
    };
  }
}

// MaterialIssuance Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const MaterialIssuanceModel = {
  /**
   * Create a new material issuance
   */
  async create(issuanceData) {
    const repo = await getMaterialIssuanceRepository();

    const now = new Date();

    const issuance = await repo.save({
      job: issuanceData.job,
      clientTag: issuanceData.clientTag,
      issuedTo: issuanceData.issuedTo,
      issuedBy: issuanceData.issuedBy,
      materials: issuanceData.materials ? JSON.stringify(issuanceData.materials) : '[]',
      status: issuanceData.status || 'issued',
      issuedAt: issuanceData.issuedAt || now,
      receivedAt: issuanceData.receivedAt,
      returns: issuanceData.returns ? JSON.stringify(issuanceData.returns) : '[]',
      losses: issuanceData.losses ? JSON.stringify(issuanceData.losses) : '[]',
      notes: issuanceData.notes,
      createdAt: now,
      updatedAt: now,
    });

    return issuance;
  },

  /**
   * Find issuance by ID
   */
  async findById(id) {
    const repo = await getMaterialIssuanceRepository();
    const issuance = await repo.fetch(id);
    if (!issuance || !issuance.job) return null;
    return issuance;
  },

  /**
   * Update issuance by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getMaterialIssuanceRepository();
    const issuance = await repo.fetch(id);
    if (!issuance || !issuance.job) return null;

    // Serialize complex objects
    const jsonFields = ['materials', 'returns', 'losses'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(issuance, updateData, { updatedAt: new Date() });
    await repo.save(issuance);

    return options.new !== false ? issuance : null;
  },

  /**
   * Acknowledge receipt
   */
  async acknowledgeReceipt(id) {
    const repo = await getMaterialIssuanceRepository();
    const issuance = await repo.fetch(id);
    if (!issuance || !issuance.job) return null;

    issuance.status = 'received';
    issuance.receivedAt = new Date();
    issuance.updatedAt = new Date();
    await repo.save(issuance);

    return issuance;
  },

  /**
   * Record return
   */
  async recordReturn(id, materialId, quantity, reason, receivedBy) {
    const repo = await getMaterialIssuanceRepository();
    const issuance = await repo.fetch(id);
    if (!issuance || !issuance.job) return null;

    const returns = issuance.returnsParsed;
    returns.push({
      material: materialId,
      quantityReturned: quantity,
      reason,
      returnedAt: new Date().toISOString(),
      receivedBy,
    });

    // Update status
    const materials = issuance.materialsParsed;
    const totalIssued = materials.reduce((sum, m) => sum + m.quantityIssued, 0);
    const totalReturned = returns.reduce((sum, r) => sum + r.quantityReturned, 0);

    if (totalReturned >= totalIssued) {
      issuance.status = 'fully_returned';
    } else {
      issuance.status = 'partially_returned';
    }

    issuance.returns = JSON.stringify(returns);
    issuance.updatedAt = new Date();
    await repo.save(issuance);

    return issuance;
  },

  /**
   * Record loss
   */
  async recordLoss(id, materialId, quantity, reason, penaltyAmount = 0) {
    const repo = await getMaterialIssuanceRepository();
    const issuance = await repo.fetch(id);
    if (!issuance || !issuance.job) return null;

    const losses = issuance.lossesParsed;
    losses.push({
      material: materialId,
      quantityLost: quantity,
      reason,
      reportedAt: new Date().toISOString(),
      penaltyAmount,
    });

    issuance.status = 'lost';
    issuance.losses = JSON.stringify(losses);
    issuance.updatedAt = new Date();
    await repo.save(issuance);

    return issuance;
  },

  /**
   * Find by job
   */
  async findByJob(jobId) {
    const repo = await getMaterialIssuanceRepository();
    const issuance = await repo.search()
      .where('job').equals(jobId)
      .return.first();
    return issuance;
  },

  /**
   * Find by tailor
   */
  async findByTailor(tailorId, status = null) {
    const repo = await getMaterialIssuanceRepository();
    let search = repo.search().where('issuedTo').equals(tailorId);

    if (status) {
      search = search.where('status').equals(status);
    }

    return search.sortBy('issuedAt', 'DESC').return.all();
  },

  /**
   * Find pending receipt
   */
  async findPendingReceipt() {
    const repo = await getMaterialIssuanceRepository();
    return repo.search()
      .where('status').equals('issued')
      .sortBy('issuedAt', 'ASC')
      .return.all();
  },

  /**
   * Find all issuances with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getMaterialIssuanceRepository();
    let search = repo.search();

    // Apply filters
    if (query.job) {
      search = search.where('job').equals(query.job);
    }
    if (query.clientTag) {
      search = search.where('clientTag').equals(query.clientTag);
    }
    if (query.issuedTo) {
      search = search.where('issuedTo').equals(query.issuedTo);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const issuances = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return issuances;
  },

  /**
   * Count issuances
   */
  async countDocuments(query = {}) {
    const repo = await getMaterialIssuanceRepository();
    let search = repo.search();

    if (query.job) {
      search = search.where('job').equals(query.job);
    }
    if (query.issuedTo) {
      search = search.where('issuedTo').equals(query.issuedTo);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    return search.return.count();
  },

  /**
   * Delete issuance (hard delete)
   */
  async delete(id) {
    const repo = await getMaterialIssuanceRepository();
    await repo.remove(id);
  },
};

export default MaterialIssuanceModel;
