import { GraphQLError } from 'graphql';
import OrderModel from '../../modules/orders/order.model.js';
import OrderItemModel from '../../modules/orders/orderItem.model.js';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
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
  },

  Query: {
    order: async (_, { id }, context) => {
      requireAuth(context);
      const order = await OrderModel.findById(id);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(order);
    },

    orderByNumber: async (_, { orderNumber }, context) => {
      requireAuth(context);
      const order = await OrderModel.findByOrderNumber(orderNumber);
      if (!order) {
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
      requireAuth(context);
      const order = await OrderModel.create(input);
      return entityToJSON(order);
    },

    updateOrderStatus: async (_, { id, status, notes }, context) => {
      requireAuth(context);
      try {
        const order = await OrderModel.updateStatus(id, status, context.user.id, notes);
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
      requireAuth(context);
      const order = await OrderModel.findById(orderId);
      if (!order) {
        throw new GraphQLError('Order not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const item = await OrderItemModel.create({
        ...input,
        order: orderId,
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
