/**
 * Stitchd telemetry resolvers (batch 08). Tenant resolved via `requireTailor`; the model
 * scopes by tailorId and scrubs PII from analytics props before storing.
 */
import { GraphQLError } from 'graphql';
import StitchdTelemetryModel from '../../modules/stitchd/stitchdTelemetry.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

const stitchdTelemetryResolvers = {
  Mutation: {
    logStitchdEvents: async (_p, { events }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdTelemetryModel.recordEvents(tailorId, events);
      } catch (error) {
        // Analytics must never break the app — log and report zero stored.
        logger.error('logStitchdEvents error:', error);
        return 0;
      }
    },

    submitStitchdFeedback: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      if (!input?.message?.trim()) {
        throw new GraphQLError('Add a message before sending.', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      try {
        const result = await StitchdTelemetryModel.recordFeedback(tailorId, {
          message: input.message,
          screenshotUrl: input.screenshotUrl || null,
          context: input.context || {},
        });
        return result;
      } catch (error) {
        logger.error('submitStitchdFeedback error:', error);
        throw new GraphQLError('Could not send your feedback. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },
  },
};

export default stitchdTelemetryResolvers;
