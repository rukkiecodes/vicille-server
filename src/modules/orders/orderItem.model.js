import { getRedisClient } from '../../infrastructure/database/redis.js';
import { ORDER_ITEM_STATUS } from '../../core/constants/orderStatus.js';

// Valid status transitions
const ITEM_STATUS_TRANSITIONS = {
  pending: ['assigned'],
  assigned: ['in_progress'],
  in_progress: ['completed'],
  completed: ['qc_review'],
  qc_review: ['qc_approved', 'qc_rejected'],
  qc_rejected: ['in_progress'],
};

// OrderItem Entity class
class Model {
  // Get parsed images array
  get imagesParsed() {
    return this.images ? JSON.parse(this.images) : [];
  }

  // Get parsed fabric object
  get fabricParsed() {
    return this.fabric ? JSON.parse(this.fabric) : null;
  }

  // Get parsed customizations object
  get customizationsParsed() {
    return this.customizations ? JSON.parse(this.customizations) : null;
  }

  // Get primary image
  get primaryImage() {
    const images = this.imagesParsed;
    if (!images || images.length === 0) return null;
    return images.find(img => img.isPrimary) || images[0];
  }

  // Check if completed
  get isCompleted() {
    return ['completed', 'qc_approved'].includes(this.itemStatus);
  }

  // Check if pending
  get isPending() {
    return ['pending', 'assigned'].includes(this.itemStatus);
  }

  // Check if status transition is valid
  canTransitionTo(newStatus) {
    const allowedStatuses = ITEM_STATUS_TRANSITIONS[this.itemStatus] || [];
    return allowedStatuses.includes(newStatus);
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      order: this.order,
      collectionItem: this.collectionItem,
      name: this.name,
      category: this.category,
      description: this.description,
      images: this.imagesParsed,
      fabric: this.fabricParsed,
      customizations: this.customizationsParsed,
      assignedTailor: this.assignedTailor,
      job: this.job,
      itemStatus: this.itemStatus,
      qcReview: this.qcReview,
      basePrice: this.basePrice,
      urgencyFee: this.urgencyFee,
      customizationFee: this.customizationFee,
      totalPrice: this.totalPrice,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      primaryImage: this.primaryImage,
      isCompleted: this.isCompleted,
      isPending: this.isPending,
    };
  }
}

// OrderItem Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const OrderItemModel = {
  /**
   * Create a new order item
   */
  async create(itemData) {
    const repo = await getOrderItemRepository();

    const now = new Date();
    const totalPrice = (itemData.basePrice || 0) + (itemData.urgencyFee || 0) + (itemData.customizationFee || 0);

    const item = await repo.save({
      order: itemData.order,
      collectionItem: itemData.collectionItem,
      name: itemData.name,
      category: itemData.category,
      description: itemData.description,
      images: itemData.images ? JSON.stringify(itemData.images) : '[]',
      fabric: itemData.fabric ? JSON.stringify(itemData.fabric) : null,
      customizations: itemData.customizations ? JSON.stringify(itemData.customizations) : null,
      assignedTailor: itemData.assignedTailor,
      job: itemData.job,
      itemStatus: itemData.itemStatus || 'pending',
      qcReview: itemData.qcReview,
      basePrice: itemData.basePrice || 0,
      urgencyFee: itemData.urgencyFee || 0,
      customizationFee: itemData.customizationFee || 0,
      totalPrice: itemData.totalPrice || totalPrice,
      createdAt: now,
      updatedAt: now,
    });

    return item;
  },

  /**
   * Find order item by ID
   */
  async findById(id) {
    const repo = await getOrderItemRepository();
    const item = await repo.fetch(id);
    if (!item || !item.name) return null;
    return item;
  },

  /**
   * Update order item by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getOrderItemRepository();
    const item = await repo.fetch(id);
    if (!item || !item.name) return null;

    // Serialize complex objects
    const jsonFields = ['images', 'fabric', 'customizations'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Recalculate total price if pricing fields changed
    if (updateData.basePrice !== undefined || updateData.urgencyFee !== undefined || updateData.customizationFee !== undefined) {
      const basePrice = updateData.basePrice ?? item.basePrice ?? 0;
      const urgencyFee = updateData.urgencyFee ?? item.urgencyFee ?? 0;
      const customizationFee = updateData.customizationFee ?? item.customizationFee ?? 0;
      updateData.totalPrice = basePrice + urgencyFee + customizationFee;
    }

    // Update fields
    Object.assign(item, updateData, { updatedAt: new Date() });
    await repo.save(item);

    return options.new !== false ? item : null;
  },

  /**
   * Update item status
   */
  async updateStatus(id, newStatus) {
    const repo = await getOrderItemRepository();
    const item = await repo.fetch(id);
    if (!item || !item.name) return null;

    if (!item.canTransitionTo(newStatus)) {
      throw new Error(`Cannot transition from ${item.itemStatus} to ${newStatus}`);
    }

    item.itemStatus = newStatus;
    item.updatedAt = new Date();
    await repo.save(item);

    return item;
  },

  /**
   * Assign item to tailor
   */
  async assignToTailor(id, tailorId, jobId) {
    const repo = await getOrderItemRepository();
    const item = await repo.fetch(id);
    if (!item || !item.name) return null;

    item.assignedTailor = tailorId;
    item.job = jobId;
    item.itemStatus = 'assigned';
    item.updatedAt = new Date();
    await repo.save(item);

    return item;
  },

  /**
   * Find items by order
   */
  async findByOrder(orderId) {
    const repo = await getOrderItemRepository();
    return repo.search()
      .where('order').equals(orderId)
      .return.all();
  },

  /**
   * Find items by tailor
   */
  async findByTailor(tailorId) {
    const repo = await getOrderItemRepository();
    return repo.search()
      .where('assignedTailor').equals(tailorId)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Find items by job
   */
  async findByJob(jobId) {
    const repo = await getOrderItemRepository();
    return repo.search()
      .where('job').equals(jobId)
      .return.all();
  },

  /**
   * Find pending items
   */
  async findPending() {
    const repo = await getOrderItemRepository();
    return repo.search()
      .where('itemStatus').equals('pending')
      .return.all();
  },

  /**
   * Find all items with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getOrderItemRepository();
    let search = repo.search();

    if (query.order) {
      search = search.where('order').equals(query.order);
    }
    if (query.assignedTailor) {
      search = search.where('assignedTailor').equals(query.assignedTailor);
    }
    if (query.itemStatus) {
      search = search.where('itemStatus').equals(query.itemStatus);
    }
    if (query.job) {
      search = search.where('job').equals(query.job);
    }
    if (query.category) {
      search = search.where('category').equals(query.category);
    }

    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    return search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);
  },

  /**
   * Count items
   */
  async countDocuments(query = {}) {
    const repo = await getOrderItemRepository();
    let search = repo.search();

    if (query.order) {
      search = search.where('order').equals(query.order);
    }
    if (query.itemStatus) {
      search = search.where('itemStatus').equals(query.itemStatus);
    }

    return search.return.count();
  },

  /**
   * Delete order item
   */
  async delete(id) {
    const repo = await getOrderItemRepository();
    await repo.remove(id);
  },

  /**
   * Delete items by order
   */
  async deleteByOrder(orderId) {
    const repo = await getOrderItemRepository();
    const items = await this.findByOrder(orderId);
    for (const item of items) {
      await repo.remove(item.entityId);
    }
  },
};

export default OrderItemModel;
