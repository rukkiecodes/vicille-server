import { getFirestore } from '../../infrastructure/database/firebase.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';
import { generateOrderNumber, generateClientTag } from '../../core/utils/randomCode.js';
import { ORDER_STATUS, ORDER_STATUS_TRANSITIONS, isValidTransition } from '../../core/constants/orderStatus.js';

const COLLECTION = 'orders';
const CACHE_TTL = 3600; // 1 hour

// Helper: Parse JSON fields from Firestore
function parseJsonFields(order) {
  if (!order) return null;
  return {
    ...order,
    productionCycle: typeof order.productionCycle === 'string' ? JSON.parse(order.productionCycle) : order.productionCycle,
    stylingWindow: typeof order.stylingWindow === 'string' ? JSON.parse(order.stylingWindow) : order.stylingWindow,
    statusHistory: typeof order.statusHistory === 'string' ? JSON.parse(order.statusHistory) : order.statusHistory,
    deliveryAddress: typeof order.deliveryAddress === 'string' ? JSON.parse(order.deliveryAddress) : order.deliveryAddress,
    deliveryProof: typeof order.deliveryProof === 'string' ? JSON.parse(order.deliveryProof) : order.deliveryProof,
    cancellation: typeof order.cancellation === 'string' ? JSON.parse(order.cancellation) : order.cancellation,
  };
}

// Helper: Stringify JSON fields for Firestore
function stringifyJsonFields(data) {
  const result = { ...data };
  if (result.productionCycle && typeof result.productionCycle === 'object') {
    result.productionCycle = JSON.stringify(result.productionCycle);
  }
  if (result.stylingWindow && typeof result.stylingWindow === 'object') {
    result.stylingWindow = JSON.stringify(result.stylingWindow);
  }
  if (result.statusHistory && typeof result.statusHistory === 'object') {
    result.statusHistory = JSON.stringify(result.statusHistory);
  }
  if (result.deliveryAddress && typeof result.deliveryAddress === 'object') {
    result.deliveryAddress = JSON.stringify(result.deliveryAddress);
  }
  if (result.deliveryProof && typeof result.deliveryProof === 'object') {
    result.deliveryProof = JSON.stringify(result.deliveryProof);
  }
  if (result.cancellation && typeof result.cancellation === 'object') {
    result.cancellation = JSON.stringify(result.cancellation);
  }
  return result;
}

// Helper: Cache management
async function cacheOrder(order) {
  try {
    const redis = getRedisClient();
    if (redis && order?.id) {
      await redis.setex(
        `order:${order.id}`,
        CACHE_TTL,
        JSON.stringify(order)
      );
    }
  } catch (error) {
    // Cache errors are non-fatal
  }
}

async function getCachedOrder(id) {
  try {
    const redis = getRedisClient();
    if (redis) {
      const cached = await redis.get(`order:${id}`);
      if (cached) return JSON.parse(cached);
    }
  } catch (error) {
    // Cache errors are non-fatal
  }
  return null;
}

async function clearOrderCache(id) {
  try {
    const redis = getRedisClient();
    if (redis && id) {
      await redis.del(`order:${id}`);
    }
  } catch (error) {
    // Cache errors are non-fatal
  }
}

// Order Model
const OrderModel = {
  /**
   * Create a new order
   */
  async create(orderData) {
    const db = getFirestore();
    const now = new Date();
    const docRef = db.collection(COLLECTION).doc();

    const orderNumber = orderData.orderNumber || generateOrderNumber();
    const clientTag = orderData.clientTag || generateClientTag();

    // Initial status history
    const initialStatusHistory = [{
      status: orderData.status || ORDER_STATUS.STYLING_IN_PROGRESS,
      changedAt: now.toISOString(),
      notes: 'Order created',
    }];

    const orderWithDefaults = stringifyJsonFields({
      orderNumber,
      clientTag,
      user: orderData.user,
      subscription: orderData.subscription || null,
      measurement: orderData.measurement || null,
      orderType: orderData.orderType,
      productionCycle: orderData.productionCycle || null,
      stylingWindow: orderData.stylingWindow || {
        openedAt: now.toISOString(),
        closedAt: null,
        isOpen: true,
        lockedAt: null,
      },
      status: orderData.status || ORDER_STATUS.STYLING_IN_PROGRESS,
      statusHistory: initialStatusHistory,
      estimatedProductionStart: orderData.estimatedProductionStart || null,
      estimatedCompletionDate: orderData.estimatedCompletionDate || null,
      estimatedDeliveryDate: orderData.estimatedDeliveryDate || null,
      actualDeliveryDate: orderData.actualDeliveryDate || null,
      totalAmount: orderData.totalAmount || 0,
      amountPaid: orderData.amountPaid || 0,
      outstandingBalance: orderData.outstandingBalance || 0,
      paymentStatus: orderData.paymentStatus || 'pending',
      deliveryAddress: orderData.deliveryAddress || null,
      deliveryMethod: orderData.deliveryMethod || 'standard',
      trackingNumber: orderData.trackingNumber || null,
      dispatchedAt: orderData.dispatchedAt || null,
      deliveredAt: orderData.deliveredAt || null,
      deliveredBy: orderData.deliveredBy || null,
      deliveryProof: orderData.deliveryProof || null,
      cancellation: orderData.cancellation || null,
      notes: orderData.notes || null,
      internalNotes: orderData.internalNotes || null,
      createdAt: now,
      updatedAt: now,
    });

    await docRef.set(orderWithDefaults);
    const created = parseJsonFields({ id: docRef.id, ...orderWithDefaults });
    
    await cacheOrder(created);
    return created;
  },

  /**
   * Find order by ID
   */
  async findById(id) {
    // Try cache first
    const cached = await getCachedOrder(id);
    if (cached) return cached;

    const db = getFirestore();
    const doc = await db.collection(COLLECTION).doc(id).get();
    
    if (!doc.exists || !doc.data().orderNumber) return null;
    
    const order = parseJsonFields({ id: doc.id, ...doc.data() });
    await cacheOrder(order);
    
    return order;
  },

  /**
   * Find order by order number
   */
  async findByOrderNumber(orderNumber) {
    const db = getFirestore();
    const query = db.collection(COLLECTION)
      .where('orderNumber', '==', orderNumber)
      .limit(1);
    
    const snapshot = await query.get();
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    const order = parseJsonFields({ id: doc.id, ...doc.data() });
    await cacheOrder(order);
    
    return order;
  },

  /**
   * Find order by client tag
   */
  async findByClientTag(clientTag) {
    const db = getFirestore();
    const query = db.collection(COLLECTION)
      .where('clientTag', '==', clientTag)
      .limit(1);
    
    const snapshot = await query.get();
    if (snapshot.empty) return null;
    
    const doc = snapshot.docs[0];
    const order = parseJsonFields({ id: doc.id, ...doc.data() });
    await cacheOrder(order);
    
    return order;
  },

  /**
   * Update order by ID
   */
  async findByIdAndUpdate(id, updateData, options = {}) {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists || !doc.data().orderNumber) return null;

    const updateWithDefaults = stringifyJsonFields({
      ...updateData,
      updatedAt: new Date(),
    });

    await docRef.update(updateWithDefaults);
    
    const updated = doc.data();
    const result = parseJsonFields({ id: doc.id, ...updated, ...updateWithDefaults });
    
    await clearOrderCache(id);
    await cacheOrder(result);
    
    return result;
  },

  /**
   * Update order status
   */
  async updateStatus(id, newStatus, changedBy, notes) {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists || !doc.data().orderNumber) return null;

    const order = parseJsonFields({ id: doc.id, ...doc.data() });
    
    if (!isValidTransition(order.status, newStatus)) {
      throw new Error(`Cannot transition from ${order.status} to ${newStatus}`);
    }

    const previousStatus = order.status;
    const updateData = { status: newStatus };

    // Update styling window if transitioning to production
    if (newStatus === ORDER_STATUS.PRODUCTION_IN_PROGRESS) {
      const stylingWindow = order.stylingWindow || {};
      stylingWindow.isOpen = false;
      stylingWindow.lockedAt = new Date().toISOString();
      updateData.stylingWindow = stylingWindow;
    }

    // Add to status history
    const statusHistory = order.statusHistory || [];
    statusHistory.push({
      status: newStatus,
      changedBy,
      changedAt: new Date().toISOString(),
      notes: notes || `Status changed from ${previousStatus} to ${newStatus}`,
    });
    updateData.statusHistory = statusHistory;
    updateData.updatedAt = new Date();

    return this.findByIdAndUpdate(id, updateData, { new: true });
  },

  /**
   * Cancel order
   */
  async cancelOrder(id, reason, cancelledBy, refundAmount = 0) {
    const db = getFirestore();
    const docRef = db.collection(COLLECTION).doc(id);
    const doc = await docRef.get();
    
    if (!doc.exists || !doc.data().orderNumber) return null;

    const order = parseJsonFields({ id: doc.id, ...doc.data() });

    // Check if order can be cancelled
    if (order.status !== ORDER_STATUS.STYLING_IN_PROGRESS) {
      throw new Error('Order cannot be cancelled at this stage');
    }

    const updateData = {
      status: ORDER_STATUS.CANCELLED,
      cancellation: {
        cancelledAt: new Date().toISOString(),
        reason,
        cancelledBy,
        refundAmount,
        refundStatus: refundAmount > 0 ? 'pending' : null,
      },
    };

    const statusHistory = order.statusHistory || [];
    statusHistory.push({
      status: ORDER_STATUS.CANCELLED,
      changedBy: cancelledBy,
      changedAt: new Date().toISOString(),
      notes: `Order cancelled: ${reason}`,
    });
    updateData.statusHistory = statusHistory;
    updateData.updatedAt = new Date();

    return this.findByIdAndUpdate(id, updateData, { new: true });
  },

  /**
   * Find orders by user
   */
  async findByUser(userId, options = {}) {
    const db = getFirestore();
    const limit = options.limit || 10;

    const query = db.collection(COLLECTION)
      .where('user', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(limit);

    const snapshot = await query.get();
    return snapshot.docs.map(doc => parseJsonFields({ id: doc.id, ...doc.data() }));
  },

  /**
   * Find orders in styling window
   */
  async findInStylingWindow() {
    const db = getFirestore();
    const query = db.collection(COLLECTION)
      .where('status', '==', ORDER_STATUS.STYLING_IN_PROGRESS);

    const snapshot = await query.get();
    return snapshot.docs
      .map(doc => parseJsonFields({ id: doc.id, ...doc.data() }))
      .filter(order => order.stylingWindow?.isOpen);
  },

  /**
   * Find orders by cycle
   */
  async findByCycle(month, year) {
    const db = getFirestore();
    const snapshot = await db.collection(COLLECTION).get();
    
    const orders = snapshot.docs.map(doc => parseJsonFields({ id: doc.id, ...doc.data() }));
    return orders.filter(order => {
      const cycle = order.productionCycle;
      return cycle && cycle.month === month && cycle.year === year;
    });
  },

  /**
   * Find orders by status
   */
  async findByStatus(status) {
    const db = getFirestore();
    const query = db.collection(COLLECTION)
      .where('status', '==', status)
      .orderBy('createdAt', 'desc');

    const snapshot = await query.get();
    return snapshot.docs.map(doc => parseJsonFields({ id: doc.id, ...doc.data() }));
  },

  /**
   * Find all orders with filters and pagination
   */
  async find(query = {}, options = {}) {
    const db = getFirestore();
    let firestoreQuery = db.collection(COLLECTION);

    // Apply filters
    if (query.status) {
      firestoreQuery = firestoreQuery.where('status', '==', query.status);
    }
    if (query.orderType) {
      firestoreQuery = firestoreQuery.where('orderType', '==', query.orderType);
    }
    if (query.user) {
      firestoreQuery = firestoreQuery.where('user', '==', query.user);
    }
    if (query.paymentStatus) {
      firestoreQuery = firestoreQuery.where('paymentStatus', '==', query.paymentStatus);
    }

    firestoreQuery = firestoreQuery.orderBy('createdAt', 'desc');

    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const countQuery = await firestoreQuery.count().get();
    const total = countQuery.data().count;

    const querySnapshot = await firestoreQuery
      .offset(offset)
      .limit(limit)
      .get();

    const orders = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })).map(parseJsonFields);

    return {
      data: orders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Count orders
   */
  async countDocuments(query = {}) {
    const db = getFirestore();
    let firestoreQuery = db.collection(COLLECTION);

    if (query.status) {
      firestoreQuery = firestoreQuery.where('status', '==', query.status);
    }
    if (query.orderType) {
      firestoreQuery = firestoreQuery.where('orderType', '==', query.orderType);
    }
    if (query.user) {
      firestoreQuery = firestoreQuery.where('user', '==', query.user);
    }
    if (query.paymentStatus) {
      firestoreQuery = firestoreQuery.where('paymentStatus', '==', query.paymentStatus);
    }

    const countQuery = await firestoreQuery.count().get();
    return countQuery.data().count;
  },

  /**
   * Delete order (hard delete)
   */
  async delete(id) {
    const db = getFirestore();
    await db.collection(COLLECTION).doc(id).delete();
    await clearOrderCache(id);
  },
};

export default OrderModel;
