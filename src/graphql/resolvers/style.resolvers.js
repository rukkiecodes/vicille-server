import { GraphQLError } from 'graphql';
import StyleModel from '../../modules/styles/style.model.js';
import StyleSearchService from '../../services/styleSearch.service.js';
import logger from '../../core/logger/index.js';

const IMAGE_GENERATION_SERVICE_URL =
  process.env.IMAGE_GENERATION_SERVICE_URL || 'http://localhost:8090';

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

    webSearchStyles: async (_, { query, limit = 10 }) => {
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
      return StyleModel.create({ ...input, createdBy: context.user?.id ?? null });
    },

    updateStyle: async (_, { id, input }) => {
      return StyleModel.findByIdAndUpdate(id, input);
    },

    deleteStyle: async (_, { id }) => {
      await StyleModel.delete(id);
      return true;
    },

    saveSearchResultAsStyle: async (_, { input }, context) => {
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
        createdBy: context.user?.id ?? null,
      });
    },

    generateStyleTryOn: async (_, { input }) => {
      const url = `${IMAGE_GENERATION_SERVICE_URL}/images/try-on`;

      let response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(180_000), // 3 min for multi-image AI generation
        });
      } catch (err) {
        logger.error('generateStyleTryOn fetch error:', err);
        throw new GraphQLError('Image generation service is unreachable', {
          extensions: { code: 'BAD_GATEWAY' },
        });
      }

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        logger.error('generateStyleTryOn service error:', errBody);
        throw new GraphQLError(errBody.error || 'Image generation failed', {
          extensions: { code: 'BAD_GATEWAY', status: response.status },
        });
      }

      const data = await response.json();
      return {
        results: data.results ?? [],
        total: data.total ?? 0,
        styleTitle: data.styleTitle ?? input.styleTitle,
      };
    },
  },

  Style: {
    primaryImage: (style) => style.primaryImage || null,
  },
};

export default styleResolvers;
