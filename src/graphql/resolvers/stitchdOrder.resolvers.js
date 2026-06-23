/**
 * Stitchd order resolvers (batch 04).
 *
 * Every resolver resolves the tenant via `requireTailor`; the model scopes by tailorId and
 * validates customer/measurement ownership. No QC gate — status advances one step at a
 * time (or to an explicit target) and each change is logged to the activity timeline.
 */
import { GraphQLError } from 'graphql';
import StitchdOrderModel from '../../modules/stitchd/stitchdOrder.model.js';
import { requireTailor, requirePermission } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

const FILTER_MAP = { ALL: 'ALL', ACTIVE: 'ACTIVE', NEW: 'NEW', IN_PROGRESS: 'IN_PROGRESS', READY: 'READY', OVERDUE: 'OVERDUE' };
const SORT_MAP = { DUE: 'DUE', CREATED: 'CREATED', CUSTOMER: 'CUSTOMER' };

function wrap(error, msg) {
  if (error instanceof GraphQLError) return error;
  logger.error(`${msg}:`, error);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdOrderResolvers = {
  Query: {
    stitchdOrders: async (_p, args, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdOrderModel.list(tailorId, {
          filter: FILTER_MAP[args.filter] || 'ALL',
          sort: SORT_MAP[args.sort] || 'DUE',
        });
      } catch (e) { throw wrap(e, 'Could not load orders'); }
    },

    stitchdOrdersByDate: async (_p, { start, end }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdOrderModel.byDateRange(tailorId, start, end);
      } catch (e) { throw wrap(e, 'Could not load the calendar'); }
    },

    stitchdOrder: async (_p, { id }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdOrderModel.findById(tailorId, id);
      } catch (e) { throw wrap(e, 'Could not load that order'); }
    },
  },

  Mutation: {
    createStitchdOrder: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      if (!input?.customerId) {
        throw new GraphQLError('A customer is required.', { extensions: { code: 'BAD_USER_INPUT' } });
      }
      try {
        const order = await StitchdOrderModel.create(tailorId, input);
        if (!order) throw new GraphQLError('Could not create the order.', { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
        return order;
      } catch (e) { throw wrap(e, 'Could not create the order'); }
    },

    advanceStitchdOrderStatus: async (_p, { id, toStatus, completionPhoto, note }, context) => {
      const { tailorId } = await requirePermission(context, 'orders:write');
      try {
        return await StitchdOrderModel.advanceStatus(tailorId, id, toStatus || null, { completionPhoto, note });
      } catch (e) { throw wrap(e, 'Could not update the order status'); }
    },

    updateStitchdOrder: async (_p, { id, input }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdOrderModel.update(tailorId, id, input || {});
      } catch (e) { throw wrap(e, 'Could not update the order'); }
    },

    deleteStitchdOrder: async (_p, { id }, context) => {
      const { tailorId } = await requirePermission(context, 'orders:delete');
      try {
        return await StitchdOrderModel.remove(tailorId, id);
      } catch (e) { throw wrap(e, 'Could not delete the order'); }
    },

    updateStitchdMaterialsChecklist: async (_p, { id, materials }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdOrderModel.updateMaterials(tailorId, id, materials);
      } catch (e) { throw wrap(e, 'Could not update materials'); }
    },

    addStitchdOrderPhoto: async (_p, { id, photo }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdOrderModel.addPhoto(tailorId, id, photo);
      } catch (e) { throw wrap(e, 'Could not add the photo'); }
    },

    addStitchdOrderVoiceNote: async (_p, { id, voiceNote }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdOrderModel.addVoiceNote(tailorId, id, voiceNote);
      } catch (e) { throw wrap(e, 'Could not add the voice note'); }
    },
  },
};

export default stitchdOrderResolvers;
