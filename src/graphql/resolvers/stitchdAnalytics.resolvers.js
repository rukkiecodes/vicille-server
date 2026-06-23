/**
 * Stitchd analytics resolvers (batch 14). Tenant resolved via `requireTailor`; the model
 * scopes every aggregate by tailorId — a tailor never sees another tenant's numbers.
 */
import { GraphQLError } from 'graphql';
import StitchdAnalyticsModel from '../../modules/stitchd/stitchdAnalytics.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

function wrap(error, msg) {
  if (error instanceof GraphQLError) return error;
  logger.error(`${msg}:`, error);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdAnalyticsResolvers = {
  Query: {
    stitchdMonthlyRevenue: async (_p, { months }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAnalyticsModel.monthlyRevenue(tailorId, months || 6); }
      catch (e) { throw wrap(e, 'Could not load revenue'); }
    },
    stitchdTopCustomers: async (_p, { limit }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAnalyticsModel.topCustomers(tailorId, limit || 10); }
      catch (e) { throw wrap(e, 'Could not load top customers'); }
    },
    stitchdBestSellingGarments: async (_p, { limit }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAnalyticsModel.bestSellingGarments(tailorId, limit || 8); }
      catch (e) { throw wrap(e, 'Could not load garment sales'); }
    },
    stitchdDormantCustomers: async (_p, { daysThreshold }, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdAnalyticsModel.dormantCustomers(tailorId, daysThreshold || 90); }
      catch (e) { throw wrap(e, 'Could not load dormant customers'); }
    },
    stitchdAnalyticsExport: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try {
        const csv = await StitchdAnalyticsModel.exportCsv(tailorId);
        const stamp = new Date().toISOString().slice(0, 10);
        return { filename: `stitchd-analytics-${stamp}.csv`, mimeType: 'text/csv', csv };
      } catch (e) { throw wrap(e, 'Could not export analytics'); }
    },
  },
};

export default stitchdAnalyticsResolvers;
