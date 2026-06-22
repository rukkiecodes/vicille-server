/**
 * Stitchd billing resolvers (batch 11). Tenant resolved via `requireTailor`; the model
 * scopes by tailorId. Subscription start/change initialize a Paystack card authorization.
 */
import { GraphQLError } from 'graphql';
import StitchdBillingModel from '../../modules/stitchd/stitchdBilling.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

function wrap(error, msg) {
  if (error instanceof GraphQLError) return error;
  logger.error(`${msg}:`, error);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdBillingResolvers = {
  Query: {
    stitchdSubscription: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdBillingModel.subscription(tailorId); }
      catch (e) { throw wrap(e, 'Could not load your subscription'); }
    },
    stitchdTierEntitlements: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdBillingModel.entitlements(tailorId); }
      catch (e) { throw wrap(e, 'Could not load your plan'); }
    },
    stitchdInvoices: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdBillingModel.invoices(tailorId); }
      catch (e) { throw wrap(e, 'Could not load invoices'); }
    },
    stitchdPaymentMethod: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdBillingModel.paymentMethod(tailorId); }
      catch (e) { throw wrap(e, 'Could not load your card'); }
    },
  },

  Mutation: {
    startStitchdSubscription: async (_p, { tier }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdBillingModel.startSubscription(tailorId, tier); }
      catch (e) { throw wrap(e, 'Could not start your subscription'); }
    },
    changeStitchdTier: async (_p, { tier }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdBillingModel.startSubscription(tailorId, tier); }
      catch (e) { throw wrap(e, 'Could not change your plan'); }
    },
    updateStitchdPaymentMethod: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdBillingModel.paymentMethodUpdateLink(tailorId); }
      catch (e) { throw wrap(e, 'Could not update your card'); }
    },
    cancelStitchdSubscription: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdBillingModel.cancelSubscription(tailorId); }
      catch (e) { throw wrap(e, 'Could not cancel your subscription'); }
    },
  },
};

export default stitchdBillingResolvers;
