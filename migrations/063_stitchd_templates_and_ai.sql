-- Migration 063: Stitchd order/body-type templates + AI tag suggestions (batch 19)
--
-- Speeds up repetitive work (reusable order configs, body-type measurement defaults) and backs
-- the advanced-AI auto-tag suggestions (which feed the batch-13 tag system on accept). The
-- validator / auto-tag / social-post AI calls reuse stitchd_ai_usage for metering (no new table).
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–18.

CREATE TABLE IF NOT EXISTS stitchd_order_templates (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id              UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  items                  JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{garmentType,quantity,fabricNotes,unitPrice,instructions}]
  default_due_offset_days INTEGER NOT NULL DEFAULT 14,
  default_total          NUMERIC(12,2),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_order_templates_tailor ON stitchd_order_templates (tailor_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS stitchd_body_type_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id    UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  unit         TEXT NOT NULL DEFAULT 'inch' CHECK (unit IN ('inch','cm')),
  garment_type TEXT,
  fields       JSONB NOT NULL DEFAULT '{}'::jsonb,           -- {key: value} measurement defaults
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_body_type_templates_tailor ON stitchd_body_type_templates (tailor_id);

CREATE TABLE IF NOT EXISTS stitchd_ai_tag_suggestions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id       UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES stitchd_customers(id) ON DELETE CASCADE,
  suggested_label TEXT NOT NULL,
  confidence      NUMERIC(4,3),
  source          TEXT NOT NULL DEFAULT 'heuristic',         -- heuristic | ai
  status          TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','accepted','dismissed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One live suggestion per (customer, label).
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_tag_suggestion
  ON stitchd_ai_tag_suggestions (tailor_id, customer_id, suggested_label);
CREATE INDEX IF NOT EXISTS idx_stitchd_tag_suggestions_customer
  ON stitchd_ai_tag_suggestions (tailor_id, customer_id, status);
