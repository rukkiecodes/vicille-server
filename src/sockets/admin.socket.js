import logger from '../core/logger/index.js';

/**
 * Admin namespace (/admin) — real-time event stream for admins
 */
export function initAdminSocket(adminNs) {
  adminNs.on('connection', (socket) => {
    const adminId = socket.data.userId;
    logger.info(`Admin socket connected: ${adminId} (${socket.id})`);

    socket.join('admins');

    socket.on('disconnect', (reason) => {
      logger.info(`Admin socket disconnected: ${adminId} — ${reason}`);
    });
  });
}

/**
 * Emit helpers for admin namespace — broadcast to all connected admins
 */
export const AdminEmitter = {
  newOrder(adminNs, payload) {
    adminNs.to('admins').emit('order:new', payload);
  },
  orderUpdate(adminNs, payload) {
    adminNs.to('admins').emit('order:updated', payload);
  },
  jobFlagged(adminNs, payload) {
    adminNs.to('admins').emit('job:flagged', payload);
  },
  paymentReceived(adminNs, payload) {
    adminNs.to('admins').emit('payment:received', payload);
  },
  lowStock(adminNs, payload) {
    adminNs.to('admins').emit('inventory:low_stock', payload);
  },
  tailorJoined(adminNs, payload) {
    adminNs.to('admins').emit('tailor:joined', payload);
  },
  specialRequest(adminNs, payload) {
    adminNs.to('admins').emit('special_request:new', payload);
  },
};
