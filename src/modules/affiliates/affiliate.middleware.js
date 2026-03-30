import jwt from 'jsonwebtoken';
import config from '../../config/index.js';

const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
};

export const authenticateAffiliate = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required', code: 'UNAUTHENTICATED' });
  }

  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer:   'vicelle-api',
      audience: 'vicelle-app',
    });

    if (decoded.type !== 'affiliate') {
      return res.status(403).json({ success: false, message: 'Affiliate access required', code: 'FORBIDDEN' });
    }

    req.affiliate = {
      id:    decoded.sub,
      email: decoded.email,
      type:  'affiliate',
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
  }
};

export default { authenticateAffiliate };
