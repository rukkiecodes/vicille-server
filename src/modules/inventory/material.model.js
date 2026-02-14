import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateSku } from '../../core/utils/randomCode.js';

// Material Entity class
class Model {
  // Get parsed properties
  get propertiesParsed() {
    return this.properties ? JSON.parse(this.properties) : null;
  }

  // Get parsed images
  get imagesParsed() {
    return this.images ? JSON.parse(this.images) : [];
  }

  // Virtual for isLowStock
  get isLowStock() {
    return this.quantityInStock <= this.reorderLevel;
  }

  // Virtual for stockValue
  get stockValue() {
    return this.quantityInStock * this.costPerUnit;
  }

  // Virtual for primaryImage
  get primaryImage() {
    const images = this.imagesParsed;
    return images && images.length > 0 ? images[0] : null;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      name: this.name,
      sku: this.sku,
      category: this.category,
      description: this.description,
      supplier: this.supplier,
      quantityInStock: this.quantityInStock,
      unit: this.unit,
      reorderLevel: this.reorderLevel,
      reorderQuantity: this.reorderQuantity,
      costPerUnit: this.costPerUnit,
      currency: this.currency,
      properties: this.propertiesParsed,
      images: this.imagesParsed,
      isActive: this.isActive,
      lastRestocked: this.lastRestocked,
      lastIssued: this.lastIssued,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isLowStock: this.isLowStock,
      stockValue: this.stockValue,
      primaryImage: this.primaryImage,
    };
  }
}

// Material Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const MaterialModel = {
  /**
   * Create a new material
   */
  async create(materialData) {
    const repo = await getMaterialRepository();

    const now = new Date();
    const prefix = materialData.category ? materialData.category.substring(0, 3).toUpperCase() : 'MAT';
    const sku = materialData.sku || generateSku(prefix);

    const material = await repo.save({
      name: materialData.name,
      sku,
      category: materialData.category,
      description: materialData.description,
      supplier: materialData.supplier,
      quantityInStock: materialData.quantityInStock || 0,
      unit: materialData.unit,
      reorderLevel: materialData.reorderLevel ?? 10,
      reorderQuantity: materialData.reorderQuantity ?? 50,
      costPerUnit: materialData.costPerUnit,
      currency: materialData.currency || 'NGN',
      properties: materialData.properties ? JSON.stringify(materialData.properties) : null,
      images: materialData.images ? JSON.stringify(materialData.images) : '[]',
      isActive: materialData.isActive ?? true,
      lastRestocked: materialData.lastRestocked,
      lastIssued: materialData.lastIssued,
      createdBy: materialData.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    return material;
  },

  /**
   * Find material by ID
   */
  async findById(id) {
    const repo = await getMaterialRepository();
    const material = await repo.fetch(id);
    if (!material || !material.sku) return null;
    return material;
  },

  /**
   * Find material by SKU
   */
  async findBySku(sku) {
    const repo = await getMaterialRepository();
    const material = await repo.search()
      .where('sku').equals(sku)
      .return.first();
    return material;
  },

  /**
   * Update material by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getMaterialRepository();
    const material = await repo.fetch(id);
    if (!material || !material.sku) return null;

    // Serialize complex objects
    if (updateData.properties && typeof updateData.properties === 'object') {
      updateData.properties = JSON.stringify(updateData.properties);
    }
    if (updateData.images && typeof updateData.images === 'object') {
      updateData.images = JSON.stringify(updateData.images);
    }

    // Update fields
    Object.assign(material, updateData, { updatedAt: new Date() });
    await repo.save(material);

    return options.new !== false ? material : null;
  },

  /**
   * Add stock to material
   */
  async addStock(id, quantity) {
    const repo = await getMaterialRepository();
    const material = await repo.fetch(id);
    if (!material || !material.sku) return null;

    material.quantityInStock += quantity;
    material.lastRestocked = new Date();
    material.updatedAt = new Date();
    await repo.save(material);

    return material;
  },

  /**
   * Deduct stock from material
   */
  async deductStock(id, quantity) {
    const repo = await getMaterialRepository();
    const material = await repo.fetch(id);
    if (!material || !material.sku) return null;

    if (quantity > material.quantityInStock) {
      throw new Error('Insufficient stock');
    }

    material.quantityInStock -= quantity;
    material.lastIssued = new Date();
    material.updatedAt = new Date();
    await repo.save(material);

    return material;
  },

  /**
   * Find low stock materials
   */
  async findLowStock() {
    const repo = await getMaterialRepository();
    const materials = await repo.search()
      .where('isActive').equals(true)
      .sortBy('quantityInStock', 'ASC')
      .return.all();

    // Filter for low stock (quantityInStock <= reorderLevel)
    return materials.filter(m => m.quantityInStock <= m.reorderLevel);
  },

  /**
   * Find materials by category
   */
  async findByCategory(category) {
    const repo = await getMaterialRepository();
    return repo.search()
      .where('category').equals(category)
      .where('isActive').equals(true)
      .return.all();
  },

  /**
   * Search materials
   */
  async search(query) {
    const repo = await getMaterialRepository();
    const materials = await repo.search()
      .where('isActive').equals(true)
      .return.all();

    // Filter by search query (name, sku, description)
    const regex = new RegExp(query, 'i');
    return materials.filter(m =>
      regex.test(m.name) || regex.test(m.sku) || regex.test(m.description)
    );
  },

  /**
   * Find all materials with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getMaterialRepository();
    let search = repo.search();

    // Apply filters
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

    const materials = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return materials;
  },

  /**
   * Count materials
   */
  async countDocuments(query = {}) {
    const repo = await getMaterialRepository();
    let search = repo.search();

    if (query.category) {
      search = search.where('category').equals(query.category);
    }
    if (query.isActive !== undefined) {
      search = search.where('isActive').equals(query.isActive);
    }

    return search.return.count();
  },

  /**
   * Delete material (hard delete)
   */
  async delete(id) {
    const repo = await getMaterialRepository();
    await repo.remove(id);
  },
};

export default MaterialModel;
