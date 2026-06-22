/**
 * Stitchd customer resolvers (batch 02).
 *
 * Tenant-scoped customer book. Every resolver resolves the tenant via `requireTailor`
 * and passes that tailorId as the first argument to the model, which scopes every query
 * by it (doc 01 §3, layers 1 + 2). A tailor can never read or mutate another tailor's
 * customers.
 */
import { GraphQLError } from 'graphql';
import StitchdCustomerModel from '../../modules/stitchd/stitchdCustomer.model.js';
import StitchdTagModel from '../../modules/stitchd/stitchdTag.model.js';
import { requireTailor } from '../stitchd.guard.js';
import logger from '../../core/logger/index.js';

/** Map the GraphQL enum (UPPER) to the model's filter/sort keys (lower). */
const FILTER_MAP = { ALL: 'all', OWES: 'owes', RECENT: 'recent' };
const SORT_MAP = { RECENT: 'recent', AZ: 'az', ORDERS: 'orders', SPENT: 'spent' };

const stitchdCustomerResolvers = {
  Query: {
    stitchdCustomers: async (_parent, args, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdCustomerModel.list(tailorId, {
          search: args.search,
          filter: FILTER_MAP[args.filter] || 'all',
          sort: SORT_MAP[args.sort] || 'recent',
          page: args.page,
          pageSize: args.pageSize,
        });
      } catch (error) {
        logger.error('stitchdCustomers error:', error);
        throw new GraphQLError('Could not load customers. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    stitchdCustomer: async (_parent, { id }, context) => {
      const tailorId = requireTailor(context);
      try {
        return await StitchdCustomerModel.findById(tailorId, id);
      } catch (error) {
        logger.error('stitchdCustomer error:', error);
        throw new GraphQLError('Could not load that customer. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    stitchdTags: async (_p, _a, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdTagModel.distinctLabels(tailorId); }
      catch (e) { logger.error('stitchdTags error:', e); throw new GraphQLError('Could not load tags.', { extensions: { code: 'INTERNAL_SERVER_ERROR' } }); }
    },

    stitchdBirthdaysToday: async (_p, _a, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdTagModel.birthdaysToday(tailorId); }
      catch (e) { logger.error('stitchdBirthdaysToday error:', e); throw new GraphQLError('Could not load birthdays.', { extensions: { code: 'INTERNAL_SERVER_ERROR' } }); }
    },
  },

  // Field resolver: a customer's tags (batch 13). Modest per-tailor volume → simple per-row load.
  StitchdCustomer: {
    tags: async (parent, _a, context) => {
      const tailorId = requireTailor(context);
      if (!parent?.id) return [];
      try { return await StitchdTagModel.forCustomer(tailorId, parent.id); }
      catch { return []; }
    },
  },

  Mutation: {
    createStitchdCustomer: async (_parent, { input }, context) => {
      const tailorId = requireTailor(context);
      const name = (input?.name || '').trim();
      if (!name) {
        throw new GraphQLError('A name is required.', {
          extensions: { code: 'BAD_USER_INPUT' },
        });
      }
      try {
        const customer = await StitchdCustomerModel.create(tailorId, { ...input, name });
        if (!customer) {
          throw new GraphQLError('Could not save this customer. Please try again.', {
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          });
        }
        return customer;
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('createStitchdCustomer error:', error);
        throw new GraphQLError('Could not save this customer. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    updateStitchdCustomer: async (_parent, { id, input }, context) => {
      const tailorId = requireTailor(context);
      try {
        const updated = await StitchdCustomerModel.update(tailorId, id, input || {});
        if (!updated) {
          throw new GraphQLError('Customer not found.', {
            extensions: { code: 'NOT_FOUND' },
          });
        }
        return updated;
      } catch (error) {
        if (error instanceof GraphQLError) throw error;
        logger.error('updateStitchdCustomer error:', error);
        throw new GraphQLError('Could not update this customer. Please try again.', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },

    addStitchdCustomerTag: async (_p, { customerId, label, color }, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdTagModel.add(tailorId, customerId, label, color); }
      catch (e) { if (e instanceof GraphQLError) throw e; logger.error('addStitchdCustomerTag error:', e); throw new GraphQLError('Could not add the tag.', { extensions: { code: 'INTERNAL_SERVER_ERROR' } }); }
    },

    removeStitchdCustomerTag: async (_p, { id }, context) => {
      const tailorId = requireTailor(context);
      try { return await StitchdTagModel.remove(tailorId, id); }
      catch (e) { logger.error('removeStitchdCustomerTag error:', e); throw new GraphQLError('Could not remove the tag.', { extensions: { code: 'INTERNAL_SERVER_ERROR' } }); }
    },
  },
};

export default stitchdCustomerResolvers;
