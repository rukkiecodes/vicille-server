/**
 * Stitchd communication resolvers (batch 06).
 *
 * Message templates + logged per-customer threads. Every resolver resolves the tenant via
 * `requireTailor`; the model scopes by tailorId and validates customer ownership, so a second
 * tailor reading another tailor's customerId gets NOT_FOUND (cross-tenant isolation).
 */
import { GraphQLError } from 'graphql';
import StitchdThreadModel from '../../modules/stitchd/stitchdThread.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

function wrap(error, msg) {
  if (error instanceof GraphQLError) return error;
  logger.error(`${msg}:`, error);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdThreadResolvers = {
  // The thread carries its messages from customerThread(); logMessage() attaches none.
  StitchdThread: {
    messages: (parent) => parent.messages ?? [],
  },

  Query: {
    stitchdMessageTemplates: async (_p, _a, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdThreadModel.templates(tailorId);
      } catch (e) { throw wrap(e, 'Could not load message templates'); }
    },

    stitchdCustomerThread: async (_p, { customerId }, context) => {
      const tailorId = requireTailor(context);
      try {
        const { thread, messages } = await StitchdThreadModel.customerThread(tailorId, customerId);
        return { ...thread, messages };
      } catch (e) { throw wrap(e, 'Could not load the thread'); }
    },
  },

  Mutation: {
    logStitchdMessage: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdThreadModel.logMessage(tailorId, input);
      } catch (e) { throw wrap(e, 'Could not log the message'); }
    },
  },
};

export default stitchdThreadResolvers;
