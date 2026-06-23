/**
 * Stitchd portal/SMS resolvers (batch 18) — authenticated tenant surface. Tenant resolved via
 * `requireTailor`; the model scopes by tailorId. The public portal page is the /portal route.
 */
import { GraphQLError } from 'graphql';
import StitchdPortalModel from '../../modules/stitchd/stitchdPortal.model.js';
import { requireTailor, requirePermission } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

function wrap(e, msg) {
  if (e instanceof GraphQLError) return e;
  logger.error(`${msg}:`, e);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdPortalResolvers = {
  Query: {
    stitchdPortalLinks: async (_p, { orderId }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdPortalModel.listByOrder(tailorId, orderId); }
      catch (e) { throw wrap(e, 'Could not load links'); }
    },
    stitchdSmsLog: async (_p, { customerId }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdPortalModel.smsLog(tailorId, customerId); }
      catch (e) { throw wrap(e, 'Could not load the SMS log'); }
    },
  },

  Mutation: {
    createStitchdPortalLink: async (_p, { orderId, customerId, scope, expiresAt }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdPortalModel.createLink(tailorId, { orderId, customerId, scope: scope || 'order', expiresAt: expiresAt || null }); }
      catch (e) { throw wrap(e, 'Could not create the link'); }
    },
    revokeStitchdPortalLink: async (_p, { id }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdPortalModel.revokeLink(tailorId, id); }
      catch (e) { throw wrap(e, 'Could not revoke the link'); }
    },
    sendStitchdSms: async (_p, { customerId, body }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'messages:send');
      try { return await StitchdPortalModel.sendSms(tailorId, customerId, body); }
      catch (e) { throw wrap(e, 'Could not send the SMS'); }
    },
    setStitchdCustomerChannelPref: async (_p, { customerId, channel }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdPortalModel.setChannelPref(tailorId, customerId, channel); }
      catch (e) { throw wrap(e, 'Could not update the channel'); }
    },
  },
};

export default stitchdPortalResolvers;
