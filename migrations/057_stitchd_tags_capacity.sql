-- Migration 057: Stitchd tags, capacity & availability, voice-note import (batch 13)
--
-- Layers P2 relationship/workload features on the P1 foundation:
--   • customer tags — make (customer_id, label) unique so a tag can't be added twice.
--   • availability — weekly_capacity (orders/week), working_hours JSON, auto_notify_status
--     opt-in on the tailor profile (doc 01 §2 settings).
--   • birthdays — functional index on (tailor_id, MM-DD of dob) for the daily birthday lookup.
--   • voice import reuses stitchd_messages (kind='voice', media_url already exist; the
--     transcript is stored in `body`), so no message-schema change is needed.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–12.

-- ── Customer tags: one of each label per customer ──────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_customer_tag_label
  ON stitchd_customer_tags (customer_id, label);

-- ── Tailor availability / capacity settings ────────────────────────────────────
ALTER TABLE stitchd_tailor_profile
  ADD COLUMN IF NOT EXISTS weekly_capacity    INTEGER,                       -- orders per week
  ADD COLUMN IF NOT EXISTS working_hours      JSONB,                         -- { mon:{open,close}, ... }
  ADD COLUMN IF NOT EXISTS auto_notify_status BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Birthday lookup: match today's MM-DD per tenant ────────────────────────────
CREATE INDEX IF NOT EXISTS idx_stitchd_customers_birthday
  ON stitchd_customers (tailor_id, (to_char(dob, 'MM-DD')))
  WHERE dob IS NOT NULL;
