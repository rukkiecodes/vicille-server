/**
 * Stitchd batch-13 resolvers: availability/capacity + voice-note import. Tenant resolved via
 * `requireTailor`; models scope by tailorId. Voice import enforces the transcription AI cap
 * BEFORE the provider call and meters a unit after (doc 01 §7 / batch 11).
 */
import { GraphQLError } from 'graphql';
import StitchdOrderModel from '../../modules/stitchd/stitchdOrder.model.js';
import StitchdThreadModel from '../../modules/stitchd/stitchdThread.model.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';
import StitchdAiUsageModel from '../../modules/stitchd/stitchdAiUsage.model.js';
import transcription from '../../services/stitchdTranscription.service.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

const AI_FEATURE = 'transcription';

const stitchdRelationshipResolvers = {
  Query: {
    stitchdCapacityStatus: async (_p, { weekOf }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdOrderModel.capacityStatus(tailorId, weekOf || null); }
      catch (e) { logger.error('stitchdCapacityStatus error:', e); throw new GraphQLError('Could not load capacity.', { extensions: { code: 'INTERNAL_SERVER_ERROR' } }); }
    },
  },

  Mutation: {
    updateStitchdAvailability: async (_p, { input }, ctx) => {
      const tailorId = requireTailor(ctx);
      try {
        await StitchdTailorProfileModel.update(tailorId, {
          weeklyCapacity: input.weeklyCapacity,
          workingHours: input.workingHours,
          autoNotifyStatus: input.autoNotifyStatus,
        });
        return await StitchdTailorProfileModel.findByTailorId(tailorId);
      } catch (e) { logger.error('updateStitchdAvailability error:', e); throw new GraphQLError('Could not save your settings.', { extensions: { code: 'INTERNAL_SERVER_ERROR' } }); }
    },

    importStitchdVoiceNote: async (_p, { input }, ctx) => {
      const tailorId = requireTailor(ctx);
      const profile = await StitchdTailorProfileModel.findByTailorId(tailorId);
      const tier = profile?.tier || 'starter';

      // Enforce the transcription cap before the paid call.
      await StitchdAiUsageModel.assertWithinCap(tailorId, AI_FEATURE, tier);

      let transcript;
      try {
        transcript = await transcription.transcribeAudio({ base64: input.audioBase64, mimeType: input.mimeType || 'audio/m4a' });
      } catch (error) {
        logger.error('importStitchdVoiceNote transcribe error:', error);
        const code = error.code === 'AI_NOT_CONFIGURED' ? 'FAILED_PRECONDITION' : 'BAD_GATEWAY';
        const msg = error.code === 'AI_NOT_CONFIGURED'
          ? 'Voice transcription is not available right now.'
          : "Couldn't transcribe that voice note. Please try again.";
        throw new GraphQLError(msg, { extensions: { code } });
      }

      await StitchdAiUsageModel.record(tailorId, AI_FEATURE, 1);
      const { message } = await StitchdThreadModel.logVoiceNote(tailorId, {
        clientUuid: input.clientUuid,
        customerId: input.customerId,
        transcript,
        mediaUrl: input.mediaUrl || null,
      });
      const usage = await StitchdAiUsageModel.snapshot(tailorId, AI_FEATURE, tier);
      return { message, transcript, usage };
    },
  },
};

export default stitchdRelationshipResolvers;
