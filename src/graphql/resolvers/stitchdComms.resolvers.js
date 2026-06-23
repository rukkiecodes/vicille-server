/**
 * Stitchd comms/invoice/currency resolvers (batch 21). Tenant via requireTailor; mutating actions
 * use requirePermission (batch 16). WA send needs messages:send; invoices need settings/billing-ish
 * permission (orders:write as the closest existing grant for staff who manage money docs).
 */
import { GraphQLError } from 'graphql';
import StitchdWaModel from '../../modules/stitchd/stitchdWa.model.js';
import StitchdInvoiceModel from '../../modules/stitchd/stitchdInvoice.model.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';
import { requireTailor, requirePermission } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

const SUPPORTED_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR', 'XOF', 'CAD'];

function wrap(e, msg) {
  if (e instanceof GraphQLError) return e;
  logger.error(`${msg}:`, e);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdCommsResolvers = {
  Query: {
    stitchdWaTemplates: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdWaModel.listTemplates(tailorId); } catch (e) { throw wrap(e, 'Could not load templates'); }
    },
    stitchdCustomerInvoices: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdInvoiceModel.list(tailorId); } catch (e) { throw wrap(e, 'Could not load invoices'); }
    },
    stitchdCurrency: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { const p = await StitchdTailorProfileModel.findByTailorId(tailorId); return p?.currency || 'NGN'; } catch (e) { throw wrap(e, 'Could not load currency'); }
    },
  },

  Mutation: {
    sendStitchdWaTemplate: async (_p, { customerId, key, params }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'messages:send');
      try { return await StitchdWaModel.sendTemplate(tailorId, customerId, key, params || {}); } catch (e) { throw wrap(e, 'Could not send the message'); }
    },
    setStitchdWaOptIn: async (_p, { customerId, enabled }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'customers:write');
      try { return await StitchdWaModel.setWaOptIn(tailorId, customerId, enabled); } catch (e) { throw wrap(e, 'Could not update opt-in'); }
    },
    setStitchdCurrency: async (_p, { code }, ctx) => {
      const tailorId = requireTailor(ctx);
      const cur = String(code || '').toUpperCase();
      if (!SUPPORTED_CURRENCIES.includes(cur)) throw new GraphQLError('Unsupported currency.', { extensions: { code: 'BAD_USER_INPUT' } });
      try { await StitchdTailorProfileModel.update(tailorId, { currency: cur }); return cur; } catch (e) { throw wrap(e, 'Could not set the currency'); }
    },

    createStitchdCustomerInvoice: async (_p, { input }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdInvoiceModel.create(tailorId, input); } catch (e) { throw wrap(e, 'Could not create the invoice'); }
    },
    issueStitchdCustomerInvoice: async (_p, { id }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdInvoiceModel.issue(tailorId, id); } catch (e) { throw wrap(e, 'Could not issue the invoice'); }
    },
    markStitchdCustomerInvoicePaid: async (_p, { id }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'payments:collect');
      try { return await StitchdInvoiceModel.setStatus(tailorId, id, 'paid'); } catch (e) { throw wrap(e, 'Could not update the invoice'); }
    },
    voidStitchdCustomerInvoice: async (_p, { id }, ctx) => {
      const { tailorId } = await requirePermission(ctx, 'orders:write');
      try { return await StitchdInvoiceModel.setStatus(tailorId, id, 'void'); } catch (e) { throw wrap(e, 'Could not void the invoice'); }
    },

    requestStitchdTaxExport: async (_p, { from, to }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdInvoiceModel.taxExportCsv(tailorId, { from, to }); } catch (e) { throw wrap(e, 'Could not generate the export'); }
    },
  },
};

export default stitchdCommsResolvers;
