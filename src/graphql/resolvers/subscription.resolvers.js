import { GraphQLError } from 'graphql';
import SubscriptionPlanModel from '../../modules/subscriptions/subscriptionPlan.model.js';
import SubscriptionModel from '../../modules/subscriptions/subscription.model.js';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import logger from '../../core/logger/index.js';

const subscriptionResolvers = {
  UserSubscription: {
    planDetails: async (subscription) => {
      if (!subscription.plan) {
        return null;
      }
      try {
        const plan = await SubscriptionPlanModel.findById(subscription.plan);
        return plan ? entityToJSON(plan) : null;
      } catch (error) {
        logger.error('Error resolving subscription.planDetails:', error);
        return null;
      }
    },
    userDetails: async (subscription) => {
      if (!subscription.user) {
        return null;
      }
      try {
        const user = await UserModel.findById(subscription.user);
        return user ? entityToJSON(user) : null;
      } catch (error) {
        logger.error('Error resolving subscription.userDetails:', error);
        return null;
      }
    },
  },

  Query: {
    subscriptionPlan: async (_, { id }) => {
      const plan = await SubscriptionPlanModel.findById(id);
      if (!plan) {
        throw new GraphQLError('Subscription plan not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(plan);
    },

    subscriptionPlans: async (_, { activeOnly }) => {
      const query = {};
      if (activeOnly) {
        query.isActive = true;
      }
      const plans = await SubscriptionPlanModel.find(query);
      return entitiesToJSON(plans);
    },

    subscription: async (_, { id }, context) => {
      requireAuth(context);
      const sub = await SubscriptionModel.findById(id);
      if (!sub) {
        throw new GraphQLError('Subscription not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(sub);
    },

    mySubscription: async (_, __, context) => {
      const authUser = requireAuth(context);
      const subs = await SubscriptionModel.findByUser(authUser.id);
      const activeSub = subs.find(s => s.status === 'active');
      return activeSub ? entityToJSON(activeSub) : null;
    },

    subscriptions: async (_, { filter = {}, pagination = {} }, context) => {
      requireAdmin(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;

      const query = {};
      if (filter.status) {
        query.status = filter.status;
      }
      if (filter.paymentStatus) {
        query.paymentStatus = filter.paymentStatus;
      }
      if (filter.user) {
        query.user = filter.user;
      }
      if (filter.plan) {
        query.plan = filter.plan;
      }

      const subs = await SubscriptionModel.find(query, { page, limit });
      const total = await SubscriptionModel.countDocuments(query);

      return buildPaginatedResponse(entitiesToJSON(subs), total, page, limit);
    },
  },

  Mutation: {
    createSubscriptionPlan: async (_, { input }, context) => {
      requireAdmin(context);
      const plan = await SubscriptionPlanModel.create(input);
      return entityToJSON(plan);
    },

    updateSubscriptionPlan: async (_, { id, input }, context) => {
      requireAdmin(context);
      const plan = await SubscriptionPlanModel.findByIdAndUpdate(id, input, { new: true });
      if (!plan) {
        throw new GraphQLError('Subscription plan not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(plan);
    },

    deactivateSubscriptionPlan: async (_, { id }, context) => {
      requireAdmin(context);
      const plan = await SubscriptionPlanModel.findByIdAndUpdate(id, { isActive: false }, { new: true });
      if (!plan) {
        throw new GraphQLError('Subscription plan not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      return entityToJSON(plan);
    },

    subscribe: async (_, { planId }, context) => {
      const authUser = requireAuth(context);

      // Check plan exists
      const plan = await SubscriptionPlanModel.findById(planId);
      if (!plan) {
        throw new GraphQLError('Subscription plan not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Check if user already has active subscription
      const existingSubs = await SubscriptionModel.findByUser(authUser.id);
      const existing = existingSubs.find(s => s.status === 'active');
      if (existing) {
        throw new GraphQLError('User already has an active subscription', {
          extensions: { code: 'CONFLICT' },
        });
      }

      const sub = await SubscriptionModel.create({
        user: authUser.id,
        plan: planId,
        status: 'active',
        paymentStatus: 'pending',
        startDate: new Date(),
      });

      // Update user subscription status
      await UserModel.findByIdAndUpdate(authUser.id, {
        subscriptionStatus: 'active',
        currentSubscription: sub.entityId,
      });

      return entityToJSON(sub);
    },

    cancelSubscription: async (_, { reason }, context) => {
      const authUser = requireAuth(context);
      const subs = await SubscriptionModel.findByUser(authUser.id);
      const sub = subs.find(s => s.status === 'active');
      if (!sub) {
        throw new GraphQLError('No active subscription found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const updated = await SubscriptionModel.findByIdAndUpdate(sub.entityId || sub.id, {
        status: 'cancelled',
        cancellation: {
          cancelledAt: new Date().toISOString(),
          reason: reason || 'User requested cancellation',
          cancelledBy: authUser.id,
        },
      }, { new: true });

      await UserModel.findByIdAndUpdate(authUser.id, {
        subscriptionStatus: 'cancelled',
        currentSubscription: null,
      });

      return entityToJSON(updated);
    },

    pauseSubscription: async (_, __, context) => {
      const authUser = requireAuth(context);
      const pauseSubs = await SubscriptionModel.findByUser(authUser.id);
      const sub = pauseSubs.find(s => s.status === 'active');
      if (!sub) {
        throw new GraphQLError('No active subscription found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const updated = await SubscriptionModel.findByIdAndUpdate(sub.entityId || sub.id, {
        status: 'paused',
      }, { new: true });

      await UserModel.findByIdAndUpdate(authUser.id, {
        subscriptionStatus: 'paused',
      });

      return entityToJSON(updated);
    },

    resumeSubscription: async (_, __, context) => {
      const authUser = requireAuth(context);
      const resumeSubs = await SubscriptionModel.findByUser(authUser.id);
      const sub = resumeSubs.find(s => s.status === 'paused');
      if (!sub) {
        throw new GraphQLError('No paused subscription found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      const updated = await SubscriptionModel.findByIdAndUpdate(sub.entityId || sub.id, {
        status: 'active',
      }, { new: true });

      await UserModel.findByIdAndUpdate(authUser.id, {
        subscriptionStatus: 'active',
      });

      return entityToJSON(updated);
    },
  },
};

export default subscriptionResolvers;
