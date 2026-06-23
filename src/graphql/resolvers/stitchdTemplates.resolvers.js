/**
 * Stitchd templates / bulk / advanced-AI resolvers (batch 19). Tenant via requireTailor;
 * mutating actions use requirePermission (batch 16). AI calls are metered in the model.
 */
import { GraphQLError } from 'graphql';
import StitchdTemplateModel from '../../modules/stitchd/stitchdTemplate.model.js';
import StitchdOrderModel from '../../modules/stitchd/stitchdOrder.model.js';
import StitchdAdvancedAiModel from '../../modules/stitchd/stitchdAdvancedAi.model.js';
import { requireTailor, requirePermission } from '../stitchd.guard.js';
import AuditModel from '../../modules/audit/audit.model.js';
import logger from '../../core/logger/index.js';

function wrap(e, msg) {
  if (e instanceof GraphQLError) return e;
  logger.error(`${msg}:`, e);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdTemplatesResolvers = {
  Query: {
    stitchdOrderTemplates: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdTemplateModel.listOrderTemplates(tailorId); } catch (e) { throw wrap(e, 'Could not load templates'); }
    },
    stitchdBodyTypeTemplates: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdTemplateModel.listBodyTypeTemplates(tailorId); } catch (e) { throw wrap(e, 'Could not load templates'); }
    },
    stitchdTagSuggestions: async (_p, { customerId }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAdvancedAiModel.listTagSuggestions(tailorId, customerId); } catch (e) { throw wrap(e, 'Could not load suggestions'); }
    },
  },

  Mutation: {
    // Order templates
    createStitchdOrderTemplate: async (_p, { input }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdTemplateModel.createOrderTemplate(tailorId, input); } catch (e) { throw wrap(e, 'Could not save the template'); }
    },
    updateStitchdOrderTemplate: async (_p, { id, input }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdTemplateModel.updateOrderTemplate(tailorId, id, input); } catch (e) { throw wrap(e, 'Could not update the template'); }
    },
    deleteStitchdOrderTemplate: async (_p, { id }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdTemplateModel.deleteOrderTemplate(tailorId, id); } catch (e) { throw wrap(e, 'Could not delete the template'); }
    },
    createStitchdOrderFromTemplate: async (_p, { templateId, customerId }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdTemplateModel.createOrderFromTemplate(tailorId, templateId, customerId); } catch (e) { throw wrap(e, 'Could not create the order'); }
    },

    // Body-type templates
    createStitchdBodyTypeTemplate: async (_p, { input }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'measurements:write');
      try { return await StitchdTemplateModel.createBodyTypeTemplate(tailorId, input); } catch (e) { throw wrap(e, 'Could not save the template'); }
    },
    deleteStitchdBodyTypeTemplate: async (_p, { id }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'measurements:write');
      try { return await StitchdTemplateModel.deleteBodyTypeTemplate(tailorId, id); } catch (e) { throw wrap(e, 'Could not delete the template'); }
    },
    createStitchdMeasurementSetFromBodyType: async (_p, { templateId, customerId }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'measurements:write');
      try { return await StitchdTemplateModel.createMeasurementSetFromBodyType(tailorId, templateId, customerId); } catch (e) { throw wrap(e, 'Could not create the measurement set'); }
    },

    // Bulk
    bulkAdvanceStitchdOrderStatus: async (_p, { orderIds, toStatus }, ctx) => {
      const actor = await requirePermission(ctx, 'orders:write');
      try {
        const results = await StitchdOrderModel.bulkAdvance(actor.tailorId, orderIds, toStatus || null);
        AuditModel.logEvent({ event_type: 'order.bulk_advance', event_category: 'stitchd_order', actor_id: actor.memberId || actor.tailorId, target_type: 'stitchd_order', target: JSON.stringify({ count: results.length, toStatus: toStatus || 'next' }) }).catch(() => {});
        return results;
      } catch (e) { throw wrap(e, 'Could not update the orders'); }
    },

    // Advanced AI
    validateStitchdMeasurementSet: async (_p, { setId, fields, unit, useAi }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAdvancedAiModel.validateMeasurementSet(tailorId, { setId, fields, unit, useAi: !!useAi }); } catch (e) { throw wrap(e, 'Could not validate'); }
    },
    suggestStitchdCustomerTags: async (_p, { customerId, useAi }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'ai:use');
      try { return await StitchdAdvancedAiModel.suggestCustomerTags(tailorId, customerId, { useAi: useAi !== false }); } catch (e) { throw wrap(e, 'Could not suggest tags'); }
    },
    acceptStitchdTagSuggestion: async (_p, { id }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'customers:write');
      try { return await StitchdAdvancedAiModel.acceptTagSuggestion(tailorId, id); } catch (e) { throw wrap(e, 'Could not accept the tag'); }
    },
    dismissStitchdTagSuggestion: async (_p, { id }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAdvancedAiModel.dismissTagSuggestion(tailorId, id); } catch (e) { throw wrap(e, 'Could not dismiss the tag'); }
    },
    generateStitchdSocialPost: async (_p, { input }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'ai:use');
      try { return await StitchdAdvancedAiModel.generateSocialPost(tailorId, input || {}); } catch (e) { throw wrap(e, 'Could not generate the post'); }
    },
  },
};

export default stitchdTemplatesResolvers;
