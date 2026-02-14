import logger from '../core/logger/index.js';
import { AppError } from '../core/errors/index.js';
import config from '../config/index.js';

/**
 * Handle 404 errors
 */
export const notFoundHandler = (req, res, next) => {
  const error = new AppError(`Route ${req.originalUrl} not found`, 404, 'NOT_FOUND');
  next(error);
};

/**
 * Global error handler
 */
export const errorHandler = (err, req, res, _next) => {
  let error = err;

  // Log error
  if (error.isOperational) {
    logger.warn(`Operational error: ${error.message}`, {
      code: error.code,
      statusCode: error.statusCode,
      path: req.path,
      method: req.method,
    });
  } else {
    logger.error('Unexpected error:', {
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
    });
  }

  // Handle validation errors
  if (error.name === 'ValidationError') {
    const errors = error.errors ? Object.values(error.errors).map((e) => ({
      field: e.path || e.field,
      message: e.message,
    })) : [{ message: error.message }];
    error = new AppError('Validation failed', 400, 'VALIDATION_ERROR');
    error.errors = errors;
  }

  // Handle Redis connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
    error = new AppError('Database connection failed', 503, 'DATABASE_ERROR');
  }

  // Handle Redis command errors
  if (error.name === 'ReplyError') {
    error = new AppError('Database operation failed', 500, 'DATABASE_ERROR');
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    error = new AppError('Invalid token', 401, 'INVALID_TOKEN');
  }

  if (error.name === 'TokenExpiredError') {
    error = new AppError('Token has expired', 401, 'TOKEN_EXPIRED');
  }

  // Default to 500 if no status code
  const statusCode = error.statusCode || 500;
  const code = error.code || 'INTERNAL_ERROR';

  // Send response
  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: error.isOperational ? error.message : 'An unexpected error occurred',
      ...(error.errors && { errors: error.errors }),
      ...(config.isDev && !error.isOperational && { stack: error.stack }),
    },
  });
};

export default { notFoundHandler, errorHandler };
