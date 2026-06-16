-- Migration 046: Stitchd measurement sets  (batch 03)
--
-- NOTE: migration 040 reserved this table as a no-op stub and was already APPLIED to the
-- live DB (recorded in schema_migrations). Editing 040 now would never reach environments
-- that already ran it, so the real table is created here under a fresh migration number.
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "MeasurementSet": versioned and
-- NEVER overwritten — a new set appends with its own date and an incremented `version`,
-- linking the one it superseded via `previous_version_id`, so history (genuinely useful
-- trade information, spec §4) is preserved. `fields` is JSONB keyed by the existing
-- `BodyMeasurements` vocabulary (neck, shoulder, chest, bust, waist, hips, sleeveLength,
-- …) but flexible so unusual garments can add keys. Tenant key is `tailor_id`.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–02 (no app.tailor_id
-- GUC yet; isolation via requireTailor guard + tailor_id scoping in the model).

CREATE TABLE IF NOT EXISTS stitchd_measurement_sets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id           UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id         UUID NOT NULL REFERENCES stitchd_customers(id) ON DELETE CASCADE,
  taken_on            DATE NOT NULL DEFAULT CURRENT_DATE,
  taken_by            TEXT,                       -- tailor / team member name (free text for now)
  unit                TEXT NOT NULL DEFAULT 'inch' CHECK (unit IN ('cm', 'inch')),
  garment_type        TEXT,                       -- Senator | Shirt | Trouser | Gown | …
  fields              JSONB NOT NULL DEFAULT '{}'::jsonb,
  photos              TEXT[],
  voice_note          TEXT,                       -- URI of the recorded dictation audio
  notes               TEXT,
  version             INT  NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES stitchd_measurement_sets(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- History lookups are always "this tailor's, this customer's, newest version first".
CREATE INDEX IF NOT EXISTS idx_stitchd_measurement_sets_tailor_customer_version
  ON stitchd_measurement_sets (tailor_id, customer_id, version DESC);
