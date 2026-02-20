import logger from '../core/logger/index.js';

/**
 * Tailor namespace (/tailor) — real-time events for tailors
 */
export function initTailorSocket(tailorNs) {
  tailorNs.on('connection', (socket) => {
    const tailorId = socket.data.userId;
    logger.info(`Tailor socket connected: ${tailorId} (${socket.id})`);

    // Auto-join personal room
    socket.join(`tailor:${tailorId}`);

    // Tailor marks themselves as online/offline
    socket.on('status:online', () => {
      tailorNs.emit('tailor:status', { tailorId, status: 'online' });
      logger.debug(`Tailor ${tailorId} is online`);
    });

    socket.on('status:offline', () => {
      tailorNs.emit('tailor:status', { tailorId, status: 'offline' });
    });

    socket.on('disconnect', (reason) => {
      logger.info(`Tailor socket disconnected: ${tailorId} — ${reason}`);
    });
  });
}

/**
 * Emit helpers for tailor namespace
 */
export const TailorEmitter = {
  jobAssigned(tailorNs, tailorId, payload) {
    tailorNs.to(`tailor:${tailorId}`).emit('job:assigned', payload);
  },
  jobUpdate(tailorNs, tailorId, payload) {
    tailorNs.to(`tailor:${tailorId}`).emit('job:updated', payload);
  },
  notification(tailorNs, tailorId, payload) {
    tailorNs.to(`tailor:${tailorId}`).emit('notification', payload);
  },
  payoutReady(tailorNs, tailorId, payload) {
    tailorNs.to(`tailor:${tailorId}`).emit('payout:ready', payload);
  },
};
