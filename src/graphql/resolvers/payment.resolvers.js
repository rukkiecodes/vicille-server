/**
 * Payment resolvers — thin proxy to the payments microservice.
 * No payment logic lives here; all calls are forwarded via HTTP.
 */
import { GraphQLError } from 'graphql';
import { requireAuth, requireAdmin } from '../helpers.js';
import SubscriptionPlanModel from '../../modules/subscriptions/subscriptionPlan.model.js';
import SubscriptionModel from '../../modules/subscriptions/subscription.model.js';
import UserModel from '../../modules/users/user.model.js';
import logger from '../../core/logger/index.js';

const PAY_URL = (process.env.PAYMENTS_SERVICE_URL || process.env.VICELLE_PAY_URL || 'http://localhost:5000').trim();
const PAY_KEY = (process.env.INTERNAL_SERVICE_KEY || '').trim();

function buildConnectionFromService(result, page, limit) {
  const nodes      = result?.data || [];
  const total      = result?.pagination?.total || 0;
  const totalPages = result?.pagination?.totalPages || Math.ceil(total / limit);

  return {
    nodes,
    pageInfo: {
      page, limit, total, totalPages,
      hasNextPage:     page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}

async function callPay(method, path, body) {
  const payload = body && typeof body === 'object' ? { ...body, serviceKey: PAY_KEY } : body;
  const res = await fetch(`${PAY_URL}${path}`, {
    method,
    headers: {
      'x-service-key': PAY_KEY,
      'Content-Type':  'application/json',
    },
    body: payload ? JSON.stringify(payload) : undefined,
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
    myPayments: async (_, { pagination = {} }, context) => {
      const authUser = requireAuth(context);
      const page  = pagination.page  || 1;
      const limit = pagination.limit || 20;
      const result = await callPay('GET', `/payment/list/${authUser.id}?page=${page}&limit=${limit}`);
      return buildConnectionFromService(result, page, limit);
    },

    myPaystackTransactions: async (_, { limit = 50, page = 1 }, context) => {
      const authUser = requireAuth(context);
      const qs = `?email=${encodeURIComponent(authUser.email)}&userId=${encodeURIComponent(authUser.id)}&perPage=${limit}&page=${page}`;
      const result = await callPay('GET', `/transactions/list${qs}`);
      return result.rows || [];
    },

    payment: async (_, { id }, context) => {
      requireAuth(context);
      return callPay('GET', `/payment/id/${id}`);
    },

    paymentByReference: async (_, { reference }, context) => {
      requireAuth(context);
      return callPay('GET', `/payment/status/${reference}`);
    },

    payments: async (_, { pagination = {} }, context) => {
      requireAdmin(context);
      const page  = pagination.page  || 1;
      const limit = pagination.limit || 20;
      const result = await callPay('GET', `/payment/list?page=${page}&limit=${limit}`);
      return buildConnectionFromService(result, page, limit);
    },

    myPaymentMethods: async (_, __, context) => {
      const authUser = requireAuth(context);
      return callPay('GET', `/payment/methods/${authUser.id}`);
    },

    nigeriaBanks: async (_, __, context) => {
      requireAuth(context);
      return callPay('GET', '/authorization/banks');
    },
  },

  Mutation: {
    /**
     * Card subscription via Paystack hosted checkout (monthly plan).
     *
     * Flow:
     *   1. Validate plan + paystackPlanCode
     *   2. Cancel any stale pending_payment subscriptions
     *   3. Create a new pending_payment subscription record
     *   4. POST /authorization/initialize → payments service → Paystack
     *   5. Return { redirectUrl, reference } — app opens redirectUrl in WebView
     *
     * The subscription becomes active when Paystack fires the charge.success /
     * subscription.create webhook, which hits /internal/subscription-event.
     */
    initializeSubscriptionPayment: async (_, { planId, callbackUrl }, context) => {
      const authUser = requireAuth(context);

      const plan = await SubscriptionPlanModel.findById(planId);
      if (!plan || !plan.isActive) {
        throw new GraphQLError('Subscription plan not found or inactive', {
          extensions: { code: 'NOT_FOUND' },
        });
      }

      if (!plan.paystackPlanCode) {
        throw new GraphQLError(
          'This plan is not yet configured for payment. Please contact support.',
          { extensions: { code: 'BAD_USER_INPUT' } }
        );
      }

      // Block if user already has an active subscription
      const existing = await SubscriptionModel.findByUser(authUser.id);
      for (const s of existing) {
        if (s.status === 'active') {
          throw new GraphQLError('You already have an active subscription.', {
            extensions: { code: 'CONFLICT' },
          });
        }
        // Cancel stale pending_payment subscriptions so the user can retry cleanly
        if (s.status === 'pending_payment') {
          await SubscriptionModel.findByIdAndUpdate(s.entityId || s.id, { status: 'cancelled' });
        }
      }

      // Create the subscription in a pending state
      const sub = await SubscriptionModel.create({
        user:          authUser.id,
        plan:          planId,
        status:        'pending_payment',
        paymentStatus: 'pending',
        paymentChannel: 'card',
      });

      const user           = await UserModel.findById(authUser.id);
      const subscriptionId = sub.entityId || sub.id;

      // Ensure a Paystack customer record exists and grab the code
      let customerCode = user?.paystackCustomerCode || null;
      if (!customerCode) {
        try {
          const { default: paymentsService } = await import('../../services/paymentsService.js');
          const nameParts = (user?.fullName || '').split(' ');
          const customer  = await paymentsService.ensureCustomer({
            userId:    authUser.id,
            email:     user?.email || authUser.email,
            firstName: nameParts[0] || '',
            lastName:  nameParts.slice(1).join(' ') || '',
          });
          customerCode = customer.customerCode;
          await UserModel.findByIdAndUpdate(authUser.id, { paystackCustomerCode: customerCode });
        } catch (err) {
          logger.error('[initializeSubscriptionPayment] ensureCustomer failed:', err.message);
          // Non-fatal — continue without customerCode
        }
      }

      // amountKobo: pricing.amount is in NGN → convert to kobo
      const amountKobo = Math.round((plan.pricing?.amount || 0) * 100);
      if (amountKobo <= 0) {
        await SubscriptionModel.findByIdAndUpdate(subscriptionId, { status: 'cancelled' });
        throw new GraphQLError('This plan has no price configured. Please contact support.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }

      // Ask payments service to initialize a Paystack card transaction (step 1 of 2-step flow)
      let result;
      try {
        result = await callPay('POST', '/authorization/initialize', {
          email:          user?.email || authUser.email,
          userId:         authUser.id,
          planId,
          subscriptionId,
          planCode:       plan.paystackPlanCode,
          amountKobo,
          customerCode:   customerCode || undefined,
          fullName:       user?.fullName || '',
          planName:       plan.name,
          callbackUrl:    callbackUrl || undefined,
        });
      } catch (err) {
        // Roll back pending subscription so user can retry
        await SubscriptionModel.findByIdAndUpdate(subscriptionId, { status: 'cancelled' });
        throw err;
      }

      return {
        redirectUrl: result.authorizationUrl,
        reference:   result.reference,
      };
    },

    verifyPayment: async (_, { reference }, context) => {
      requireAuth(context);
      return callPay('GET', `/payment/status/${reference}`);
    },

    refundPayment: async (_, { id, reason }, context) => {
      requireAdmin(context);
      return callPay('POST', `/payment/refund/${id}`, { reason });
    },

    verifyNigeriaBankAccount: async (_, { bankCode, accountNumber }, context) => {
      requireAuth(context);
      const qs = `?bankCode=${encodeURIComponent(bankCode)}&accountNumber=${encodeURIComponent(accountNumber)}`;
      return callPay('GET', `/payment/resolve-account${qs}`);
    },
  },
};

export default paymentResolvers;
