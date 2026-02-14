import { v4 as uuidv4 } from 'uuid';
import { getRedisClient } from './redis.js';

/**
 * Base Redis Repository for data persistence
 * Handles CRUD operations with automatic TTL management
 */
export class RedisRepository {
  constructor(entityName, defaultTTL = null) {
    this.entityName = entityName;
    this.defaultTTL = defaultTTL;
    this.keyPrefix = `${entityName}:`;
    this.indexPrefix = `${entityName}:index:`;
  }

  /**
   * Get fully qualified key
   */
  getKey(id) {
    return `${this.keyPrefix}${id}`;
  }

  /**
   * Get index key
   */
  getIndexKey(field) {
    return `${this.indexPrefix}${field}`;
  }

  /**
   * Create a new entity
   */
  async create(data, id = null) {
    const client = getRedisClient();
    const entityId = id || uuidv4();
    const key = this.getKey(entityId);

    // Add timestamps
    const entity = {
      id: entityId,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Store the entity
    const options = {};
    if (this.defaultTTL) {
      options.EX = this.defaultTTL;
    }

    await client.set(key, JSON.stringify(entity), options);

    // Create indexes for indexed fields
    if (data.email) {
      await client.set(
        this.getIndexKey(`email:${data.email}`),
        entityId,
        { EX: this.defaultTTL }
      );
    }
    if (data.phone) {
      await client.set(
        this.getIndexKey(`phone:${data.phone}`),
        entityId,
        { EX: this.defaultTTL }
      );
    }

    return this.formatEntity(entity);
  }

  /**
   * Find entity by ID
   */
  async findById(id) {
    const client = getRedisClient();
    const key = this.getKey(id);
    const data = await client.get(key);

    if (!data) {
      return null;
    }

    return this.formatEntity(JSON.parse(data));
  }

  /**
   * Find entity by indexed field
   */
  async findByField(field, value) {
    const client = getRedisClient();
    const indexKey = this.getIndexKey(`${field}:${value}`);
    const id = await client.get(indexKey);

    if (!id) {
      return null;
    }

    return this.findById(id);
  }

  /**
   * Find by email
   */
  async findByEmail(email) {
    return this.findByField('email', email);
  }

  /**
   * Update entity
   */
  async update(id, data) {
    const client = getRedisClient();
    const key = this.getKey(id);

    // Get current entity
    const current = await this.findById(id);
    if (!current) {
      throw new Error(`Entity with id ${id} not found`);
    }

    // Merge data
    const updated = {
      ...current,
      ...data,
      id: current.id, // Don't allow id change
      createdAt: current.createdAt, // Don't allow creation date change
      updatedAt: new Date().toISOString(),
    };

    // Store updated entity
    const options = {};
    if (this.defaultTTL) {
      options.EX = this.defaultTTL;
    }

    await client.set(key, JSON.stringify(updated), options);

    // Update indexes if relevant fields changed
    if (data.email !== undefined && data.email !== current.email) {
      // Remove old email index
      if (current.email) {
        await client.del(this.getIndexKey(`email:${current.email}`));
      }
      // Create new email index
      if (data.email) {
        await client.set(
          this.getIndexKey(`email:${data.email}`),
          id,
          { EX: this.defaultTTL }
        );
      }
    }

    return this.formatEntity(updated);
  }

  /**
   * Delete entity
   */
  async delete(id) {
    const client = getRedisClient();
    const current = await this.findById(id);

    if (!current) {
      return false;
    }

    // Delete indexes
    if (current.email) {
      await client.del(this.getIndexKey(`email:${current.email}`));
    }
    if (current.phone) {
      await client.del(this.getIndexKey(`phone:${current.phone}`));
    }

    // Delete entity
    const deleteCount = await client.del(this.getKey(id));
    return deleteCount > 0;
  }

  /**
   * Find all entities (scan operation)
   * Note: For large datasets, use proper pagination with SCAN
   */
  async findAll(limit = 100, cursor = '0') {
    const client = getRedisClient();
    const pattern = `${this.keyPrefix}*`;

    const result = await client.scan(cursor, {
      MATCH: pattern,
      COUNT: limit,
    });

    const entities = [];
    for (const key of result.keys) {
      const data = await client.get(key);
      if (data) {
        entities.push(this.formatEntity(JSON.parse(data)));
      }
    }

    return {
      entities,
      cursor: result.cursor,
    };
  }

  /**
   * Check if entity exists
   */
  async exists(id) {
    const client = getRedisClient();
    const key = this.getKey(id);
    return (await client.exists(key)) === 1;
  }

  /**
   * Format entity data (override in subclasses for custom formatting)
   */
  formatEntity(data) {
    return data;
  }

  /**
   * Get total count of entities
   */
  async count() {
    const client = getRedisClient();
    const pattern = `${this.keyPrefix}*`;
    let count = 0;
    let cursor = '0';

    do {
      const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      count += result.keys.length;
      cursor = result.cursor;
    } while (cursor !== '0');

    return count;
  }

  /**
   * Delete all entities (use with caution)
   */
  async deleteAll() {
    const client = getRedisClient();
    const pattern = `${this.keyPrefix}*`;
    let cursor = '0';
    let deleted = 0;

    do {
      const result = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
      for (const key of result.keys) {
        await client.del(key);
        deleted++;
      }
      cursor = result.cursor;
    } while (cursor !== '0');

    return deleted;
  }
}

export default RedisRepository;
