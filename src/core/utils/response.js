/**
 * Create a success response
 */
export const successResponse = (data, message = 'Success') => {
  return {
    success: true,
    message,
    data,
  };
};

/**
 * Create an error response
 */
export const errorResponse = (message, code = 'ERROR', errors = null) => {
  return {
    success: false,
    message,
    code,
    errors,
  };
};

/**
 * Create a paginated response
 */
export const paginatedResponse = (data, pagination, message = 'Success') => {
  return {
    success: true,
    message,
    data,
    pagination,
  };
};

/**
 * Format GraphQL error
 */
export const formatGraphQLError = (error) => {
  const { message, extensions } = error;

  return {
    message,
    code: extensions?.code || 'INTERNAL_ERROR',
    statusCode: extensions?.statusCode || 500,
    ...(extensions?.errors && { errors: extensions.errors }),
  };
};

/**
 * Create a GraphQL response wrapper
 */
export const graphqlResponse = (data, message = 'Success') => {
  return {
    success: true,
    message,
    ...data,
  };
};

export default {
  successResponse,
  errorResponse,
  paginatedResponse,
  formatGraphQLError,
  graphqlResponse,
};
