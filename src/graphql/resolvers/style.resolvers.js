import { GraphQLError } from 'graphql';
import StyleModel from '../../modules/styles/style.model.js';
import StyleSearchService from '../../services/styleSearch.service.js';
import logger from '../../core/logger/index.js';

function requireAdmin(context) {
  if (!context.user || context.user.type !== 'admin') {
    throw new GraphQLError('Admin access required', {
      extensions: { code: 'FORBIDDEN' },
    });
  }
}

const styleResolvers = {
  Query: {
    style: async (_, { id }) => {
      return StyleModel.findById(id);
    },

    styleBySlug: async (_, { slug }) => {
      return StyleModel.findBySlug(slug);
    },

    styles: async (_, { category, isActive, limit = 20, offset = 0 }) => {
      return StyleModel.find(
        { category, ...(isActive !== undefined && { isActive }) },
        { limit, offset }
      );
    },

    searchStyles: async (_, { query, limit = 20 }) => {
      return StyleModel.search(query);
    },

    webSearchStyles: async (_, { query, limit = 10 }, context) => {
      try {
        return StyleSearchService.searchFashionStyles(query, limit);
      } catch (error) {
        logger.error('webSearchStyles error:', error);
        throw new GraphQLError(error.message || 'Style search failed', {
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        });
      }
    },
  },

  Mutation: {
    createStyle: async (_, { input }, context) => {
      requireAdmin(context);
      return StyleModel.create({ ...input, createdBy: context.user.id });
    },

    updateStyle: async (_, { id, input }, context) => {
      requireAdmin(context);
      return StyleModel.findByIdAndUpdate(id, input);
    },

    deleteStyle: async (_, { id }, context) => {
      requireAdmin(context);
      await StyleModel.delete(id);
      return true;
    },

    saveSearchResultAsStyle: async (_, { input }, context) => {
      requireAdmin(context);
      const { imageUrl, thumbnail, sourceUrl, searchQuery, ...rest } = input;
      return StyleModel.create({
        ...rest,
        source: 'search',
        searchQuery: searchQuery || null,
        images: [{
          url: imageUrl,
          thumbnail: thumbnail || imageUrl,
          sourceUrl: sourceUrl || null,
          isPrimary: true,
        }],
        createdBy: context.user.id,
      });
    },
  },

  Style: {
    primaryImage: (style) => style.primaryImage || null,
  },
};

export default styleResolvers;
