/**
 * Stitchd-side Style-U resolvers (batch 20). Tenant via requireTailor; accept/decline gated by
 * permissions and idempotent in the model. Ingestion stays on the internal route.
 */
import { GraphQLError } from 'graphql';
import StitchdStyleUModel from '../../modules/stitchd/stitchdStyleU.model.js';
import { requireTailor, requirePermission } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

function wrap(e, msg) {
  if (e instanceof GraphQLError) return e;
  logger.error(`${msg}:`, e);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdStyleUResolvers = {
  Query: {
    stitchdStyleUConnection: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdStyleUModel.getConnection(tailorId); } catch (e) { throw wrap(e, 'Could not load your Style-U status'); }
    },
    stitchdStyleUInbox: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdStyleUModel.listInbox(tailorId); } catch (e) { throw wrap(e, 'Could not load your inbox'); }
    },
    stitchdStyleUOffer: async (_p, { id }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdStyleUModel.offerDetail(tailorId, id); } catch (e) { throw wrap(e, 'Could not load the offer'); }
    },
    stitchdStyleUPayouts: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdStyleUModel.listPayouts(tailorId); } catch (e) { throw wrap(e, 'Could not load payouts'); }
    },
    stitchdStyleUMetrics: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdStyleUModel.getMetrics(tailorId); } catch (e) { throw wrap(e, 'Could not load metrics'); }
    },
  },

  Mutation: {
    applyToStyleU: async (_p, { specialties, capacityOptin }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdStyleUModel.apply(tailorId, specialties || [], capacityOptin !== false); } catch (e) { throw wrap(e, 'Could not apply'); }
    },
    setStyleUCapacityOptin: async (_p, { optin }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdStyleUModel.setCapacityOptin(tailorId, optin); } catch (e) { throw wrap(e, 'Could not update'); }
    },
    disconnectFromStyleU: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdStyleUModel.disconnect(tailorId); } catch (e) { throw wrap(e, 'Could not disconnect'); }
    },
    acceptStyleUOffer: async (_p, { offerId }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdStyleUModel.acceptOffer(tailorId, offerId); } catch (e) { throw wrap(e, 'Could not accept the offer'); }
    },
    declineStyleUOffer: async (_p, { offerId, reason }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdStyleUModel.declineOffer(tailorId, offerId, reason || null); } catch (e) { throw wrap(e, 'Could not decline the offer'); }
    },
  },
};

export default stitchdStyleUResolvers;
