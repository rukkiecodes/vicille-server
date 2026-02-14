import { ValidationError } from '../core/errors/index.js';

/**
 * Create validation middleware from Joi schema
 */
export const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const dataToValidate = req[property];

    const { error, value } = schema.validate(dataToValidate, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map((detail) => ({
        field: detail.path.join('.'),
        message: detail.message.replace(/['"]/g, ''),
      }));

      return next(new ValidationError('Validation failed', errors));
    }

    // Replace request data with validated and sanitized data
    req[property] = value;
    next();
  };
};

/**
 * Validate query parameters
 */
export const validateQuery = (schema) => validate(schema, 'query');

/**
 * Validate URL parameters
 */
export const validateParams = (schema) => validate(schema, 'params');

/**
 * Validate request body
 */
export const validateBody = (schema) => validate(schema, 'body');

/**
 * Validate GraphQL input
 */
export const validateGraphQLInput = (schema, input) => {
  const { error, value } = schema.validate(input, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const errors = error.details.map((detail) => ({
      field: detail.path.join('.'),
      message: detail.message.replace(/['"]/g, ''),
    }));

    throw new ValidationError('Validation failed', errors);
  }

  return value;
};

export default {
  validate,
  validateQuery,
  validateParams,
  validateBody,
  validateGraphQLInput,
};
