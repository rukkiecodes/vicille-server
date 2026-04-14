import { GraphQLError } from 'graphql';
import SubscriptionPlanModel from '../../modules/subscriptions/subscriptionPlan.model.js';
import SubscriptionModel from '../../modules/subscriptions/subscription.model.js';
import UserModel from '../../modules/users/user.model.js';
import { requireAuth, requireAdmin, buildPaginatedResponse, entityToJSON, entitiesToJSON } from '../helpers.js';
import paymentsService from '../../services/paymentsService.js';
import logger from '../../core/logger/index.js';

const subscriptionResolvers = {
  UserSubscription: {
    planDetails: async (subscription) => {
      if (!subscription.plan) return null;
      try {
        const plan = await SubscriptionPlanModel.findById(subscription.plan);
        return plan ? entityToJSON(plan) : null;
      } catch (error) {
        logger.error('Error resolving subscription.planDetails:', error);
        return null;
      }
    },
    userDetails: async (subscription) => {
      if (!subscription.user) return null;
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
      if (activeOnly) query.isActive = true;
      const result = await SubscriptionPlanModel.find(query);
      return entitiesToJSON(result.data);
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
      const currentSub =
        subs.find(s => s.status === 'active') ||
        subs.find(s => s.status === 'pending_payment') ||
        subs.find(s => s.status === 'payment_failed') ||
        subs[0] ||
        null;

      return currentSub ? entityToJSON(currentSub) : null;
    },

    subscriptions: async (_, { filter = {}, pagination = {} }, context) => {
      requireAdmin(context);
      const page = pagination.page || 1;
      const limit = pagination.limit || 20;

      const query = {};
      if (filter.status)        query.status = filter.status;
      if (filter.paymentStatus) query.paymentStatus = filter.paymentStatus;
      if (filter.user)          query.user = filter.user;
      if (filter.plan)          query.plan = filter.plan;

      const subs  = await SubscriptionModel.find(query, { page, limit });
      const total = await SubscriptionModel.countDocuments(query);

      return buildPaginatedResponse(entitiesToJSON(subs), total, page, limit);
    },
  },

  Mutation: {
    // ── Admin: create plan ────────────────────────────────────────────────────
    // Creates the plan in the DB and then syncs it to Paystack so users can subscribe.
    createSubscriptionPlan: async (_, { input }, context) => {
      requireAdmin(context);

      const plan = await SubscriptionPlanModel.create(input);

      // Sync to Paystack. Non-fatal — admin can retry via updateSubscriptionPlan.
      const amountKobo = plan.pricing?.amount ? Math.round(plan.pricing.amount * 100) : null;
      if (amountKobo && amountKobo > 0) {
        try {
          const result = await paymentsService.createPlan({ name: plan.name, amountKobo });
          await SubscriptionPlanModel.setPaystackPlanCode(plan.id, result.planCode);
          plan.paystackPlanCode = result.planCode;
          logger.info(`[subscription] Paystack plan created: ${result.planCode} for plan ${plan.id}`);
        } catch (err) {
          logger.error(`[subscription] Failed to create Paystack plan for ${plan.id}:`, err.message);
        }
      }

      return entityToJSON(plan);
    },

    // ── Admin: update plan ────────────────────────────────────────────────────
    updateSubscriptionPlan: async (_, { id, input }, context) => {
      requireAdmin(context);

      const plan = await SubscriptionPlanModel.findByIdAndUpdate(id, input, { new: true });
      if (!plan) {
        throw new GraphQLError('Subscription plan not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Sync name change to Paystack (amount changes require a new plan — not handled here).
      if (input.name && plan.paystackPlanCode) {
        try {
          await paymentsService.updatePlan(plan.paystackPlanCode, { name: input.name });
          logger.info(`[subscription] Paystack plan updated: ${plan.paystackPlanCode}`);
        } catch (err) {
          logger.error(`[subscription] Failed to update Paystack plan ${plan.paystackPlanCode}:`, err.message);
        }
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

    // ── User: initialize card subscription ────────────────────────────────────
    // Creates a pending subscription record and returns a Paystack hosted payment URL.
    // The subscription becomes active once the payment webhook/callback fires.
    initializeCardSubscription: async (_, { planId }, context) => {
      const authUser = requireAuth(context);

      const plan = await SubscriptionPlanModel.findById(planId);
      if (!plan || !plan.isActive) {
        throw new GraphQLError('Subscription plan not found or inactive', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      if (!plan.paystackPlanCode) {
        throw new GraphQLError('This plan is not yet configured for card payment. Please contact support.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      // Only one active/pending subscription at a time
      const existingSubs = await SubscriptionModel.findByUser(authUser.id);
      const conflict = existingSubs.find(s => s.status === 'active' || s.status === 'pending_payment');
      if (conflict) {
        throw new GraphQLError('You already have an active or pending subscription', {
          extensions: { code: 'CONFLICT' },
        });
      }

      // Ensure a Paystack customer exists for this user
      let customerCode = authUser.paystackCustomerCode || null;
      const nameParts  = (authUser.fullName || '').split(' ');
      try {
        const customer = await paymentsService.ensureCustomer({
          userId:    authUser.id,
          email:     authUser.email,
          firstName: nameParts[0] || '',
          lastName:  nameParts.slice(1).join(' ') || '',
        });
        customerCode = customer.customerCode;
        if (!authUser.paystackCustomerCode) {
          await UserModel.findByIdAndUpdate(authUser.id, { paystackCustomerCode: customerCode });
        }
      } catch (err) {
        logger.error('[subscription] ensureCustomer failed:', err.message);
        // Non-fatal — continue without customerCode
      }

      // Create the subscription in a pending state
      const sub = await SubscriptionModel.create({
        user:          authUser.id,
        plan:          planId,
        status:        'pending_payment',
        paymentStatus: 'pending',
        startDate:     new Date(),
        paymentChannel: 'card',
      });

      // Ask payments service for the Paystack hosted payment URL
      let authorizationUrl, reference;
      try {
        const result = await paymentsService.initializeSubscription({
          email:          authUser.email,
          userId:         authUser.id,
          planId,
          subscriptionId: sub.id,
          planCode:       plan.paystackPlanCode,
          amountKobo:     Math.round((plan.pricing?.amount || 0) * 100),
          customerCode,
          fullName:       authUser.fullName || '',
          planName:       plan.name,
        });
        authorizationUrl = result.authorizationUrl;
        reference        = result.reference;
      } catch (err) {
        // Roll back the pending subscription so the user can retry
        await SubscriptionModel.delete(sub.id);
        logger.error('[subscription] initializeSubscription failed:', err.message);
        throw new GraphQLError(`Payment init failed: ${err.message}`, {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }

      logger.info(`[subscription] card subscription initialized for user ${authUser.id}, sub ${sub.id}`);

      return { authorizationUrl, reference, subscriptionId: sub.id };
    },

    // ── User: initialize card subscription by Paystack plan_code ─────────────
    // Used by the browser subscription page which fetches plans directly from
    // Paystack and passes plan_code back instead of our internal planId.
    initializeCardSubscriptionByCode: async (_, { planCode }, context) => {
      const authUser = requireAuth(context);

      const plan = await SubscriptionPlanModel.findByPaystackCode(planCode);
      if (!plan || !plan.isActive) {
        throw new GraphQLError('Plan not found or inactive', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Delegate to the same resolver logic
      return subscriptionResolvers.Mutation.initializeCardSubscription(
        null,
        { planId: plan.id },
        context
      );
    },

    // ── User: cancel subscription ─────────────────────────────────────────────
    cancelSubscription: async (_, { reason }, context) => {
      const authUser = requireAuth(context);
      const subs = await SubscriptionModel.findByUser(authUser.id);
      const sub  = subs.find(s => s.status === 'active');
      if (!sub) {
        throw new GraphQLError('No active subscription found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Disable on Paystack so it doesn't auto-renew
      if (sub.paystackSubscriptionCode && sub.paystackEmailToken) {
        try {
          await paymentsService.disableSubscription({
            subscriptionCode: sub.paystackSubscriptionCode,
            emailToken:       sub.paystackEmailToken,
          });
          logger.info(`[subscription] Paystack subscription disabled: ${sub.paystackSubscriptionCode}`);
        } catch (err) {
          logger.error('[subscription] disableSubscription failed:', err.message);
          // Non-fatal — subscription is cancelled in our DB regardless
        }
      }

      const updated = await SubscriptionModel.findByIdAndUpdate(sub.entityId || sub.id, {
        status: 'cancelled',
        cancellation: {
          cancelledAt: new Date().toISOString(),
          reason:      reason || 'User requested cancellation',
          cancelledBy: authUser.id,
        },
      }, { new: true });

      await UserModel.findByIdAndUpdate(authUser.id, {
        subscriptionStatus:  'cancelled',
        currentSubscription: null,
      });

      return entityToJSON(updated);
    },

    pauseSubscription: async (_, __, context) => {
      const authUser = requireAuth(context);
      const subs = await SubscriptionModel.findByUser(authUser.id);
      const sub  = subs.find(s => s.status === 'active');
      if (!sub) {
        throw new GraphQLError('No active subscription found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      const updated = await SubscriptionModel.findByIdAndUpdate(sub.entityId || sub.id, {
        status: 'paused',
      }, { new: true });
      await UserModel.findByIdAndUpdate(authUser.id, { subscriptionStatus: 'paused' });
      return entityToJSON(updated);
    },

    resumeSubscription: async (_, __, context) => {
      const authUser = requireAuth(context);
      const subs = await SubscriptionModel.findByUser(authUser.id);
      const sub  = subs.find(s => s.status === 'paused');
      if (!sub) {
        throw new GraphQLError('No paused subscription found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      const updated = await SubscriptionModel.findByIdAndUpdate(sub.entityId || sub.id, {
        status: 'active',
      }, { new: true });
      await UserModel.findByIdAndUpdate(authUser.id, { subscriptionStatus: 'active' });
      return entityToJSON(updated);
    },

    // ── User: subscription manage link ─────────────────────────────────────────
    getSubscriptionManageLink: async (_, __, context) => {
      const authUser = requireAuth(context);
      const subs = await SubscriptionModel.findByUser(authUser.id);
      const sub  = subs.find(s => s.status === 'active');
      if (!sub || !sub.paystackSubscriptionCode) {
        throw new GraphQLError('No active card subscription found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      try {
        const result = await paymentsService.getSubscriptionManageLink(sub.paystackSubscriptionCode);
        return { link: result.link };
      } catch (err) {
        logger.error('[subscription] getSubscriptionManageLink failed:', err.message);
        throw new GraphQLError('Could not retrieve manage link. Please try again.', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }
    },

    // ── User: send manage email ────────────────────────────────────────────────
    sendSubscriptionManageEmail: async (_, __, context) => {
      const authUser = requireAuth(context);
      const subs = await SubscriptionModel.findByUser(authUser.id);
      const sub  = subs.find(s => s.status === 'active');
      if (!sub || !sub.paystackSubscriptionCode) {
        throw new GraphQLError('No active card subscription found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }
      try {
        await paymentsService.sendSubscriptionManageEmail(sub.paystackSubscriptionCode);
        return true;
      } catch (err) {
        logger.error('[subscription] sendSubscriptionManageEmail failed:', err.message);
        throw new GraphQLError('Could not send manage email. Please try again.', {
          extensions: { code: 'SERVICE_UNAVAILABLE' },
        });
      }
    },
  },
};

export default subscriptionResolvers;
