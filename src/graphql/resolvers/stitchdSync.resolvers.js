/**
 * Stitchd delta-sync resolvers (batch 08). Tenant resolved via `requireTailor`; the model
 * scopes every query by tailorId — a tenant's pull never returns another tenant's rows.
 */
import { GraphQLError } from 'graphql';
import StitchdSyncModel from '../../modules/stitchd/stitchdSync.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

const stitchdSyncResolvers = {
  Query: {
    stitchdSyncPull: async (_p, { since }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdSyncModel.pull(tailorId, since || null);
      } catch (error) {
        logger.error('stitchdSyncPull error:', error);
        throw new GraphQLError('Could not sync. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },
  },
};

export default stitchdSyncResolvers;
