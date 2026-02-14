import { getRedisClient } from '../../infrastructure/database/redis.js';

/**
 * Generic Redis Model Factory
 * Creates simple CRUD models for Redis storage
 */
export function createRedisModel(entityName) {
  const prefix = `${entityName}:`;
  const indexPrefix = `${entityName}:index:`;

  return {
    entityName,
    prefix,
    indexPrefix,

    getKey(id) {
      return `${prefix}${id}`;
    },

    getIndexKey(field, value) {
      return `${indexPrefix}${field}:${value}`;
    },

    async create(data, id = null) {
      const client = getRedisClient();
      const { v4: uuidv4 } = await import('uuid');
      const entityId = id || uuidv4();

      const entity = {
        id: entityId,
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await client.set(this.getKey(entityId), JSON.stringify(entity));
      return entity;
    },

    async findById(id) {
      const client = getRedisClient();
      const data = await client.get(this.getKey(id));
      return data ? JSON.parse(data) : null;
    },

    async findByField(field, value) {
      const client = getRedisClient();
      const id = await client.get(this.getIndexKey(field, value));
      return id ? this.findById(id) : null;
    },

    async update(id, updateData) {
      const client = getRedisClient();
      const current = await this.findById(id);

      if (!current) {
        throw new Error(`${this.entityName} with id ${id} not found`);
      }

      const updated = {
        ...current,
        ...updateData,
        id: current.id,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };

      await client.set(this.getKey(id), JSON.stringify(updated));
      return updated;
    },

    async delete(id) {
      const client = getRedisClient();
      const result = await client.del(this.getKey(id));
      return result > 0;
    },

    async findAll(limit = 100) {
      const client = getRedisClient();
      const pattern = `${prefix}*`;
      const result = await client.scan(0, {
        MATCH: pattern,
        COUNT: limit,
      });

      const entities = [];
      for (const key of result.keys) {
        const data = await client.get(key);
        if (data) {
          entities.push(JSON.parse(data));
        }
      }

      return entities;
    },

    async count() {
      const client = getRedisClient();
      const pattern = `${prefix}*`;
      let count = 0;
      let cursor = '0';

      do {
        const result = await client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        count += result.keys.length;
        cursor = result.cursor;
      } while (cursor !== '0');

      return count;
    },

    async deleteAll() {
      const client = getRedisClient();
      const pattern = `${prefix}*`;
      let deleted = 0;
      let cursor = '0';

      do {
        const result = await client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });
        for (const key of result.keys) {
          await client.del(key);
          deleted++;
        }
        cursor = result.cursor;
      } while (cursor !== '0');

      return deleted;
    },
  };
}

export default createRedisModel;
