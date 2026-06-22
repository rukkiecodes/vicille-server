/**
 * Scheduled-job endpoints (batch 10). Hit by Vercel Cron (UTC) — see vercel.json `crons`.
 * Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`; we also accept the internal
 * service key so the job can be triggered manually. Kept OUT of the `/internal` router so it
 * is not gated by that router's x-service-key-only guard.
 */
import { Router } from 'express';
import StitchdPayoutModel from '../modules/stitchd/stitchdPayout.model.js';
import logger from '../core/logger/index.js';

const router = Router();

router.use((req, res, next) => {
  const cronSecret = String(process.env.CRON_SECRET || '').trim();
  const serviceKey = String(process.env.INTERNAL_SERVICE_KEY || '').trim();
  const auth = String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '').trim();
  const svc = String(req.headers['x-service-key'] || '').trim();

  const okCron = cronSecret && auth === cronSecret;
  const okSvc = serviceKey && svc === serviceKey;
  if (!okCron && !okSvc) return res.status(401).json({ error: 'Unauthorized' });
  next();
});

// Weekly settlement run. GET (Vercel cron) or POST (manual).
router.all('/stitchd-payouts', async (_req, res) => {
  try {
    const results = await StitchdPayoutModel.runSettlement();
    const settled = results.filter((r) => r.status === 'processing').length;
    logger.info('[cron] stitchd payouts run', { tenants: results.length, settled });
    res.status(200).json({ ok: true, tenants: results.length, settled, results });
  } catch (err) {
    logger.error('[cron] stitchd payouts error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
