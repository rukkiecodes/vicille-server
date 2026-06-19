/**
 * Stitchd AI Fit Consultant resolvers (batch 07, spec §5.6 / §7.6).
 *
 * Tier cap is enforced BEFORE the OpenAI call so an over-cap tenant never spends (doc 01 §7,
 * spec §12); a unit is metered only AFTER a successful answer. Every resolver resolves the
 * tenant via `requireTailor`; models scope by tailorId and validate target ownership.
 */
import { GraphQLError } from 'graphql';
import StitchdAiUsageModel from '../../modules/stitchd/stitchdAiUsage.model.js';
import StitchdAiMessageModel from '../../modules/stitchd/stitchdAiMessage.model.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';
import { requireTailor } from '../stitchd.guard.js';
import fitConsultant from '../../services/stitchdFitConsultant.service.js';
import logger from '../../core/logger/index.js';

const AI_FEATURE = 'fit_consultant';

/** Resolve the tailor's tier (defaults to 'starter' if profile missing). */
async function tierFor(tailorId) {
  const profile = await StitchdTailorProfileModel.findByTailorId(tailorId);
  return profile?.tier || 'starter';
}

const stitchdAiResolvers = {
  Query: {
    stitchdFitConsultantHistory: async (_p, { limit }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdAiMessageModel.history(tailorId, { feature: AI_FEATURE, limit: limit || 50 });
      } catch (error) {
        logger.error('stitchdFitConsultantHistory error:', error);
        throw new GraphQLError('Could not load the conversation. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },
  },

  Mutation: {
    askStitchdFitConsultant: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      if (!input?.clientUuid) {
        throw new GraphQLError('Missing message id.', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      if (!input?.prompt?.trim()) {
        throw new GraphQLError('Ask a question first.', { extensions: { code: 'BAD_USER_INPUT' } });
      }

      const tier = await tierFor(tailorId);

      // Validate optional context belongs to this tenant.
      if (input.customerId || input.orderId) {
        await StitchdAiMessageModel.assertTargetOwned(tailorId, {
          customerId: input.customerId,
          orderId: input.orderId,
        });
      }

      // Enforce the tier cap BEFORE the paid OpenAI call.
      await StitchdAiUsageModel.assertWithinCap(tailorId, AI_FEATURE, tier);

      // Persist the user turn (idempotent on clientUuid).
      const question = await StitchdAiMessageModel.recordUserTurn(tailorId, {
        clientUuid: input.clientUuid,
        content: input.prompt.trim(),
        customerId: input.customerId || null,
        orderId: input.orderId || null,
        photoUrls: input.photoUrls || [],
      });

      let answerText;
      try {
        answerText = await fitConsultant.askFitConsultant({
          prompt: input.prompt,
          photoUrls: input.photoUrls || [],
          tier,
        });
      } catch (error) {
        logger.error('askStitchdFitConsultant upstream error:', error);
        const code = error.code === 'AI_NOT_CONFIGURED' ? 'FAILED_PRECONDITION' : 'BAD_GATEWAY';
        const msg =
          error.code === 'AI_NOT_CONFIGURED'
            ? 'The AI Fit Consultant is not available right now. Please try again later.'
            : "Couldn't get a recommendation just now. Please try again.";
        throw new GraphQLError(msg, { extensions: { code } });
      }

      // Only charge a unit once the call succeeded.
      await StitchdAiUsageModel.record(tailorId, AI_FEATURE, 1);

      const answer = await StitchdAiMessageModel.recordAssistantTurn(tailorId, {
        content: answerText,
        customerId: input.customerId || null,
        orderId: input.orderId || null,
      });

      const usage = await StitchdAiUsageModel.snapshot(tailorId, AI_FEATURE, tier);
      return { question, answer, usage };
    },

    saveStitchdAiResponseAsNote: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      if (!input?.messageId) {
        throw new GraphQLError('Missing message id.', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      if (!input.customerId && !input.orderId) {
        throw new GraphQLError('Choose a customer or order to save the note to.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      try {
        const message = await StitchdAiMessageModel.findById(tailorId, input.messageId);
        if (!message || message.role !== 'assistant') {
          throw new GraphQLError('That AI response was not found.', { extensions: { code: 'NOT_FOUND' } });
        }
        await StitchdAiMessageModel.assertTargetOwned(tailorId, {
          customerId: input.customerId,
          orderId: input.orderId,
        });
        await StitchdAiMessageModel.appendNoteToTarget(tailorId, {
          customerId: input.customerId || null,
          orderId: input.orderId || null,
          text: message.content,
        });
        return { ok: true, customerId: input.customerId || null, orderId: input.orderId || null };
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('saveStitchdAiResponseAsNote error:', error);
        throw new GraphQLError('Could not save the note. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },
  },
};

export default stitchdAiResolvers;
