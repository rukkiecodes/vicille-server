import { GraphQLError } from 'graphql';
import StyleModel from '../../modules/styles/style.model.js';
import StyleSearchService from '../../services/styleSearch.service.js';
import logger from '../../core/logger/index.js';
import { requireAuth } from '../helpers.js';
import { getRedisClient } from '../../infrastructure/database/redis.js';

const IMAGE_GENERATION_SERVICE_URL =
  process.env.IMAGE_GENERATION_SERVICE_URL || 'http://localhost:8090';
const TRYON_COOLDOWN_SECONDS = 70;
const TRYON_COOLDOWN_KEY_PREFIX = 'tryon:cooldown:user:';

// Fallback for environments where Redis is unavailable.
const inMemoryTryOnCooldown = new Map();

async function acquireTryOnCooldown(userId) {
  const now = Date.now();

  try {
    const redis = getRedisClient();
    const key = `${TRYON_COOLDOWN_KEY_PREFIX}${userId}`;
    const wasSet = await redis.set(key, `${now}`, { EX: TRYON_COOLDOWN_SECONDS, NX: true });

    if (wasSet === 'OK') {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const ttl = await redis.ttl(key);
    return {
      allowed: false,
      retryAfterSeconds: ttl > 0 ? ttl : TRYON_COOLDOWN_SECONDS,
    };
  } catch {
    const expiresAt = inMemoryTryOnCooldown.get(userId) || 0;
    if (expiresAt > now) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAt - now) / 1000)),
      };
    }

    inMemoryTryOnCooldown.set(userId, now + (TRYON_COOLDOWN_SECONDS * 1000));
    return { allowed: true, retryAfterSeconds: 0 };
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

    generateStyleTryOn: async (_, { input }, context) => {
      const authUser = requireAuth(context);
      const cooldown = await acquireTryOnCooldown(authUser.id);
      if (!cooldown.allowed) {
        throw new GraphQLError(
          `Please wait ${cooldown.retryAfterSeconds}s before trying on another style.`,
          {
            extensions: {
              code: 'TOO_MANY_REQUESTS',
              retryAfterSeconds: cooldown.retryAfterSeconds,
            },
          }
        );
      }

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
        const errText = `${errBody?.error || ''}`;
        const errCode = `${errBody?.code || ''}`;
        const normalizedErr = errText.toLowerCase();
        const isRateLimit = response.status === 429 || errText.includes('429') || normalizedErr.includes('quota exceeded') || normalizedErr.includes('rate limit');
        const isBillingLimit = response.status === 402 || errCode === 'billing_hard_limit_reached' || normalizedErr.includes('billing hard limit') || normalizedErr.includes('billing_hard_limit_reached') || normalizedErr.includes('billing limit');
        throw new GraphQLError(
          isBillingLimit
            ? 'Try-on is temporarily unavailable because image generation billing limit has been reached. Please contact support or try again later.'
            : isRateLimit
              ? 'Try-on is temporarily busy. Please wait about a minute and try again.'
              : (errBody.error || 'Image generation failed'),
          {
          extensions: {
            code: isBillingLimit ? 'PAYMENT_REQUIRED' : isRateLimit ? 'TOO_MANY_REQUESTS' : 'BAD_GATEWAY',
            status: response.status,
            upstreamCode: errCode || undefined,
          },
          }
        );
      }

      const data = await response.json();
      const results = Array.isArray(data.results) ? data.results : [];

      // If service returned successfully but produced no previews, surface the
      // first backend failure reason so the app shows an actionable error.
      if (results.length === 0) {
        const firstFailure = Array.isArray(data.failed) && data.failed.length > 0
          ? data.failed[0]?.error
          : null;
        const firstFailureCode = Array.isArray(data.failed) && data.failed.length > 0
          ? data.failed[0]?.code
          : null;
        const firstFailureStatus = Array.isArray(data.failed) && data.failed.length > 0
          ? data.failed[0]?.status
          : null;
        const failureText = `${firstFailure || ''}`;
        const normalizedFailure = failureText.toLowerCase();
        const isRateLimit = failureText.includes('429') || normalizedFailure.includes('quota exceeded') || normalizedFailure.includes('rate limit');
        const isBillingLimit = firstFailureStatus === 402 || firstFailureCode === 'billing_hard_limit_reached' || normalizedFailure.includes('billing hard limit') || normalizedFailure.includes('billing_hard_limit_reached') || normalizedFailure.includes('billing limit');
        throw new GraphQLError(
          isBillingLimit
            ? 'Try-on is temporarily unavailable because image generation billing limit has been reached. Please contact support or try again later.'
            : isRateLimit
              ? 'Try-on is temporarily busy. Please wait about a minute and try again.'
              : (firstFailure || 'Try-on did not return any preview images. Please try again.'),
          {
            extensions: {
              code: isBillingLimit ? 'PAYMENT_REQUIRED' : isRateLimit ? 'TOO_MANY_REQUESTS' : 'BAD_GATEWAY',
              upstreamCode: firstFailureCode || undefined,
            },
          }
        );
      }

      return {
        results,
        total: data.total ?? results.length,
        styleTitle: data.styleTitle ?? input.styleTitle,
      };
    },
  },

  Style: {
    primaryImage: (style) => style.primaryImage || null,
  },
};

export default styleResolvers;
