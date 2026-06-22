/**
 * Stitchd AI suite resolvers (batch 12). Tier cap is enforced BEFORE any provider call
 * (doc 01 §7); a unit is metered only AFTER success. Tenant resolved via `requireTailor`;
 * models scope by tailorId and validate customer/order ownership.
 */
import { GraphQLError } from 'graphql';
import StitchdAiSuiteModel from '../../modules/stitchd/stitchdAiSuite.model.js';
import StitchdAiUsageModel from '../../modules/stitchd/stitchdAiUsage.model.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';
import { requireTailor } from '../stitchd.guard.js';
import briefExtractor from '../../services/stitchdBriefExtractor.service.js';
import designService from '../../services/stitchdDesign.service.js';
import transcription from '../../services/stitchdTranscription.service.js';
import logger from '../../core/logger/index.js';

async function tierFor(tailorId) {
  const profile = await StitchdTailorProfileModel.findByTailorId(tailorId);
  return profile?.tier || 'starter';
}

/** Map a service error code to a GraphQL error (FAILED_PRECONDITION when unconfigured). */
function upstream(error, fallbackMsg) {
  const code = error.code === 'AI_NOT_CONFIGURED' ? 'FAILED_PRECONDITION'
    : error.code === 'BAD_INPUT' ? 'BAD_USER_INPUT'
    : 'BAD_GATEWAY';
  const msg = error.code === 'AI_NOT_CONFIGURED'
    ? 'This AI tool is not available right now. Please try again later.'
    : error.code === 'BAD_INPUT' ? error.message : fallbackMsg;
  return new GraphQLError(msg, { extensions: { code } });
}

const stitchdAiSuiteResolvers = {
  Query: {
    stitchdAiBriefs: async (_p, { limit }, ctx) => {
      const tailorId = requireTailor(ctx);
      return StitchdAiSuiteModel.listBriefs(tailorId, { limit: limit || 30 });
    },
    stitchdAiDesigns: async (_p, { limit }, ctx) => {
      const tailorId = requireTailor(ctx);
      return StitchdAiSuiteModel.listDesigns(tailorId, { limit: limit || 30 });
    },
  },

  Mutation: {
    extractStitchdBrief: async (_p, { input }, ctx) => {
      const tailorId = requireTailor(ctx);
      const tier = await tierFor(tailorId);
      if (input.customerId && !(await StitchdAiSuiteModel.ownsCustomer(tailorId, input.customerId))) {
        throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
      }
      // Enforce cap before any paid call.
      await StitchdAiUsageModel.assertWithinCap(tailorId, 'brief', tier);

      let transcript = (input.text || '').trim();
      let sourceKind = 'text';
      try {
        if (input.audioBase64) {
          transcript = await transcription.transcribeAudio({ base64: input.audioBase64, mimeType: input.mimeType || 'audio/m4a' });
          sourceKind = 'voice';
        }
        if (!transcript) throw Object.assign(new Error('Nothing to extract.'), { code: 'BAD_INPUT' });
        const extracted = await briefExtractor.extractBrief(transcript);

        await StitchdAiUsageModel.record(tailorId, 'brief', 1);
        const brief = await StitchdAiSuiteModel.recordBrief(tailorId, {
          customerId: input.customerId, orderId: input.orderId, sourceKind, transcript, extracted, model: 'gemini',
        });
        const usage = await StitchdAiUsageModel.snapshot(tailorId, 'brief', tier);
        return { brief, usage };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('extractStitchdBrief error:', error);
        throw upstream(error, "Couldn't read that message. Please try again.");
      }
    },

    generateStitchdDesign: async (_p, { input }, ctx) => {
      const tailorId = requireTailor(ctx);
      const tier = await tierFor(tailorId);
      if (input.customerId && !(await StitchdAiSuiteModel.ownsCustomer(tailorId, input.customerId))) {
        throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
      }
      if (input.orderId && !(await StitchdAiSuiteModel.ownsOrder(tailorId, input.orderId))) {
        throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });
      }
      await StitchdAiUsageModel.assertWithinCap(tailorId, 'design', tier);

      try {
        const result = await designService.generateDesign({
          description: input.description,
          styleModifiers: input.styleModifiers || [],
          color: input.color,
          count: input.count,
          tailorId,
        });
        // Meter one unit per generated image.
        await StitchdAiUsageModel.record(tailorId, 'design', result.imageUrls.length);
        const design = await StitchdAiSuiteModel.recordDesign(tailorId, {
          customerId: input.customerId, orderId: input.orderId,
          prompt: result.prompt, styleModifiers: input.styleModifiers || [], color: input.color,
          imageUrls: result.imageUrls, provider: 'gemini', model: result.model,
        });
        const usage = await StitchdAiUsageModel.snapshot(tailorId, 'design', tier);
        return { design, usage };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('generateStitchdDesign error:', error);
        throw upstream(error, "Couldn't generate designs just now. Please try again.");
      }
    },

    saveStitchdDesignTo: async (_p, { input }, ctx) => {
      const tailorId = requireTailor(ctx);
      if (!input.customerId && !input.orderId) {
        throw new GraphQLError('Choose a customer or order to save to.', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      try {
        return await StitchdAiSuiteModel.saveDesignTo(tailorId, input);
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('saveStitchdDesignTo error:', error);
        throw new GraphQLError('Could not save the design. Please try again.', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
      }
    },
  },
};

export default stitchdAiSuiteResolvers;
