/**
 * Stitchd payment resolvers (batch 05).
 *
 * Cash recording + money aggregates. Every resolver resolves the tenant via
 * `requireTailor`; the model scopes by tailorId and validates customer/order ownership.
 */
import { GraphQLError } from 'graphql';
import StitchdPaymentModel from '../../modules/stitchd/stitchdPayment.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

const SORT_MAP = { AMOUNT: 'AMOUNT', AGE: 'AGE' };

function wrap(error, msg) {
  if (error instanceof GraphQLError) return error;
  logger.error(`${msg}:`, error);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdPaymentResolvers = {
  Query: {
    stitchdOutstandingBalances: async (_p, { sort }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdPaymentModel.outstandingBalances(tailorId, SORT_MAP[sort] || 'AMOUNT');
      } catch (e) { throw wrap(e, 'Could not load outstanding balances'); }
    },

    stitchdCustomerPayments: async (_p, { customerId }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdPaymentModel.byCustomer(tailorId, customerId);
      } catch (e) { throw wrap(e, 'Could not load payments'); }
    },

    stitchdMoneyDashboard: async (_p, { weekStart }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdPaymentModel.moneyDashboard(tailorId, weekStart || null);
      } catch (e) { throw wrap(e, 'Could not load the money dashboard'); }
    },
  },

  Mutation: {
    recordStitchdCashPayment: async (_p, { input }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdPaymentModel.recordCash(tailorId, input);
      } catch (e) { throw wrap(e, 'Could not record the payment'); }
    },
  },
};

export default stitchdPaymentResolvers;
