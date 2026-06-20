-- Migration 052: Stitchd offline-sync support + analytics + beta feedback (batch 08)
--
-- Beta-hardening foundation (spec §9/§10/§11). Three additive pieces:
--   1. Tombstones — `deleted_at` on the editable/deletable entities (customers, orders) so an
--      offline delete propagates to other devices via the delta-pull instead of silently
--      reappearing. Reads filter `deleted_at IS NULL`; the sync pull returns tombstones.
--   2. Analytics — `stitchd_analytics_events`: the activation funnel + engagement events
--      (signup → first customer → … → first payment, plus ai_used / whatsapp_sent). Kept in
--      Supabase (self-hosted) rather than a third-party vendor. PII stays on-device; only the
--      event name + non-PII props are sent.
--   3. Feedback — `stitchd_feedback`: the in-app beta feedback form (message + optional
--      screenshot URL + screen context).
--
-- All editable tables already carry `updated_at` (039/048/049/050) and the offline-write
-- tables already have idempotency keys (payments/messages: client_uuid unique; customers/
-- orders/measurements: client-provided id PK), so no idempotency backfill is needed here.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–07 (isolation via the
-- requireTailor guard + tailor_id scoping in every model method).

-- ── 1. Tombstones ──────────────────────────────────────────────────────────────
ALTER TABLE stitchd_customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE stitchd_orders    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Delta-pull scans by updated_at; partial-friendly composite indexes for the cursor query.
CREATE INDEX IF NOT EXISTS idx_stitchd_customers_tailor_updated
  ON stitchd_customers (tailor_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_stitchd_orders_tailor_updated
  ON stitchd_orders (tailor_id, updated_at);

-- ── 2. Analytics events ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_analytics_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id  UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  event      TEXT NOT NULL,                       -- e.g. 'first_customer_created', 'ai_used'
  props      JSONB NOT NULL DEFAULT '{}'::jsonb,  -- non-PII context only
  client_ts  TIMESTAMPTZ,                         -- device time the event happened
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stitchd_analytics_tailor_event
  ON stitchd_analytics_events (tailor_id, event, created_at);

-- ── 3. Beta feedback ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_feedback (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id      UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  message        TEXT NOT NULL,
  screenshot_url TEXT,
  context        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { screen, appVersion, platform }
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stitchd_feedback_tailor
  ON stitchd_feedback (tailor_id, created_at DESC);
