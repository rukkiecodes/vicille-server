import config from './index.js';

export const jwtConfig = {
  secret: config.jwt.secret,
  expiresIn: config.jwt.expiresIn,
  refreshSecret: config.jwt.refreshSecret,
  refreshExpiresIn: config.jwt.refreshExpiresIn,
  algorithm: 'HS256',
  issuer: 'vicelle-api',
  audience: 'vicelle-app',
};

export default jwtConfig;
