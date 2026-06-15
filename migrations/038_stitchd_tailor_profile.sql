-- Migration 038: Stitchd tenant / tailor profile
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "Tailor (Tenant)": Stitchd tenant
-- fields live in a SEPARATE `stitchd_tailor_profile` table keyed to tailor_id, rather
-- than as columns on the shared hot `tailors` table. This keeps Stitchd-only columns
-- off Vicelle's hot path. A Stitchd tenant = a row in `tailors` (tailor_type='stitchd')
-- + a row in this table. The tenant id is `tailors.id`.
--
-- Idempotent: safe to re-run.

-- ── Allow the 'stitchd' tailor_type ────────────────────────────────────────────
-- Migration 037 added a CHECK constraint limiting tailor_type to ('vicelle','styleu').
-- Stitchd tailors need tailor_type='stitchd', so widen the constraint here. Drop the
-- old named constraint if present, then (re)add the widened one.
ALTER TABLE tailors DROP CONSTRAINT IF EXISTS tailors_tailor_type_check;
ALTER TABLE tailors
  ADD CONSTRAINT tailors_tailor_type_check
  CHECK (tailor_type IN ('vicelle', 'styleu', 'stitchd'));

-- ── Stitchd tenant profile ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_tailor_profile (
  tailor_id           UUID PRIMARY KEY REFERENCES tailors(id) ON DELETE CASCADE,
  business_name       TEXT,
  owner_name          TEXT,
  location_city       TEXT,
  location_area       TEXT,
  specialties         TEXT[],
  logo_url            TEXT,
  owner_photo_url     TEXT,
  subscription_status TEXT NOT NULL DEFAULT 'trial',
  tier                TEXT NOT NULL DEFAULT 'starter',
  billing_cycle       TEXT,
  trial_ends_at       TIMESTAMPTZ,
  settings            JSONB NOT NULL DEFAULT '{}'::jsonb,
  app_origin          TEXT NOT NULL DEFAULT 'stitchd',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
