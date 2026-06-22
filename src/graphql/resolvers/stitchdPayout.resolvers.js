/**
 * Stitchd payout resolvers (batch 10). Tenant resolved via `requireTailor`; the model scopes
 * every query/mutation by tailorId. Bank setup creates a Paystack transfer recipient.
 */
import { GraphQLError } from 'graphql';
import StitchdPayoutModel from '../../modules/stitchd/stitchdPayout.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

function wrap(error, msg) {
  if (error instanceof GraphQLError) return error;
  logger.error(`${msg}:`, error);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdPayoutResolvers = {
  Query: {
    stitchdPendingPayout: async (_p, _a, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdPayoutModel.pending(tailorId); }
      catch (e) { throw wrap(e, 'Could not load your pending payout'); }
    },

    stitchdPayouts: async (_p, _a, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdPayoutModel.list(tailorId); }
      catch (e) { throw wrap(e, 'Could not load payouts'); }
    },

    stitchdPayout: async (_p, { id }, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdPayoutModel.findById(tailorId, id); }
      catch (e) { throw wrap(e, 'Could not load that payout'); }
    },

    stitchdPayoutBankAccount: async (_p, _a, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdPayoutModel.getBankAccount(tailorId); }
      catch (e) { throw wrap(e, 'Could not load your bank account'); }
    },

    stitchdBankList: async (_p, _a, context) => {
      requireTailor(context);
      try { return await StitchdPayoutModel.listBanks(); }
      catch (e) { throw wrap(e, 'Could not load the bank list'); }
    },
  },

  Mutation: {
    setStitchdPayoutBankAccount: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdPayoutModel.setBankAccount(tailorId, input); }
      catch (e) { throw wrap(e, 'Could not save your bank account'); }
    },
  },
};

export default stitchdPayoutResolvers;
