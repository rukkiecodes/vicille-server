import { getRedisClient } from '../../infrastructure/database/redis.js';

// AuditLog Entity class
class Model {
  // Get parsed actor
  get actorParsed() {
    return this.actor ? JSON.parse(this.actor) : null;
  }

  // Get parsed target
  get targetParsed() {
    return this.target ? JSON.parse(this.target) : null;
  }

  // Get parsed changes
  get changesParsed() {
    return this.changes ? JSON.parse(this.changes) : null;
  }

  // Get parsed metadata
  get metadataParsed() {
    return this.metadata ? JSON.parse(this.metadata) : null;
  }

  // Convert to safe JSON
  toSafeJSON() {
    return {
      id: this.entityId,
      eventType: this.eventType,
      eventCategory: this.eventCategory,
      actor: this.actorParsed,
      target: this.targetParsed,
      changes: this.changesParsed,
      metadata: this.metadataParsed,
      description: this.description,
      severity: this.severity,
      timestamp: this.timestamp,
      createdAt: this.createdAt,
    };
  }
}

// AuditLog Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods
const AuditLogModel = {
  /**
   * Create a new audit log entry
   */
  async create(logData) {
    const repo = await getAuditLogRepository();

    const now = new Date();

    const auditLog = await repo.save({
      eventType: logData.eventType,
      eventCategory: logData.eventCategory,
      actor: logData.actor ? JSON.stringify(logData.actor) : null,
      actorId: logData.actor?.id,
      target: logData.target ? JSON.stringify(logData.target) : null,
      targetId: logData.target?.id,
      targetType: logData.target?.type,
      changes: logData.changes ? JSON.stringify(logData.changes) : null,
      metadata: logData.metadata ? JSON.stringify(logData.metadata) : null,
      description: logData.description,
      severity: logData.severity || 'info',
      timestamp: logData.timestamp || now,
      createdAt: now,
    });

    return auditLog;
  },

  /**
   * Log an event (alias for create with additional processing)
   */
  async logEvent(eventData) {
    return this.create({
      eventType: eventData.eventType,
      eventCategory: eventData.eventCategory,
      actor: eventData.actor,
      target: eventData.target,
      changes: eventData.changes,
      metadata: eventData.metadata,
      description: eventData.description,
      severity: eventData.severity || 'info',
      timestamp: new Date(),
    });
  },

  /**
   * Find audit log by ID
   */
  async findById(id) {
    const repo = await getAuditLogRepository();
    const auditLog = await repo.fetch(id);
    if (!auditLog || !auditLog.eventType) return null;
    return auditLog;
  },

  /**
   * Find audit logs by actor
   */
  async findByActor(actorId, options = {}) {
    const repo = await getAuditLogRepository();
    let search = repo.search()
      .where('actorId').equals(actorId);

    if (options.category) {
      search = search.where('eventCategory').equals(options.category);
    }

    const limit = options.limit || 100;
    return search
      .sortBy('timestamp', 'DESC')
      .return.page(0, limit);
  },

  /**
   * Find audit logs by target
   */
  async findByTarget(targetType, targetId, options = {}) {
    const repo = await getAuditLogRepository();
    let search = repo.search()
      .where('targetType').equals(targetType)
      .where('targetId').equals(targetId);

    const limit = options.limit || 50;
    return search
      .sortBy('timestamp', 'DESC')
      .return.page(0, limit);
  },

  /**
   * Find audit logs by event type
   */
  async findByEventType(eventType, options = {}) {
    const repo = await getAuditLogRepository();
    let search = repo.search()
      .where('eventType').equals(eventType);

    const limit = options.limit || 100;
    return search
      .sortBy('timestamp', 'DESC')
      .return.page(0, limit);
  },

  /**
   * Find critical audit logs
   */
  async findCritical(startDate, endDate) {
    const repo = await getAuditLogRepository();
    const logs = await repo.search()
      .where('severity').equals('critical')
      .sortBy('timestamp', 'DESC')
      .return.all();

    // Filter by date range in memory (Redis OM date range queries are limited)
    return logs.filter(log => {
      const timestamp = new Date(log.timestamp);
      return timestamp >= startDate && timestamp <= endDate;
    });
  },

  /**
   * Get activity summary for an actor
   */
  async getActivitySummary(actorId, startDate, endDate) {
    const repo = await getAuditLogRepository();
    const logs = await repo.search()
      .where('actorId').equals(actorId)
      .return.all();

    // Filter by date range and group by category
    const filteredLogs = logs.filter(log => {
      const timestamp = new Date(log.timestamp);
      return timestamp >= startDate && timestamp <= endDate;
    });

    const summary = {};
    for (const log of filteredLogs) {
      if (!summary[log.eventCategory]) {
        summary[log.eventCategory] = 0;
      }
      summary[log.eventCategory]++;
    }

    return summary;
  },

  /**
   * Update audit log by ID (Note: Audit logs are typically immutable)
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getAuditLogRepository();
    const auditLog = await repo.fetch(id);
    if (!auditLog || !auditLog.eventType) return null;

    const jsonFields = ['actor', 'target', 'changes', 'metadata'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update extracted fields if parent objects change
    if (updateData.actor) {
      const actorObj = typeof updateData.actor === 'string'
        ? JSON.parse(updateData.actor)
        : updateData.actor;
      updateData.actorId = actorObj.id;
    }
    if (updateData.target) {
      const targetObj = typeof updateData.target === 'string'
        ? JSON.parse(updateData.target)
        : updateData.target;
      updateData.targetId = targetObj.id;
      updateData.targetType = targetObj.type;
    }

    Object.assign(auditLog, updateData);
    await repo.save(auditLog);

    return options.new !== false ? auditLog : null;
  },

  /**
   * Find audit logs with filters
   */
  async find(query = {}, options = {}) {
    const repo = await getAuditLogRepository();
    let search = repo.search();

    if (query.eventType) {
      search = search.where('eventType').equals(query.eventType);
    }
    if (query.eventCategory) {
      search = search.where('eventCategory').equals(query.eventCategory);
    }
    if (query.actorId || query['actor.id']) {
      search = search.where('actorId').equals(query.actorId || query['actor.id']);
    }
    if (query.targetId || query['target.id']) {
      search = search.where('targetId').equals(query.targetId || query['target.id']);
    }
    if (query.severity) {
      search = search.where('severity').equals(query.severity);
    }

    const page = options.page || 1;
    const limit = options.limit || 100;
    const offset = (page - 1) * limit;

    return search
      .sortBy('timestamp', 'DESC')
      .return.page(offset, limit);
  },

  /**
   * Count audit logs
   */
  async countDocuments(query = {}) {
    const repo = await getAuditLogRepository();
    let search = repo.search();

    if (query.eventType) {
      search = search.where('eventType').equals(query.eventType);
    }
    if (query.eventCategory) {
      search = search.where('eventCategory').equals(query.eventCategory);
    }
    if (query.actorId || query['actor.id']) {
      search = search.where('actorId').equals(query.actorId || query['actor.id']);
    }
    if (query.severity) {
      search = search.where('severity').equals(query.severity);
    }

    return search.return.count();
  },

  /**
   * Delete audit log
   */
  async delete(id) {
    const repo = await getAuditLogRepository();
    await repo.remove(id);
  },
};

export default AuditLogModel;
