import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import { AuthError, TokenExpiredError, InvalidTokenError } from '../core/errors/index.js';
import logger from '../core/logger/index.js';

/**
 * Extract token from request
 */
const extractToken = (req) => {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check query parameter (for WebSocket connections)
  if (req.query && req.query.token) {
    return req.query.token;
  }

  return null;
};

/**
 * Verify JWT token and attach user to request
 */
export const authenticate = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      throw new AuthError('Authentication required');
    }

    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: 'vicelle-api',
      audience: 'vicelle-app',
    });

    // Attach user info to request
    req.user = {
      id: decoded.sub,
      role: decoded.role,
      email: decoded.email,
      type: decoded.type, // 'user', 'tailor', or 'admin'
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new TokenExpiredError());
    }
    if (error.name === 'JsonWebTokenError') {
      return next(new InvalidTokenError());
    }
    next(error);
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: 'vicelle-api',
      audience: 'vicelle-app',
    });

    req.user = {
      id: decoded.sub,
      role: decoded.role,
      email: decoded.email,
      type: decoded.type,
    };

    next();
  } catch (error) {
    // Log but don't fail
    logger.debug('Optional auth failed:', error.message);
    next();
  }
};

/**
 * Generate access token
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(
    {
      sub: payload.id,
      email: payload.email,
      role: payload.role,
      type: payload.type,
    },
    config.jwt.secret,
    {
      expiresIn: config.jwt.expiresIn,
      issuer: 'vicelle-api',
      audience: 'vicelle-app',
    }
  );
};

/**
 * Generate refresh token
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(
    {
      sub: payload.id,
      type: payload.type,
    },
    config.jwt.refreshSecret,
    {
      expiresIn: config.jwt.refreshExpiresIn,
      issuer: 'vicelle-api',
      audience: 'vicelle-app',
    }
  );
};

/**
 * Verify refresh token
 */
export const verifyRefreshToken = (token) => {
  return jwt.verify(token, config.jwt.refreshSecret, {
    issuer: 'vicelle-api',
    audience: 'vicelle-app',
  });
};

export default {
  authenticate,
  optionalAuth,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
};
