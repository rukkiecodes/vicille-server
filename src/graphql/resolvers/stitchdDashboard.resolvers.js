/**
 * Stitchd Home Dashboard resolvers (batch 07).
 *
 * Tenant resolved via `requireTailor`; the model scopes every aggregate by tailorId. The
 * this-week/trend figures reuse the batch-05 Money definitions so the two screens match.
 */
import { GraphQLError } from 'graphql';
import StitchdDashboardModel from '../../modules/stitchd/stitchdDashboard.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

const stitchdDashboardResolvers = {
  Query: {
    stitchdHomeDashboard: async (_p, { weekStart }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdDashboardModel.homeDashboard(tailorId, weekStart || null);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('stitchdHomeDashboard error:', error);
        throw new GraphQLError('Could not load the dashboard. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },
  },
};

export default stitchdDashboardResolvers;
