import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateSku } from '../../core/utils/randomCode.js';

// Accessory Entity class
class Model {
  // Get parsed images
  get imagesParsed() {
    return this.images ? JSON.parse(this.images) : [];
  }

  // Get parsed variants
  get variantsParsed() {
    return this.variants ? JSON.parse(this.variants) : [];
  }

  // Virtual for primary image
  get primaryImage() {
    const images = this.imagesParsed;
    if (!images || images.length === 0) return null;
    return images.find((img) => img.isPrimary) || images[0];
  }

  // Virtual for total stock
  get totalStock() {
    const variants = this.variantsParsed;
    if (!variants || variants.length === 0) return 0;
    return variants.reduce((sum, v) => sum + v.quantityInStock, 0);
  }

  // Virtual for isInStock
  get isInStock() {
    return this.totalStock > 0;
  }

  // Virtual for formattedPrice
  get formattedPrice() {
    const amount = this.basePrice / 100;
    return `₦${amount.toLocaleString()}`;
  }

  // Get variant by SKU
  getVariant(variantSku) {
    const variants = this.variantsParsed;
    return variants.find((v) => v.sku === variantSku);
  }

  // Check variant stock
  checkVariantStock(variantSku, quantity) {
    const variant = this.getVariant(variantSku);
    if (!variant) return false;
    return variant.quantityInStock >= quantity;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      name: this.name,
      sku: this.sku,
      category: this.category,
      description: this.description,
      images: this.imagesParsed,
      variants: this.variantsParsed,
      basePrice: this.basePrice,
      currency: this.currency,
      isActive: this.isActive,
      displayOrder: this.displayOrder,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      primaryImage: this.primaryImage,
      totalStock: this.totalStock,
      isInStock: this.isInStock,
      formattedPrice: this.formattedPrice,
    };
  }
}

// Accessory Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const AccessoryModel = {
  /**
   * Create a new accessory
   */
  async create(accessoryData) {
    const repo = await getAccessoryRepository();

    const now = new Date();
    const sku = accessoryData.sku || generateSku('ACC');

    const accessory = await repo.save({
      name: accessoryData.name,
      sku,
      category: accessoryData.category,
      description: accessoryData.description,
      images: accessoryData.images ? JSON.stringify(accessoryData.images) : '[]',
      variants: accessoryData.variants ? JSON.stringify(accessoryData.variants) : '[]',
      basePrice: accessoryData.basePrice,
      currency: accessoryData.currency || 'NGN',
      isActive: accessoryData.isActive ?? true,
      displayOrder: accessoryData.displayOrder || 0,
      createdAt: now,
      updatedAt: now,
    });

    return accessory;
  },

  /**
   * Find accessory by ID
   */
  async findById(id) {
    const repo = await getAccessoryRepository();
    const accessory = await repo.fetch(id);
    if (!accessory || !accessory.sku) return null;
    return accessory;
  },

  /**
   * Find accessory by SKU
   */
  async findBySku(sku) {
    const repo = await getAccessoryRepository();
    const accessory = await repo.search()
      .where('sku').equals(sku)
      .return.first();
    return accessory;
  },

  /**
   * Update accessory by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getAccessoryRepository();
    const accessory = await repo.fetch(id);
    if (!accessory || !accessory.sku) return null;

    // Serialize complex objects
    if (updateData.images && typeof updateData.images === 'object') {
      updateData.images = JSON.stringify(updateData.images);
    }
    if (updateData.variants && typeof updateData.variants === 'object') {
      updateData.variants = JSON.stringify(updateData.variants);
    }

    // Update fields
    Object.assign(accessory, updateData, { updatedAt: new Date() });
    await repo.save(accessory);

    return options.new !== false ? accessory : null;
  },

  /**
   * Deduct variant stock
   */
  async deductVariantStock(id, variantSku, quantity) {
    const repo = await getAccessoryRepository();
    const accessory = await repo.fetch(id);
    if (!accessory || !accessory.sku) return null;

    const variants = accessory.variantsParsed;
    const variant = variants.find((v) => v.sku === variantSku);

    if (!variant) {
      throw new Error('Variant not found');
    }
    if (variant.quantityInStock < quantity) {
      throw new Error('Insufficient stock');
    }

    variant.quantityInStock -= quantity;
    accessory.variants = JSON.stringify(variants);
    accessory.updatedAt = new Date();
    await repo.save(accessory);

    return accessory;
  },

  /**
   * Find by category
   */
  async findByCategory(category) {
    const repo = await getAccessoryRepository();
    return repo.search()
      .where('category').equals(category)
      .where('isActive').equals(true)
      .sortBy('displayOrder', 'ASC')
      .return.all();
  },

  /**
   * Find in stock
   */
  async findInStock() {
    const repo = await getAccessoryRepository();
    const accessories = await repo.search()
      .where('isActive').equals(true)
      .sortBy('displayOrder', 'ASC')
      .return.all();

    // Filter for accessories with stock
    return accessories.filter(a => a.totalStock > 0);
  },

  /**
   * Search accessories
   */
  async search(query) {
    const repo = await getAccessoryRepository();
    const accessories = await repo.search()
      .where('isActive').equals(true)
      .return.all();

    // Filter by search query (name, description, sku)
    const regex = new RegExp(query, 'i');
    return accessories.filter(a =>
      regex.test(a.name) || regex.test(a.description) || regex.test(a.sku)
    );
  },

  /**
   * Find all accessories with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getAccessoryRepository();
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

    const accessories = await search
      .sortBy('displayOrder', 'ASC')
      .return.page(offset, limit);

    return accessories;
  },

  /**
   * Count accessories
   */
  async countDocuments(query = {}) {
    const repo = await getAccessoryRepository();
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
   * Delete accessory (hard delete)
   */
  async delete(id) {
    const repo = await getAccessoryRepository();
    await repo.remove(id);
  },
};

export default AccessoryModel;
