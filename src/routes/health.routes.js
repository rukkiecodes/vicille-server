import { Router } from 'express';
import { isRedisConnected } from '../infrastructure/database/redis.js';

const router = Router();

/**
 * Health check response generator
 */
const getHealthCheck = () => {
  const redisHealthy = isRedisConnected();
  return {
    status: redisHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redisHealthy ? 'connected' : 'disconnected',
  };
};

/**
 * Root endpoint - returns health status by default
 */
router.get('/', (req, res) => {
  const healthcheck = getHealthCheck();
  const status = healthcheck.status === 'ok' ? 200 : 503;
  res.status(status).json(healthcheck);
});

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  const healthcheck = getHealthCheck();
  const status = healthcheck.status === 'ok' ? 200 : 503;
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
