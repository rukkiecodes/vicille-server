import { GraphQLError } from 'graphql';
import PaymentModel from '../../modules/payments/payment.model.js';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import logger from '../../core/logger/index.js';

const paymentResolvers = {
  Payment: {
    userDetails: async (payment) => {
      if (!payment.user) {
        return null;
      }
      try {
        const user = await UserModel.findById(payment.user);
        return user ? entityToJSON(user) : null;
      } catch (error) {
        logger.error('Error resolving payment.userDetails:', error);
        return null;
      }
    },
  },

  Query: {
    payment: async (_, { id }, context) => {
      requireAuth(context);
      const payment = await PaymentModel.findById(id);
      if (!payment) {
        throw new GraphQLError('Payment not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(payment);
    },

    paymentByReference: async (_, { reference }, context) => {
      requireAuth(context);
      const payment = await PaymentModel.findByTransactionReference(reference);
      if (!payment) {
        throw new GraphQLError('Payment not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(payment);
    },

    payments: async (_, { filter = {}, pagination = {} }, context) => {
      requireAdmin(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;

      const query = {};
      if (filter.status) {
        query.status = filter.status;
      }
      if (filter.paymentType) {
        query.paymentType = filter.paymentType;
      }
      if (filter.user) {
        query.user = filter.user;
      }
      if (filter.order) {
        query.order = filter.order;
      }

      const payments = await PaymentModel.find(query, { page, limit });
      const total = await PaymentModel.countDocuments(query);

      return buildPaginatedResponse(entitiesToJSON(payments), total, page, limit);
    },

    myPayments: async (_, { pagination = {} }, context) => {
      const authUser = requireAuth(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;

      const payments = await PaymentModel.findByUser(authUser.id, { page, limit });
      const total = await PaymentModel.countDocuments({ user: authUser.id });

      return buildPaginatedResponse(entitiesToJSON(payments), total, page, limit);
    },
  },

  Mutation: {
    initializePayment: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const payment = await PaymentModel.create({
        ...input,
        user: authUser.id,
        status: 'pending',
      });
      return entityToJSON(payment);
    },

    verifyPayment: async (_, { reference }, context) => {
      requireAuth(context);
      const payment = await PaymentModel.findByTransactionReference(reference);
      if (!payment) {
        throw new GraphQLError('Payment not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // In a real implementation, this would verify with the payment provider
      const updated = await PaymentModel.findByIdAndUpdate(
        payment.entityId || payment.id,
        {
          status: 'success',
          paidAt: new Date(),
        },
        { new: true }
      );

      return entityToJSON(updated);
    },

    retryPayment: async (_, { id }, context) => {
      requireAuth(context);
      const payment = await PaymentModel.findById(id);
      if (!payment) {
        throw new GraphQLError('Payment not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      if (!payment.canRetry) {
        throw new GraphQLError('Payment cannot be retried', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      const updated = await PaymentModel.findByIdAndUpdate(id, {
        status: 'pending',
        retryCount: (payment.retryCount || 0) + 1,
      }, { new: true });

      return entityToJSON(updated);
    },

    refundPayment: async (_, { id, amount, reason }, context) => {
      requireAdmin(context);
      const payment = await PaymentModel.findById(id);
      if (!payment) {
        throw new GraphQLError('Payment not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const refundAmount = amount || payment.amount;
      const updated = await PaymentModel.findByIdAndUpdate(id, {
        refund: {
          amount: refundAmount,
          reason: reason || 'Admin initiated refund',
          refundedAt: new Date().toISOString(),
          refundedBy: context.user.id,
        },
        status: 'refunded',
      }, { new: true });

      return entityToJSON(updated);
    },
  },
};

export default paymentResolvers;
