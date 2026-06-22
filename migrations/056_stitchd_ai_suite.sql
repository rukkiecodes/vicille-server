-- Migration 056: Stitchd AI suite — Brief Extractor & Design Generator (batch 12)
--
-- Two P2 AI features layered on the batch-07 hub + batch-11 entitlements/metering:
--   • stitchd_ai_briefs   — a customer voice note / message turned into a structured order
--     brief (garment, fabric, colour, deadline, instructions). `extracted` is the JSON brief.
--   • stitchd_ai_designs  — AI mood-board reference images (Gemini Imagen → Cloudinary URLs).
-- Usage is metered in the existing `stitchd_ai_usage` (features 'brief' | 'design'); caps come
-- from the entitlements engine (batch 11). Generated images are HOSTED on Cloudinary; rows
-- hold the public URLs only.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–11.

CREATE TABLE IF NOT EXISTS stitchd_ai_briefs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id       UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES stitchd_customers(id) ON DELETE SET NULL,
  order_id        UUID REFERENCES stitchd_orders(id) ON DELETE SET NULL,
  source_kind     TEXT NOT NULL DEFAULT 'text' CHECK (source_kind IN ('voice','text')),
  source_media_url TEXT,
  transcript      TEXT,
  extracted       JSONB NOT NULL DEFAULT '{}'::jsonb,
  model           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_ai_briefs_tailor
  ON stitchd_ai_briefs (tailor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stitchd_ai_designs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id       UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id     UUID REFERENCES stitchd_customers(id) ON DELETE SET NULL,
  order_id        UUID REFERENCES stitchd_orders(id) ON DELETE SET NULL,
  prompt          TEXT NOT NULL,
  style_modifiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  color           TEXT,
  image_urls      JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Cloudinary public URLs
  provider        TEXT,
  model           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_ai_designs_tailor
  ON stitchd_ai_designs (tailor_id, created_at DESC);
