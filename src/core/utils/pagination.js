import { LIMITS } from '../constants/limits.js';

/**
 * Parse pagination parameters from input
 */
export const parsePaginationParams = (params = {}) => {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(
    LIMITS.MAX_PAGE_LIMIT,
    Math.max(1, parseInt(params.limit, 10) || LIMITS.DEFAULT_PAGE_LIMIT)
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

/**
 * Create pagination result object
 */
export const createPaginationResult = (data, total, params) => {
  const { page, limit } = params;
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage,
    },
  };
};

/**
 * Create cursor-based pagination result
 */
export const createCursorPaginationResult = (data, limit, cursorField = '_id') => {
  const hasNextPage = data.length > limit;
  const items = hasNextPage ? data.slice(0, -1) : data;
  const endCursor = items.length > 0 ? items[items.length - 1][cursorField].toString() : null;

  return {
    edges: items.map((item) => ({
      cursor: item[cursorField].toString(),
      node: item,
    })),
    pageInfo: {
      hasNextPage,
      endCursor,
    },
  };
};

/**
 * Parse sort parameters
 */
export const parseSortParams = (sortInput, allowedFields = []) => {
  if (!sortInput) {
    return { createdAt: -1 }; // Default sort
  }

  const sort = {};

  if (typeof sortInput === 'string') {
    // Handle string format: "field:asc" or "-field"
    const [field, order] = sortInput.includes(':')
      ? sortInput.split(':')
      : [sortInput.replace('-', ''), sortInput.startsWith('-') ? 'desc' : 'asc'];

    if (allowedFields.length === 0 || allowedFields.includes(field)) {
      sort[field] = order === 'desc' ? -1 : 1;
    }
  } else if (typeof sortInput === 'object') {
    // Handle object format: { field: "asc" | "desc" | 1 | -1 }
    for (const [field, order] of Object.entries(sortInput)) {
      if (allowedFields.length === 0 || allowedFields.includes(field)) {
        sort[field] = order === 'desc' || order === -1 ? -1 : 1;
      }
    }
  }

  return Object.keys(sort).length > 0 ? sort : { createdAt: -1 };
};

/**
 * Build MongoDB filter from search params
 */
export const buildSearchFilter = (searchTerm, searchFields) => {
  if (!searchTerm || !searchFields || searchFields.length === 0) {
    return {};
  }

  const searchRegex = new RegExp(searchTerm, 'i');

  return {
    $or: searchFields.map((field) => ({ [field]: searchRegex })),
  };
};

export default {
  parsePaginationParams,
  createPaginationResult,
  createCursorPaginationResult,
  parseSortParams,
  buildSearchFilter,
};
