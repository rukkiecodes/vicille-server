-- Migration 059: Stitchd account lifecycle — data export & deletion takeout (batch 15)
--
-- Trust requirement (spec §2.5/§5.8): a tailor can export all their data and delete their
-- account with a data-takeout archive emailed first, then a grace window, then hard purge of
-- all stitchd_* rows for the tenant. Deletion is BLOCKED while a payout is pending (batch 10).
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–14.

CREATE TABLE IF NOT EXISTS stitchd_data_exports (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id    UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  scope        TEXT NOT NULL DEFAULT 'full' CHECK (scope IN ('full','customers','orders','payments')),
  format       TEXT NOT NULL DEFAULT 'csv' CHECK (format IN ('csv','zip')),
  status       TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('requested','completed','failed')),
  artifact_url TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_stitchd_data_exports_tailor
  ON stitchd_data_exports (tailor_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS stitchd_account_deletions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id          UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'requested'
                       CHECK (status IN ('requested','archived','purged','canceled')),
  requested_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  scheduled_purge_at TIMESTAMPTZ NOT NULL,
  archive_url        TEXT,
  archive_emailed_at TIMESTAMPTZ,
  canceled_at        TIMESTAMPTZ,
  purged_at          TIMESTAMPTZ
);
-- One active (requested/archived) deletion per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_account_deletion_active
  ON stitchd_account_deletions (tailor_id) WHERE status IN ('requested','archived');
CREATE INDEX IF NOT EXISTS idx_stitchd_account_deletions_purge
  ON stitchd_account_deletions (scheduled_purge_at) WHERE status IN ('requested','archived');
