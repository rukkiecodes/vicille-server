/**
 * Stitchd enterprise resolvers (batch 17). Tenant-facing reads + tenant-managed locations.
 * Admin actions (entitlements/account/invoices) live on the internal ops route, not here.
 */
import { GraphQLError } from 'graphql';
import StitchdEnterpriseModel from '../../modules/stitchd/stitchdEnterprise.model.js';
import { requireTailor, requirePermission } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

function wrap(e, msg) {
  if (e instanceof GraphQLError) return e;
  logger.error(`${msg}:`, e);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const capOrNull = (v) => (v === Infinity ? null : v);

const stitchdEnterpriseResolvers = {
  Query: {
    stitchdEntitlementsResolved: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try {
        const e = await StitchdEnterpriseModel.resolveEntitlements(tailorId);
        return {
          tier: e.tier,
          teamSeatCap: capOrNull(e.teamSeatCap),
          multiLocation: e.multiLocation,
          aiFitConsultantCap: capOrNull(e.aiCap('fit_consultant')),
          aiDesignCap: capOrNull(e.aiCap('design')),
          aiTranscriptionCap: capOrNull(e.aiCap('transcription')),
        };
      } catch (e) { throw wrap(e, 'Could not load your plan'); }
    },
    stitchdEnterpriseAccount: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdEnterpriseModel.getAccount(tailorId); }
      catch (e) { throw wrap(e, 'Could not load your account'); }
    },
    stitchdEnterpriseInvoices: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdEnterpriseModel.listInvoices(tailorId); }
      catch (e) { throw wrap(e, 'Could not load invoices'); }
    },
    stitchdLocations: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdEnterpriseModel.listLocations(tailorId); }
      catch (e) { throw wrap(e, 'Could not load locations'); }
    },
  },

  Mutation: {
    createStitchdLocation: async (_p, { name, address, isPrimary }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'team:manage');
      try { return await StitchdEnterpriseModel.createLocation(tailorId, { name, address, isPrimary }); }
      catch (e) { throw wrap(e, 'Could not create the location'); }
    },
    assignStitchdMemberToLocation: async (_p, { memberId, locationId }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'team:manage');
      try { return await StitchdEnterpriseModel.assignMemberToLocation(tailorId, memberId, locationId || null); }
      catch (e) { throw wrap(e, 'Could not assign the member'); }
    },
  },
};

export default stitchdEnterpriseResolvers;
