-- Migration 066: Public customer-portal abuse limiter (post-batch-21 hardening)
--
-- The portal (src/routes/portal.routes.js) is token-only and unauthenticated. Random 24-byte
-- tokens already prevent enumeration; this fixed-window counter caps ABUSE of the endpoints —
-- especially GET /portal/:token/pay, which triggers an external Paystack init. Works on Vercel
-- serverless (shared state lives in Postgres, not function memory).
--
-- One row per (action,key) bucket, e.g. 'pay:<ip>' / 'pay:<token>' / 'view:<ip>'. The window
-- self-resets inside a single atomic UPSERT (see StitchdPortalModel.checkRate). A daily cron
-- prunes stale rows.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–21.

CREATE TABLE IF NOT EXISTS stitchd_portal_rate (
  bucket       TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stitchd_portal_rate_window ON stitchd_portal_rate (window_start);
