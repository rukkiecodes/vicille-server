/**
 * Payment resolvers — thin proxy to vicelle-pay microservice.
 * No payment logic lives here; all calls are forwarded via HTTP.
 */
import { GraphQLError } from 'graphql';
import { requireAuth, requireAdmin } from '../helpers.js';
import logger from '../../core/logger/index.js';

const PAY_URL = process.env.VICELLE_PAY_URL  || 'http://localhost:5000';
const PAY_KEY = process.env.INTERNAL_SERVICE_KEY || '';

async function callPay(method, path, body) {
  const res = await fetch(`${PAY_URL}${path}`, {
    method,
    headers: {
      'x-service-key': PAY_KEY,
      'Content-Type':  'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: text }; }

  if (!res.ok) {
    logger.error(`[payment-proxy] ${method} ${path} → ${res.status}`, json);
    throw new GraphQLError(json?.error || 'Payment service error', {
      extensions: { code: 'PAYMENT_SERVICE_ERROR', status: res.status },
    });
  }

  return json;
}

const paymentResolvers = {
  Query: {
    myPayments: async (_, __, context) => {
      const authUser = requireAuth(context);
      // vicelle-pay doesn't expose a paginated payments list yet — return empty
      // (can be expanded once vicelle-pay has GET /payment/list/:userId)
      return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    },

    payment: async (_, { id }, context) => {
      requireAuth(context);
      return callPay('GET', `/payment/status/${id}`);
    },

    paymentByReference: async (_, { reference }, context) => {
      requireAuth(context);
      return callPay('GET', `/payment/status/${reference}`);
    },

    payments: async (_, __, context) => {
      requireAdmin(context);
      return { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
    },

    myPaymentMethods: async (_, __, context) => {
      const authUser = requireAuth(context);
      return callPay('GET', `/payment/methods/${authUser.id}`);
    },

  },

  Mutation: {
    /**
     * Main subscription entry point.
     * Creates a pending subscription in DB then asks vicelle-pay to initialize
     * a Paystack card checkout. Returns the authorization_url for the app to open.
     * The card used is saved as a reusable authorization for future monthly charges.
     */
    initializeSubscriptionPayment: async (_, { planId, callbackUrl }, context) => {
      const authUser = requireAuth(context);

      const { default: SubscriptionPlanModel } = await import('../../modules/subscriptions/subscriptionPlan.model.js');
      const { default: SubscriptionModel }     = await import('../../modules/subscriptions/subscription.model.js');
      const { default: UserModel }             = await import('../../modules/users/user.model.js');

      const plan = await SubscriptionPlanModel.findById(planId);
      if (!plan) {
        throw new GraphQLError('Subscription plan not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Cancel any existing pending_payment subscription before starting fresh
      const existing = await SubscriptionModel.findByUser(authUser.id);
      for (const s of existing) {
        if (s.status === 'active') {
          throw new GraphQLError('You already have an active subscription.', {
            extensions: { code: 'CONFLICT' },
          });
        }
        if (s.status === 'pending_payment') {
          await SubscriptionModel.findByIdAndUpdate(s.entityId || s.id, { status: 'cancelled' });
        }
      }

      const sub = await SubscriptionModel.create({
        user:          authUser.id,
        plan:          planId,
        status:        'pending_payment',
        paymentStatus: 'pending',
      });

      const user         = await UserModel.findById(authUser.id);
      const amountInKobo = Math.round((plan.pricing?.amount || 0) * 100);

      const result = await callPay('POST', '/payment/initialize', {
        userId:         authUser.id,
        planId,
        subscriptionId: sub.entityId || sub.id,
        email:          user?.email || authUser.email,
        amount:         amountInKobo,
        callbackUrl:    callbackUrl || undefined,
      });

      return result; // { redirectUrl, reference, paymentId }
    },

    /**
     * PayPal Vault: vault card + charge in one call (no browser redirect).
     * Creates a pending subscription, forwards card to vicelle-pay, returns
     * { subscriptionId, paymentId, status } directly in the mutation response.
     */
    subscribeWithCard: async (_, { planId, card }, context) => {
      const authUser = requireAuth(context);

      const { default: SubscriptionPlanModel } = await import('../../modules/subscriptions/subscriptionPlan.model.js');
      const { default: SubscriptionModel }     = await import('../../modules/subscriptions/subscription.model.js');
      const { default: UserModel }             = await import('../../modules/users/user.model.js');

      const plan = await SubscriptionPlanModel.findById(planId);
      if (!plan) {
        throw new GraphQLError('Subscription plan not found', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      // Cancel any existing pending_payment subscription before starting fresh
      const existing = await SubscriptionModel.findByUser(authUser.id);
      for (const s of existing) {
        if (s.status === 'active') {
          throw new GraphQLError('You already have an active subscription.', {
            extensions: { code: 'CONFLICT' },
          });
        }
        if (s.status === 'pending_payment') {
          await SubscriptionModel.findByIdAndUpdate(s.entityId || s.id, { status: 'cancelled' });
        }
      }

      const sub = await SubscriptionModel.create({
        user:          authUser.id,
        plan:          planId,
        status:        'pending_payment',
        paymentStatus: 'pending',
      });

      const user           = await UserModel.findById(authUser.id);
      const subscriptionId = sub.entityId || sub.id;

      const result = await callPay('POST', '/payment/subscribe-with-card', {
        userId:         authUser.id,
        planId,
        subscriptionId,
        email:          user?.email || authUser.email,
        amount:         plan.pricing?.amount || 0,
        currency:       plan.pricing?.currency || 'USD',
        card,
      });

      return {
        subscriptionId,
        paymentId: result.paymentId,
        status:    result.status,   // 'activated'
        message:   null,
      };
    },

    verifyPayment: async (_, { reference }, context) => {
      requireAuth(context);
      return callPay('GET', `/payment/status/${reference}`);
    },

    // Keep admin refund wired (calls vicelle-pay once that endpoint exists)
    refundPayment: async (_, { id }, context) => {
      requireAdmin(context);
      throw new GraphQLError('Refunds must be processed via the admin dashboard for now.', {
        extensions: { code: 'NOT_IMPLEMENTED' },
      });
    },
  },
};

export default paymentResolvers;
