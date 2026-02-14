import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateSku } from '../../core/utils/randomCode.js';

// CollectionItem Entity class
class Model {
  // Get parsed images array
  get imagesParsed() {
    return this.images ? JSON.parse(this.images) : [];
  }

  // Get parsed fabric options array
  get fabricOptionsParsed() {
    return this.fabricOptions ? JSON.parse(this.fabricOptions) : [];
  }

  // Get parsed tags array
  get tagsParsed() {
    return this.tags ? JSON.parse(this.tags) : [];
  }

  // Get parsed colors array
  get colorsParsed() {
    return this.colors ? JSON.parse(this.colors) : [];
  }

  // Get parsed available sizes array
  get availableSizesParsed() {
    return this.availableSizes ? JSON.parse(this.availableSizes) : [];
  }

  // Get primary image
  get primaryImage() {
    const images = this.imagesParsed;
    if (!images || images.length === 0) return null;
    return images.find((img) => img.isPrimary) || images[0];
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      collection: this.collection,
      name: this.name,
      sku: this.sku,
      category: this.category,
      subcategory: this.subcategory,
      description: this.description,
      images: this.imagesParsed,
      style: this.style,
      tags: this.tagsParsed,
      colors: this.colorsParsed,
      availableSizes: this.availableSizesParsed,
      fabricOptions: this.fabricOptionsParsed,
      complexityLevel: this.complexityLevel,
      estimatedHours: this.estimatedHours,
      isActive: this.isActive,
      displayOrder: this.displayOrder,
      primaryImage: this.primaryImage,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

// CollectionItem Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const CollectionItemModel = {
  /**
   * Create a new collection item
   */
  async create(itemData) {
    const repo = await getCollectionItemRepository();

    const now = new Date();
    const sku = itemData.sku || generateSku();

    const item = await repo.save({
      collection: itemData.collection,
      name: itemData.name,
      sku,
      category: itemData.category,
      subcategory: itemData.subcategory,
      description: itemData.description,
      images: itemData.images ? JSON.stringify(itemData.images) : '[]',
      style: itemData.style,
      tags: itemData.tags ? JSON.stringify(itemData.tags) : '[]',
      colors: itemData.colors ? JSON.stringify(itemData.colors) : '[]',
      availableSizes: itemData.availableSizes ? JSON.stringify(itemData.availableSizes) : '[]',
      fabricOptions: itemData.fabricOptions ? JSON.stringify(itemData.fabricOptions) : '[]',
      complexityLevel: itemData.complexityLevel || 'moderate',
      estimatedHours: itemData.estimatedHours,
      isActive: itemData.isActive !== undefined ? itemData.isActive : true,
      displayOrder: itemData.displayOrder || 0,
      createdAt: now,
      updatedAt: now,
    });

    return item;
  },

  /**
   * Find collection item by ID
   */
  async findById(id) {
    const repo = await getCollectionItemRepository();
    const item = await repo.fetch(id);
    if (!item || !item.name) return null;
    return item;
  },

  /**
   * Find collection item by SKU
   */
  async findBySku(sku) {
    const repo = await getCollectionItemRepository();
    return repo.search()
      .where('sku').equals(sku)
      .return.first();
  },

  /**
   * Update collection item by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getCollectionItemRepository();
    const item = await repo.fetch(id);
    if (!item || !item.name) return null;

    // Serialize complex objects
    const jsonFields = ['images', 'tags', 'colors', 'availableSizes', 'fabricOptions'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(item, updateData, { updatedAt: new Date() });
    await repo.save(item);

    return options.new !== false ? item : null;
  },

  /**
   * Find items by collection
   */
  async findByCollection(collectionId) {
    const repo = await getCollectionItemRepository();
    return repo.search()
      .where('collection').equals(collectionId)
      .where('isActive').equals(true)
      .sortBy('displayOrder', 'ASC')
      .return.all();
  },

  /**
   * Find items by category
   */
  async findByCategory(category) {
    const repo = await getCollectionItemRepository();
    return repo.search()
      .where('category').equals(category)
      .where('isActive').equals(true)
      .sortBy('displayOrder', 'ASC')
      .return.all();
  },

  /**
   * Find all collection items with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getCollectionItemRepository();
    let search = repo.search();

    // Apply filters
    if (query.collection) {
      search = search.where('collection').equals(query.collection);
    }
    if (query.category) {
      search = search.where('category').equals(query.category);
    }
    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const items = await search
      .sortBy('displayOrder', 'ASC')
      .return.page(offset, limit);

    return items;
  },

  /**
   * Count collection items
   */
  async countDocuments(query = {}) {
    const repo = await getCollectionItemRepository();
    let search = repo.search();

    if (query.collection) {
      search = search.where('collection').equals(query.collection);
    }
    if (query.category) {
      search = search.where('category').equals(query.category);
    }
    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }

    return search.return.count();
  },

  /**
   * Delete collection item (hard delete)
   */
  async delete(id) {
    const repo = await getCollectionItemRepository();
    await repo.remove(id);
  },
};

export default CollectionItemModel;
