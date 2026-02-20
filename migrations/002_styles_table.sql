-- ============================================================
-- Migration 002 — Styles table
-- Run after 001_initial_schema.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS styles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  slug           TEXT UNIQUE NOT NULL,
  description    TEXT,
  category       TEXT,
  images         JSONB NOT NULL DEFAULT '[]',
  tags           TEXT[] NOT NULL DEFAULT '{}',
  keywords       TEXT[] NOT NULL DEFAULT '{}',
  source         TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'search'
  search_query   TEXT,
  search_results JSONB,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES admins(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_styles_category  ON styles(category);
CREATE INDEX idx_styles_is_active ON styles(is_active);
CREATE INDEX idx_styles_slug      ON styles(slug);

CREATE TRIGGER styles_updated_at
  BEFORE UPDATE ON styles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
