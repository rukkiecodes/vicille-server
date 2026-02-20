import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../core/logger/index.js';
import { initUserSocket, UserEmitter }     from './user.socket.js';
import { initTailorSocket, TailorEmitter } from './tailor.socket.js';
import { initAdminSocket, AdminEmitter }   from './admin.socket.js';

/**
 * JWT auth middleware for socket namespaces.
 * Token is read from socket.handshake.auth.token or socket.handshake.query.token.
 */
function jwtSocketMiddleware(allowedTypes = []) {
  return (socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret, {
        issuer:   'vicelle-api',
        audience: 'vicelle-app',
      });

      if (allowedTypes.length && !allowedTypes.includes(decoded.type)) {
        return next(new Error(`Unauthorized: expected type ${allowedTypes.join(' or ')}`));
      }

      socket.data.userId   = decoded.sub;
      socket.data.userType = decoded.type;
      socket.data.role     = decoded.role;
      next();
    } catch (err) {
      logger.warn(`Socket auth failed: ${err.message}`);
      next(new Error('Invalid or expired token'));
    }
  };
}

let _io       = null;
let _userNs   = null;
let _tailorNs = null;
let _adminNs  = null;

/**
 * Initialize Socket.io from the HTTP server.
 * Called once in server.js: initializeSocket(httpServer)
 */
export function initializeSocket(httpServer) {
  _io = new SocketIOServer(httpServer, {
    cors: {
      origin:      config.cors?.origin || '*',
      methods:     ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── /user namespace ──────────────────────────────────────────────
  _userNs = _io.of('/user');
  _userNs.use(jwtSocketMiddleware(['user']));
  initUserSocket(_userNs);

  // ── /tailor namespace ────────────────────────────────────────────
  _tailorNs = _io.of('/tailor');
  _tailorNs.use(jwtSocketMiddleware(['tailor']));
  initTailorSocket(_tailorNs);

  // ── /admin namespace ─────────────────────────────────────────────
  _adminNs = _io.of('/admin');
  _adminNs.use(jwtSocketMiddleware(['admin']));
  initAdminSocket(_adminNs);

  logger.info('Socket.io namespaces initialized: /user, /tailor, /admin');

  return _io;
}

/** Access the io instance and namespace emitters from anywhere in the codebase */
export const Sockets = {
  get io()     { return _io; },
  get user()   { return _userNs; },
  get tailor() { return _tailorNs; },
  get admin()  { return _adminNs; },
  User:   UserEmitter,
  Tailor: TailorEmitter,
  Admin:  AdminEmitter,
};
