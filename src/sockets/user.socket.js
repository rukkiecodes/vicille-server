import logger from '../core/logger/index.js';

/**
 * User namespace (/user) — real-time events for clients
 */
export function initUserSocket(userNs) {
  userNs.on('connection', (socket) => {
    const userId = socket.data.userId;
    logger.info(`User socket connected: ${userId} (${socket.id})`);

    // Auto-join personal room for targeted events
    socket.join(`user:${userId}`);

    // Subscribe to a specific order's updates
    socket.on('subscribe:order', (orderId) => {
      if (typeof orderId !== 'string') return;
      socket.join(`order:${orderId}`);
      logger.debug(`User ${userId} subscribed to order ${orderId}`);
    });

    socket.on('unsubscribe:order', (orderId) => {
      if (typeof orderId !== 'string') return;
      socket.leave(`order:${orderId}`);
    });

    socket.on('disconnect', (reason) => {
      logger.info(`User socket disconnected: ${userId} — ${reason}`);
    });
  });
}

/**
 * Emit helpers for user namespace
 */
export const UserEmitter = {
  orderUpdate(userNs, orderId, payload) {
    userNs.to(`order:${orderId}`).emit('order:updated', payload);
  },
  notification(userNs, userId, payload) {
    userNs.to(`user:${userId}`).emit('notification', payload);
  },
  jobUpdate(userNs, userId, payload) {
    userNs.to(`user:${userId}`).emit('job:updated', payload);
  },
};
