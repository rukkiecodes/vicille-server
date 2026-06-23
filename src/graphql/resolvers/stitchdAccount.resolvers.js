/**
 * Stitchd account lifecycle resolvers (batch 15). Tenant resolved via `requireTailor`; the
 * model scopes by tailorId. Deletion is blocked while a payout is in flight (batch 10).
 */
import { GraphQLError } from 'graphql';
import StitchdAccountModel from '../../modules/stitchd/stitchdAccount.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

function wrap(error, msg) {
  if (error instanceof GraphQLError) return error;
  logger.error(`${msg}:`, error);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdAccountResolvers = {
  Query: {
    stitchdDataExport: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAccountModel.exportAllCsv(tailorId); }
      catch (e) { throw wrap(e, 'Could not export your data'); }
    },
    stitchdAccountDeletion: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAccountModel.activeDeletion(tailorId); }
      catch (e) { throw wrap(e, 'Could not load your account status'); }
    },
  },

  Mutation: {
    requestStitchdAccountDeletion: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAccountModel.requestDeletion(tailorId); }
      catch (e) { throw wrap(e, 'Could not start account deletion'); }
    },
    cancelStitchdAccountDeletion: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAccountModel.cancelDeletion(tailorId); }
      catch (e) { throw wrap(e, 'Could not cancel account deletion'); }
    },
  },
};

export default stitchdAccountResolvers;
