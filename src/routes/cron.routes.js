/**
 * Scheduled-job endpoints (batch 10). Hit by Vercel Cron (UTC) — see vercel.json `crons`.
 * Vercel cron sends `Authorization: Bearer ${CRON_SECRET}`; we also accept the internal
 * service key so the job can be triggered manually. Kept OUT of the `/internal` router so it
 * is not gated by that router's x-service-key-only guard.
 */
import { Router } from 'express';
import StitchdPayoutModel from '../modules/stitchd/stitchdPayout.model.js';
import StitchdBillingModel from '../modules/stitchd/stitchdBilling.model.js';
import StitchdAccountModel from '../modules/stitchd/stitchdAccount.model.js';
import StitchdStyleUModel from '../modules/stitchd/stitchdStyleU.model.js';
import StitchdPortalModel from '../modules/stitchd/stitchdPortal.model.js';
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

// Daily billing sweep: expire trials past their end, suspend dunning accounts past grace.
router.all('/stitchd-billing', async (_req, res) => {
  try {
    const trials = await StitchdBillingModel.expireTrials();
    const dunning = await StitchdBillingModel.suspendAfterGrace();
    logger.info('[cron] stitchd billing sweep', { ...trials, ...dunning });
    res.status(200).json({ ok: true, ...trials, ...dunning });
  } catch (err) {
    logger.error('[cron] stitchd billing error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Daily account-deletion purge: hard-delete tenant data past the grace window (batch 15).
router.all('/stitchd-account-purge', async (_req, res) => {
  try {
    const results = await StitchdAccountModel.purgeDue();
    const purged = results.filter((r) => r.purged).length;
    logger.info('[cron] stitchd account purge', { candidates: results.length, purged });
    res.status(200).json({ ok: true, candidates: results.length, purged, results });
  } catch (err) {
    logger.error('[cron] stitchd account purge error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Expire unanswered Style-U offers past their SLA (batch 20).
router.all('/stitchd-styleu-expire', async (_req, res) => {
  try {
    const { expired } = await StitchdStyleUModel.expireOffers();
    logger.info('[cron] stitchd styleu expire', { expired });
    res.status(200).json({ ok: true, expired });
  } catch (err) {
    logger.error('[cron] stitchd styleu expire error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Prune stale portal rate-limiter rows (post-batch-21 hardening).
router.all('/stitchd-portal-rate-prune', async (_req, res) => {
  try {
    const { pruned } = await StitchdPortalModel.pruneRateLimits();
    logger.info('[cron] stitchd portal rate prune', { pruned });
    res.status(200).json({ ok: true, pruned });
  } catch (err) {
    logger.error('[cron] stitchd portal rate prune error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

export default router;
