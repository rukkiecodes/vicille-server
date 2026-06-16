-- Migration 047: Stitchd AI usage metering  (batch 03)
--
-- Per doc 01 (Architecture & Multi-tenancy) §7: every AI call (Whisper transcription now,
-- design/fit/etc. later) records one usage row scoped to the tenant. A tailor's monthly
-- allowance is enforced by tier (starter|pro|enterprise) by counting rows in the current
-- billing period BEFORE the upstream call. `feature` lets later AI features (batch 07/12)
-- reuse this same table; `units` allows non-1 costs.
--
-- `period` is the calendar month bucket 'YYYY-MM' the usage counts against, so the cap
-- check is a cheap COUNT keyed by (tailor_id, period[, feature]).
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–02.

CREATE TABLE IF NOT EXISTS stitchd_ai_usage (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id  UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,                 -- 'transcription' | 'design' | 'fit' | …
  units      INT  NOT NULL DEFAULT 1,
  period     TEXT NOT NULL,                 -- 'YYYY-MM' billing bucket
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cap check: SUM(units) WHERE tailor_id = $1 AND period = $2 [AND feature = $3].
CREATE INDEX IF NOT EXISTS idx_stitchd_ai_usage_tailor_period
  ON stitchd_ai_usage (tailor_id, period, feature);
