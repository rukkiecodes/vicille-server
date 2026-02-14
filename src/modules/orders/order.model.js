import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateOrderNumber, generateClientTag } from '../../core/utils/randomCode.js';
import { ORDER_STATUS, ORDER_STATUS_TRANSITIONS, isValidTransition } from '../../core/constants/orderStatus.js';

// Order Entity class
class Model {
  // Get parsed production cycle
  get productionCycleParsed() {
    return this.productionCycle ? JSON.parse(this.productionCycle) : null;
  }

  // Get parsed styling window
  get stylingWindowParsed() {
    return this.stylingWindow ? JSON.parse(this.stylingWindow) : {
      openedAt: null,
      closedAt: null,
      isOpen: true,
      lockedAt: null,
    };
  }

  // Get parsed status history
  get statusHistoryParsed() {
    return this.statusHistory ? JSON.parse(this.statusHistory) : [];
  }

  // Get parsed delivery address
  get deliveryAddressParsed() {
    return this.deliveryAddress ? JSON.parse(this.deliveryAddress) : null;
  }

  // Get parsed delivery proof
  get deliveryProofParsed() {
    return this.deliveryProof ? JSON.parse(this.deliveryProof) : null;
  }

  // Get parsed cancellation
  get cancellationParsed() {
    return this.cancellation ? JSON.parse(this.cancellation) : null;
  }

  // Check if styling window is open
  get isStylingWindowOpen() {
    const stylingWindow = this.stylingWindowParsed;
    return stylingWindow?.isOpen && this.status === ORDER_STATUS.STYLING_IN_PROGRESS;
  }

  // Check if order can be cancelled
  get canBeCancelled() {
    return this.status === ORDER_STATUS.STYLING_IN_PROGRESS;
  }

  // Check if accessories can be purchased
  get canPurchaseAccessories() {
    return this.status === ORDER_STATUS.PRODUCTION_IN_PROGRESS;
  }

  // Check if status transition is valid
  canTransitionTo(newStatus) {
    return isValidTransition(this.status, newStatus);
  }

  // Convert to safe JSON (for API responses)
  toSafeJSON() {
    return {
      id: this.entityId,
      orderNumber: this.orderNumber,
      clientTag: this.clientTag,
      user: this.user,
      subscription: this.subscription,
      measurement: this.measurement,
      orderType: this.orderType,
      productionCycle: this.productionCycleParsed,
      stylingWindow: this.stylingWindowParsed,
      status: this.status,
      statusHistory: this.statusHistoryParsed,
      estimatedProductionStart: this.estimatedProductionStart,
      estimatedCompletionDate: this.estimatedCompletionDate,
      estimatedDeliveryDate: this.estimatedDeliveryDate,
      actualDeliveryDate: this.actualDeliveryDate,
      totalAmount: this.totalAmount,
      amountPaid: this.amountPaid,
      outstandingBalance: this.outstandingBalance,
      paymentStatus: this.paymentStatus,
      deliveryAddress: this.deliveryAddressParsed,
      deliveryMethod: this.deliveryMethod,
      trackingNumber: this.trackingNumber,
      dispatchedAt: this.dispatchedAt,
      deliveredAt: this.deliveredAt,
      deliveredBy: this.deliveredBy,
      deliveryProof: this.deliveryProofParsed,
      cancellation: this.cancellationParsed,
      notes: this.notes,
      internalNotes: this.internalNotes,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isStylingWindowOpen: this.isStylingWindowOpen,
      canBeCancelled: this.canBeCancelled,
      canPurchaseAccessories: this.canPurchaseAccessories,
    };
  }
}

// Order Schema for Redis OM
// Schema definition removed
// Repository holder
// Static methods as module functions
const OrderModel = {
  /**
   * Create a new order
   */
  async create(orderData) {
    const repo = await getOrderRepository();

    const now = new Date();
    const orderNumber = orderData.orderNumber || generateOrderNumber();
    const clientTag = orderData.clientTag || generateClientTag();

    // Initial status history
    const initialStatusHistory = [{
      status: orderData.status || ORDER_STATUS.STYLING_IN_PROGRESS,
      changedAt: now.toISOString(),
      notes: 'Order created',
    }];

    const order = await repo.save({
      orderNumber,
      clientTag,
      user: orderData.user,
      subscription: orderData.subscription,
      measurement: orderData.measurement,
      orderType: orderData.orderType,
      productionCycle: orderData.productionCycle ? JSON.stringify(orderData.productionCycle) : null,
      stylingWindow: JSON.stringify(orderData.stylingWindow || {
        openedAt: now.toISOString(),
        closedAt: null,
        isOpen: true,
        lockedAt: null,
      }),
      status: orderData.status || ORDER_STATUS.STYLING_IN_PROGRESS,
      statusHistory: JSON.stringify(initialStatusHistory),
      estimatedProductionStart: orderData.estimatedProductionStart,
      estimatedCompletionDate: orderData.estimatedCompletionDate,
      estimatedDeliveryDate: orderData.estimatedDeliveryDate,
      actualDeliveryDate: orderData.actualDeliveryDate,
      totalAmount: orderData.totalAmount || 0,
      amountPaid: orderData.amountPaid || 0,
      outstandingBalance: orderData.outstandingBalance || 0,
      paymentStatus: orderData.paymentStatus || 'pending',
      deliveryAddress: orderData.deliveryAddress ? JSON.stringify(orderData.deliveryAddress) : null,
      deliveryMethod: orderData.deliveryMethod || 'standard',
      trackingNumber: orderData.trackingNumber,
      dispatchedAt: orderData.dispatchedAt,
      deliveredAt: orderData.deliveredAt,
      deliveredBy: orderData.deliveredBy,
      deliveryProof: orderData.deliveryProof ? JSON.stringify(orderData.deliveryProof) : null,
      cancellation: orderData.cancellation ? JSON.stringify(orderData.cancellation) : null,
      notes: orderData.notes,
      internalNotes: orderData.internalNotes,
      createdAt: now,
      updatedAt: now,
    });

    return order;
  },

  /**
   * Find order by ID
   */
  async findById(id) {
    const repo = await getOrderRepository();
    const order = await repo.fetch(id);
    if (!order || !order.orderNumber) return null;
    return order;
  },

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber) {
    const repo = await getOrderRepository();
    const order = await repo.search()
      .where('orderNumber').equals(orderNumber)
      .return.first();
    return order;
  },

  /**
   * Find order by client tag
   */
  async findByClientTag(clientTag) {
    const repo = await getOrderRepository();
    const order = await repo.search()
      .where('clientTag').equals(clientTag)
      .return.first();
    return order;
  },

  /**
   * Update order by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const repo = await getOrderRepository();
    const order = await repo.fetch(id);
    if (!order || !order.orderNumber) return null;

    // Serialize complex objects
    const jsonFields = ['productionCycle', 'stylingWindow', 'statusHistory', 'deliveryAddress', 'deliveryProof', 'cancellation'];
    for (const field of jsonFields) {
      if (updateData[field] && typeof updateData[field] === 'object') {
        updateData[field] = JSON.stringify(updateData[field]);
      }
    }

    // Update fields
    Object.assign(order, updateData, { updatedAt: new Date() });
    await repo.save(order);

    return options.new !== false ? order : null;
  },

  /**
   * Update order status
   */
  async updateStatus(id, newStatus, changedBy, notes) {
    const repo = await getOrderRepository();
    const order = await repo.fetch(id);
    if (!order || !order.orderNumber) return null;

    if (!order.canTransitionTo(newStatus)) {
      throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
    }

    const previousStatus = order.status;
    order.status = newStatus;

    // Update styling window if transitioning to production
    if (newStatus === ORDER_STATUS.PRODUCTION_IN_PROGRESS) {
      const stylingWindow = order.stylingWindowParsed;
      stylingWindow.isOpen = false;
      stylingWindow.lockedAt = new Date().toISOString();
      order.stylingWindow = JSON.stringify(stylingWindow);
    }

    // Add to status history
    const statusHistory = order.statusHistoryParsed;
    statusHistory.push({
      status: newStatus,
      changedBy,
      changedAt: new Date().toISOString(),
      notes: notes || `Status changed from ${previousStatus} to ${newStatus}`,
    });
    order.statusHistory = JSON.stringify(statusHistory);
    order.updatedAt = new Date();

    await repo.save(order);
    return order;
  },

  /**
   * Cancel order
   */
  async cancelOrder(id, reason, cancelledBy, refundAmount = 0) {
    const repo = await getOrderRepository();
    const order = await repo.fetch(id);
    if (!order || !order.orderNumber) return null;

    if (!order.canBeCancelled) {
      throw new Error('Order cannot be cancelled at this stage');
    }

    order.status = ORDER_STATUS.CANCELLED;
    order.cancellation = JSON.stringify({
      cancelledAt: new Date().toISOString(),
      reason,
      cancelledBy,
      refundAmount,
      refundStatus: refundAmount > 0 ? 'pending' : null,
    });

    const statusHistory = order.statusHistoryParsed;
    statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      changedBy: cancelledBy,
      changedAt: new Date().toISOString(),
      notes: `Order cancelled: ${reason}`,
    });
    order.statusHistory = JSON.stringify(statusHistory);
    order.updatedAt = new Date();

    await repo.save(order);
    return order;
  },

  /**
   * Find orders by user
   */
  async findByUser(userId, options = {}) {
    const repo = await getOrderRepository();
    const limit = options.limit || 10;

    const orders = await repo.search()
      .where('user').equals(userId)
      .sortBy('createdAt', 'DESC')
      .return.page(0, limit);

    return orders;
  },

  /**
   * Find orders in styling window
   */
  async findInStylingWindow() {
    const repo = await getOrderRepository();
    const orders = await repo.search()
      .where('status').equals(ORDER_STATUS.STYLING_IN_PROGRESS)
      .return.all();

    // Filter for open styling windows
    return orders.filter(order => order.stylingWindowParsed?.isOpen);
  },

  /**
   * Find orders by cycle
   */
  async findByCycle(month, year) {
    const repo = await getOrderRepository();
    const orders = await repo.search().return.all();

    // Filter by production cycle
    return orders.filter(order => {
      const cycle = order.productionCycleParsed;
      return cycle && cycle.month === month && cycle.year === year;
    });
  },

  /**
   * Find orders by status
   */
  async findByStatus(status) {
    const repo = await getOrderRepository();
    return repo.search()
      .where('status').equals(status)
      .sortBy('createdAt', 'DESC')
      .return.all();
  },

  /**
   * Find all orders with filters and pagination
   */
  async find(query = {}, options = {}) {
    const repo = await getOrderRepository();
    let search = repo.search();

    // Apply filters
    if (query.status) {
      search = search.where('status').equals(query.status);
    }
    if (query.orderType) {
      search = search.where('orderType').equals(query.orderType);
    }
    if (query.user) {
      search = search.where('user').equals(query.user);
    }
    if (query.paymentStatus) {
      search = search.where('paymentStatus').equals(query.paymentStatus);
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
   * Count orders
   */
  async countDocuments(query = {}) {
    const repo = await getOrderRepository();
    let search = repo.search();

    if (query.status) {
      search = search.where('status').equals(query.status);
    }
    if (query.orderType) {
      search = search.where('orderType').equals(query.orderType);
    }
    if (query.user) {
      search = search.where('user').equals(query.user);
    }

    return search.return.count();
  },

  /**
   * Delete order (hard delete)
   */
  async delete(id) {
    const repo = await getOrderRepository();
    await repo.remove(id);
  },
};

export default OrderModel;
