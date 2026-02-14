import { Router } from 'express';
import healthRoutes from './health.routes.js';
import webhookRoutes from './webhooks.routes.js';

const router = Router();

// Health check routes
router.use('/', healthRoutes);

// Webhook routes
router.use('/webhooks', webhookRoutes);

export default router;
