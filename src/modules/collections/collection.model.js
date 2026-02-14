import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateUniqueSlug } from '../../core/utils/randomCode.js';

// Collection Entity class
class Model {
  // Get parsed period
  get periodParsed() {
    return this.period ? JSON.parse(this.period) : null;
  }

  // Get parsed cover image
  get coverImageParsed() {
    return this.coverImage ? JSON.parse(this.coverImage) : null;
  }

  // Get display name
  get displayName() {
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const period = this.periodParsed;
    if (!period) return this.name;
    return `${monthNames[period.month - 1]} ${period.year} Collection`;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      name: this.name,
      slug: this.slug,
      description: this.description,
      theme: this.theme,
      period: this.periodParsed,
      coverImage: this.coverImageParsed,
      isActive: this.isActive,
      isCurrent: this.isCurrent,
      createdBy: this.createdBy,
      displayName: this.displayName,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// Collection Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const CollectionModel = {
  /**
   * Create a new collection
   */
  async create(collectionData) {
    const repo = await getCollectionRepository();

    const now = new Date();
    const slug = collectionData.slug || generateUniqueSlug(collectionData.name);

    const collection = await repo.save({
      name: collectionData.name,
      slug,
      description: collectionData.description,
      theme: collectionData.theme,
      period: collectionData.period ? JSON.stringify(collectionData.period) : null,
      coverImage: collectionData.coverImage ? JSON.stringify(collectionData.coverImage) : null,
      isActive: collectionData.isActive !== undefined ? collectionData.isActive : true,
      isCurrent: collectionData.isCurrent || false,
      createdBy: collectionData.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return collection;
  },

  /**
   * Find collection by ID
   */
  async findById(id) {
    const repo = await getCollectionRepository();
    const collection = await repo.fetch(id);
    if (!collection || !collection.name) return null;
    return collection;
  },

  /**
   * Find collection by slug
   */
  async findBySlug(slug) {
    const repo = await getCollectionRepository();
    const collection = await repo.search()
      .where('slug').equals(slug)
      .where('isActive').equals(true)
      .return.first();
    return collection;
  },

  /**
   * Update collection by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getCollectionRepository();
    const collection = await repo.fetch(id);
    if (!collection || !collection.name) return null;

    // Serialize complex objects
    const jsonFields = ['period', 'coverImage'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(collection, updateData, { updatedAt: new Date() });
    await repo.save(collection);

    return options.new !== false ? collection : null;
  },

  /**
   * Set collection as current
   */
  async setAsCurrent(id) {
    const repo = await getCollectionRepository();

    // Remove current flag from all other collections
    const allCollections = await repo.search()
      .where('isCurrent').equals(true)
      .return.all();

    for (const coll of allCollections) {
      if (coll.entityId !== id) {
        coll.isCurrent = false;
        coll.updatedAt = new Date();
        await repo.save(coll);
      }
    }

    // Set this collection as current
    const collection = await repo.fetch(id);
    if (!collection || !collection.name) return null;

    collection.isCurrent = true;
    collection.updatedAt = new Date();
    await repo.save(collection);

    return collection;
  },

  /**
   * Find current collection
   */
  async findCurrent() {
    const repo = await getCollectionRepository();
    return repo.search()
      .where('isCurrent').equals(true)
      .where('isActive').equals(true)
      .return.first();
  },

  /**
   * Find active collections
   */
  async findActive() {
    const repo = await getCollectionRepository();
    return repo.search()
      .where('isActive').equals(true)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Find all collections with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getCollectionRepository();
    let search = repo.search();

    // Apply filters
    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }
    if (query.isCurrent !== undefined) {
      search = search.where('isCurrent').equals(query.isCurrent);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const collections = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return collections;
  },

  /**
   * Count collections
   */
  async countDocuments(query = {}) {
    const repo = await getCollectionRepository();
    let search = repo.search();

    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }
    if (query.isCurrent !== undefined) {
      search = search.where('isCurrent').equals(query.isCurrent);
    }

    return search.return.count();
  },

  /**
   * Delete collection (hard delete)
   */
  async delete(id) {
    const repo = await getCollectionRepository();
    await repo.remove(id);
  },
};

export default CollectionModel;
