import { Router } from 'express';
import healthRoutes    from './health.routes.js';
import internalRoutes  from './internal.routes.js';
import cronRoutes      from './cron.routes.js';
import affiliateRoutes from '../modules/affiliates/affiliate.routes.js';

const router = Router();

// Health check routes
router.use('/', healthRoutes);

// Scheduled jobs (Vercel cron) — own auth (CRON_SECRET or service key)
router.use('/cron', cronRoutes);

// Internal service-to-service routes (from payments service)
router.use('/internal', internalRoutes);

// Affiliate REST API
router.use('/affiliates', affiliateRoutes);

export default router;
