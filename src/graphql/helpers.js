import { GraphQLError } from 'graphql';

/**
 * Ensure the user is authenticated
 */
export const requireAuth = (context) => {
  if (!context.user) {
    throw new GraphQLError('Authentication required', {
      extensions: { code: 'UNAUTHENTICATED' },
    });
  }
  return context.user;
};

/**
 * Ensure the user has a specific role
 */
export const requireRole = (context, ...roles) => {
  const user = requireAuth(context);
  if (!roles.includes(user.type) && !roles.includes(user.role)) {
    throw new GraphQLError('Insufficient permissions', {
      extensions: { code: 'FORBIDDEN' },
    });
  }
  return user;
};

/**
 * Ensure the user is an admin
 */
export const requireAdmin = (context) => {
  return requireRole(context, 'admin');
};

/**
 * Ensure the user is a tailor
 */
export const requireTailor = (context) => {
  return requireRole(context, 'tailor');
};

/**
 * Build pagination response
 */
export const buildPaginatedResponse = (nodes, total, page = 1, limit = 20) => {
  const totalPages = Math.ceil(total / limit);
  return {
    nodes,
    pageInfo: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
};

/**
 * Parse entity to safe JSON format for GraphQL responses
 */
export const entityToJSON = (entity) => {
  if (!entity) {
    return null;
  }
  if (typeof entity.toSafeJSON === 'function') {
    return entity.toSafeJSON();
  }
  // Fallback: return entity with entityId as id
  return {
    ...entity,
    id: entity.entityId || entity.id,
  };
};

/**
 * Parse multiple entities
 */
export const entitiesToJSON = (entities) => {
  if (!entities || !Array.isArray(entities)) {
    return [];
  }
  return entities.map(entityToJSON).filter(Boolean);
};
