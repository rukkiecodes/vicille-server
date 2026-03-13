import { GraphQLError } from 'graphql';
import OrderModel from '../../modules/orders/order.model.js';
import OrderItemModel from '../../modules/orders/orderItem.model.js';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import { ORDER_STATUS } from '../../core/constants/orderStatus.js';
import { query as dbQuery } from '../../infrastructure/database/postgres.js';
import logger from '../../core/logger/index.js';

const orderResolvers = {
  Order: {
    userDetails: async (order) => {
      if (!order.user) {
        return null;
      }
      try {
        const user = await UserModel.findById(order.user);
        return user ? entityToJSON(user) : null;
      } catch (error) {
        logger.error('Error resolving order.userDetails:', error);
        return null;
      }
    },
    items: async (order) => {
      try {
        const items = await OrderItemModel.findByOrder(order.id);
        return entitiesToJSON(items);
      } catch (error) {
        logger.error('Error resolving order.items:', error);
        return [];
      }
    },
    statusHistory: async (order) => {
      try {
        const { rows } = await dbQuery(
          `SELECT to_status, changed_by_role, changed_by_id, notes, created_at
           FROM order_status_history
           WHERE order_id=$1
           ORDER BY created_at ASC`,
          [order.id]
        );
        return rows.map((row) => ({
          status: row.to_status,
          changedBy: row.changed_by_role || row.changed_by_id,
          changedAt: row.created_at,
          notes: row.notes,
        }));
      } catch (error) {
        logger.error('Error resolving order.statusHistory:', error);
        return [];
      }
    },
    isStylingWindowOpen: (order) => order?.isStylingWindowOpen ?? order?.status === ORDER_STATUS.STYLING_IN_PROGRESS,
    canBeCancelled: (order) => order?.canBeCancelled ?? order?.status === ORDER_STATUS.STYLING_IN_PROGRESS,
    canPurchaseAccessories: (order) => order?.canPurchaseAccessories ?? order?.status === ORDER_STATUS.PRODUCTION_IN_PROGRESS,
  },

  Query: {
    order: async (_, { id }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findById(id);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      const role = authUser.role || authUser.type;
      if (role !== 'admin' && order.user !== authUser.id) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(order);
    },

    orderByNumber: async (_, { orderNumber }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findByOrderNumber(orderNumber);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      const role = authUser.role || authUser.type;
      if (role !== 'admin' && order.user !== authUser.id) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(order);
    },

    orders: async (_, { filter = {}, pagination = {} }, context) => {
      requireAdmin(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const offset = (page - 1) * limit;

      const query = {};
      if (filter.status) {
        query.status = filter.status;
      }
      if (filter.orderType) {
        query.orderType = filter.orderType;
      }
      if (filter.user) {
        query.user = filter.user;
      }
      if (filter.paymentStatus) {
        query.paymentStatus = filter.paymentStatus;
      }

      const result = await OrderModel.find(query, { limit, offset });
      const orders = result.data || [];
      const total = result.pagination?.total || 0;

      return buildPaginatedResponse(entitiesToJSON(orders), total, page, limit);
    },

    myOrders: async (_, { pagination = {} }, context) => {
      const authUser = requireAuth(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;
      const offset = (page - 1) * limit;

      const result = await OrderModel.find({ user: authUser.id }, { limit, offset });
      const orders = result.data || [];
      const total = result.pagination?.total || 0;

      return buildPaginatedResponse(entitiesToJSON(orders), total, page, limit);
    },

    ordersByStatus: async (_, { status }, context) => {
      requireAuth(context);
      const orders = await OrderModel.findByStatus(status);
      return entitiesToJSON(orders);
    },
  },

  Mutation: {
    createOrder: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const user = await UserModel.findById(authUser.id);
      const deliveryDetails = await UserModel.findDeliveryDetails(authUser.id);
      const order = await OrderModel.create({
        ...input,
        user: authUser.id,
        customerName: user?.fullName || null,
        customerEmail: user?.email || null,
        customerPhone: deliveryDetails?.phone || user?.phone || null,
        deliveryAddress: input.deliveryAddress || (deliveryDetails ? {
          address: deliveryDetails.address || null,
          phone: deliveryDetails.phone || user?.phone || null,
          landmark: deliveryDetails.landmark || null,
          nearestBusStop: deliveryDetails.nearestBusStop || null,
        } : null),
      });
      return entityToJSON(order);
    },

    updateOrder: async (_, { id, input }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findById(id);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const role = authUser.role || authUser.type;
      const isAdmin = role === 'admin';
      if (!isAdmin && order.user !== authUser.id) {
        throw new GraphQLError('You do not have access to this order', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      if (!isAdmin && order.status !== ORDER_STATUS.STYLING_IN_PROGRESS) {
        throw new GraphQLError('This order can no longer be edited', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const updated = await OrderModel.findByIdAndUpdate(id, {
        orderType: input.orderType,
        deliveryAddress: input.deliveryAddress,
        deliveryMethod: input.deliveryMethod,
        notes: input.notes,
      });
      return entityToJSON(updated);
    },

    updateOrderStatus: async (_, { id, status, notes }, context) => {
      requireAuth(context);
      try {
        const order = await OrderModel.updateStatus(
          id,
          status,
          context.user.id,
          context.user.role || context.user.type || 'user',
          notes
        );
        return entityToJSON(order);
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    },

    cancelOrder: async (_, { id, reason }, context) => {
      const authUser = requireAuth(context);
      try {
        const order = await OrderModel.cancelOrder(id, reason, authUser.id);
        return entityToJSON(order);
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
    },

    updateOrderDelivery: async (_, { id, input }, context) => {
      requireAdmin(context);
      const order = await OrderModel.findByIdAndUpdate(id, input, { new: true });
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(order);
    },

    addOrderItem: async (_, { orderId, input }, context) => {
      const authUser = requireAuth(context);
      const order = await OrderModel.findById(orderId);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      const role = authUser.role || authUser.type;
      if (role !== 'admin' && order.user !== authUser.id) {
        throw new GraphQLError('You do not have access to this order', {
          extensions: { code: 'FORBIDDEN' },
        });
      }

      const derivedStyleName =
        input?.style?.title ||
        input?.style?.name ||
        input?.description ||
        input?.category ||
        'Custom style';

      const item = await OrderItemModel.create({
        ...input,
        order: orderId,
        styleName: derivedStyleName,
        name: derivedStyleName,
      });
      return entityToJSON(item);
    },

    removeOrderItem: async (_, { orderId: _orderId, itemId }, context) => {
      requireAuth(context);
      await OrderItemModel.delete(itemId);
      return { success: true, message: 'Order item removed' };
    },
  },
};

export default orderResolvers;
