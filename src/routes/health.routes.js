import { Router } from 'express';
import { isRedisConnected } from '../infrastructure/database/redis.js';

const router = Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const redisHealthy = isRedisConnected();
  const healthcheck = {
    status: redisHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redisHealthy ? 'connected' : 'disconnected',
  };

  const status = redisHealthy ? 200 : 503;

  res.status(status).json(healthcheck);
});

/**
 * Ready check endpoint (for Kubernetes)
 */
router.get('/ready', (req, res) => {
  if (isRedisConnected()) {
    res.status(200).json({ status: 'ready' });
  } else {
    res.status(503).json({ status: 'not ready', reason: 'Database not connected' });
  }
});

/**
 * Live check endpoint (for Kubernetes)
 */
router.get('/live', (req, res) => {
  res.status(200).json({ status: 'alive' });
});

export default router;
