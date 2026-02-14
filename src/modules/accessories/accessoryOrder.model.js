import { getRedisClient } from '../../infrastructure/database/redis.js';

// AccessoryOrder Entity class
class Model {
  // Get parsed items
  get itemsParsed() {
    return this.items ? JSON.parse(this.items) : [];
  }

  // Virtual for item count
  get itemCount() {
    const items = this.itemsParsed;
    if (!items) return 0;
    return items.reduce((sum, item) => sum + item.quantity, 0);
  }

  // Virtual for isPaid
  get isPaid() {
    return this.paymentStatus === 'paid';
  }

  // Virtual for formattedTotal
  get formattedTotal() {
    const amount = this.totalAmount / 100;
    return `₦${amount.toLocaleString()}`;
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      user: this.user,
      order: this.order,
      items: this.itemsParsed,
      totalAmount: this.totalAmount,
      payment: this.payment,
      paymentStatus: this.paymentStatus,
      status: this.status,
      deliveredWith: this.deliveredWith,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      itemCount: this.itemCount,
      isPaid: this.isPaid,
      formattedTotal: this.formattedTotal,
    };
  }
}

// AccessoryOrder Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const AccessoryOrderModel = {
  /**
   * Create a new accessory order
   */
  async create(orderData) {
    const repo = await getAccessoryOrderRepository();

    const now = new Date();

    // Calculate subtotals and total if items provided
    let items = orderData.items || [];
    let totalAmount = orderData.totalAmount || 0;

    if (items.length > 0) {
      items = items.map((item) => ({
        ...item,
        subtotal: item.price * item.quantity,
      }));
      totalAmount = items.reduce((sum, item) => sum + item.subtotal, 0);
    }

    const accessoryOrder = await repo.save({
      user: orderData.user,
      order: orderData.order,
      items: JSON.stringify(items),
      totalAmount,
      payment: orderData.payment,
      paymentStatus: orderData.paymentStatus || 'pending',
      status: orderData.status || 'pending',
      deliveredWith: orderData.deliveredWith,
      createdAt: now,
      updatedAt: now,
    });

    return accessoryOrder;
  },

  /**
   * Find accessory order by ID
   */
  async findById(id) {
    const repo = await getAccessoryOrderRepository();
    const accessoryOrder = await repo.fetch(id);
    if (!accessoryOrder || !accessoryOrder.user) return null;
    return accessoryOrder;
  },

  /**
   * Update accessory order by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getAccessoryOrderRepository();
    const accessoryOrder = await repo.fetch(id);
    if (!accessoryOrder || !accessoryOrder.user) return null;

    // Serialize complex objects
    if (updateData.items && typeof updateData.items === 'object') {
      updateData.items = JSON.stringify(updateData.items);
    }

    // Update fields
    Object.assign(accessoryOrder, updateData, { updatedAt: new Date() });
    await repo.save(accessoryOrder);

    return options.new !== false ? accessoryOrder : null;
  },

  /**
   * Mark as paid
   */
  async markAsPaid(id, paymentId) {
    const repo = await getAccessoryOrderRepository();
    const accessoryOrder = await repo.fetch(id);
    if (!accessoryOrder || !accessoryOrder.user) return null;

    accessoryOrder.payment = paymentId;
    accessoryOrder.paymentStatus = 'paid';
    accessoryOrder.status = 'processing';
    accessoryOrder.updatedAt = new Date();

    await repo.save(accessoryOrder);
    return accessoryOrder;
  },

  /**
   * Mark as delivered
   */
  async markAsDelivered(id, deliveredWithOrderId) {
    const repo = await getAccessoryOrderRepository();
    const accessoryOrder = await repo.fetch(id);
    if (!accessoryOrder || !accessoryOrder.user) return null;

    accessoryOrder.status = 'delivered';
    accessoryOrder.deliveredWith = deliveredWithOrderId;
    accessoryOrder.updatedAt = new Date();

    await repo.save(accessoryOrder);
    return accessoryOrder;
  },

  /**
   * Find by user
   */
  async findByUser(userId) {
    const repo = await getAccessoryOrderRepository();
    return repo.search()
      .where('user').equals(userId)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Find by order
   */
  async findByOrder(orderId) {
    const repo = await getAccessoryOrderRepository();
    return repo.search()
      .where('order').equals(orderId)
      .return.all();
  },

  /**
   * Find pending delivery
   */
  async findPendingDelivery() {
    const repo = await getAccessoryOrderRepository();
    const orders = await repo.search()
      .where('paymentStatus').equals('paid')
      .sortBy('createdAt', 'ASC')
      .return.all();

    // Filter out delivered orders
    return orders.filter(o => o.status !== 'delivered');
  },

  /**
   * Find all accessory orders with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getAccessoryOrderRepository();
    let search = repo.search();

    // Apply filters
    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.order) {
      search = search.where('order').equals(query.order);
    }
    if (query.paymentStatus) {
      search = search.where('paymentStatus').equals(query.paymentStatus);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    // Apply pagination
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const orders = await search
      .sortBy('createdAt', 'DESC')
      .return.page(offset, limit);

    return orders;
  },

  /**
   * Count accessory orders
   */
  async countDocuments(query = {}) {
    const repo = await getAccessoryOrderRepository();
    let search = repo.search();

    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.order) {
      search = search.where('order').equals(query.order);
    }
    if (query.paymentStatus) {
      search = search.where('paymentStatus').equals(query.paymentStatus);
    }
    if (query.status) {
      search = search.where('status').equals(query.status);
    }

    return search.return.count();
  },

  /**
   * Delete accessory order (hard delete)
   */
  async delete(id) {
    const repo = await getAccessoryOrderRepository();
    await repo.remove(id);
  },
};

export default AccessoryOrderModel;
