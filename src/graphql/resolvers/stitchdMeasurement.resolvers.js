/**
 * Stitchd measurement resolvers (batch 03).
 *
 * Versioned, append-only measurement sets + voice transcription. Every resolver resolves
 * the tenant via `requireTailor`; the model scopes by tailorId and verifies customer
 * ownership on writes (doc 01 §3). Transcription enforces the per-tenant AI cap BEFORE the
 * Whisper call and records a unit only AFTER it succeeds (doc 01 §7).
 */
import { GraphQLError } from 'graphql';
import StitchdMeasurementModel from '../../modules/stitchd/stitchdMeasurement.model.js';
import StitchdAiUsageModel from '../../modules/stitchd/stitchdAiUsage.model.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';
import { requireTailor } from '../stitchd.guard.js';
import transcription from '../../services/stitchdTranscription.service.js';
import logger from '../../core/logger/index.js';

const AI_FEATURE = 'transcription';

/** Resolve the tailor's tier (defaults to 'starter' if profile missing). */
async function tierFor(tailorId) {
  const profile = await StitchdTailorProfileModel.findByTailorId(tailorId);
  return profile?.tier || 'starter';
}

const stitchdMeasurementResolvers = {
  Query: {
    stitchdMeasurementSets: async (_p, { customerId }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdMeasurementModel.listByCustomer(tailorId, customerId);
      } catch (error) {
        logger.error('stitchdMeasurementSets error:', error);
        throw new GraphQLError('Could not load measurements. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    stitchdMeasurementSet: async (_p, { id }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdMeasurementModel.findById(tailorId, id);
      } catch (error) {
        logger.error('stitchdMeasurementSet error:', error);
        throw new GraphQLError('Could not load that measurement set. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    stitchdAiUsage: async (_p, { feature }, context) => {
      const tailorId = requireTailor(context);
      const tier = await tierFor(tailorId);
      return StitchdAiUsageModel.snapshot(tailorId, feature || AI_FEATURE, tier);
    },
  },

  Mutation: {
    appendStitchdMeasurementSet: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      if (!input?.customerId) {
        throw new GraphQLError('A customer is required.', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      try {
        return await StitchdMeasurementModel.append(tailorId, input);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('appendStitchdMeasurementSet error:', error);
        throw new GraphQLError('Could not save the measurement set. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    transcribeStitchdMeasurements: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      const tier = await tierFor(tailorId);

      // Enforce the tier cap BEFORE the paid Whisper call.
      await StitchdAiUsageModel.assertWithinCap(tailorId, AI_FEATURE, tier);

      let transcript;
      try {
        transcript = await transcription.transcribeAudio({
          base64: input.audioBase64,
          mimeType: input.mimeType || 'audio/m4a',
        });
      } catch (error) {
        logger.error('transcribeStitchdMeasurements upstream error:', error);
        const code = error.code === 'AI_NOT_CONFIGURED' ? 'FAILED_PRECONDITION' : 'BAD_GATEWAY';
        const msg =
          error.code === 'AI_NOT_CONFIGURED'
            ? 'Voice transcription is not available right now. You can enter measurements by hand.'
            : "Couldn't understand that recording. Try again, or enter by hand.";
        throw new GraphQLError(msg, { extensions: { code } });
      }

      // Only charge a unit once the call succeeded.
      await StitchdAiUsageModel.record(tailorId, AI_FEATURE, 1);

      const fields = transcription.parseMeasurements(transcript);
      const usage = await StitchdAiUsageModel.snapshot(tailorId, AI_FEATURE, tier);

      return {
        transcript,
        fields,
        matchedCount: Object.keys(fields).length,
        usage,
      };
    },
  },
};

export default stitchdMeasurementResolvers;
