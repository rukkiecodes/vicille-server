-- Migration 064: Stitchd-side Style-U marketplace integration (batch 20)
--
-- Style-U is the consumer subscription wardrobe service (a SEPARATE product, not built here). It
-- owns the consumer relationship, payment and QC. Stitchd owns PRODUCTION: an opted-in + vetted
-- tailor receives marketplace offers, accepts/declines within an SLA, and accepted offers become
-- normal queue orders with source='style-u'. Style-U pays the tailor per delivered order on a
-- SEPARATE payout stream (NOT mixed into the batch-10 in-app collection settlement).
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–19.

CREATE TABLE IF NOT EXISTS stitchd_styleu_connection (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id       UUID NOT NULL UNIQUE REFERENCES tailors(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'not_connected'
                    CHECK (status IN ('not_connected','pending_vetting','approved','rejected','suspended')),
  specialties     TEXT[] NOT NULL DEFAULT '{}',
  capacity_optin  BOOLEAN NOT NULL DEFAULT TRUE,
  applied_at      TIMESTAMPTZ,
  vetted_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stitchd_styleu_offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id       UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  styleu_order_ref TEXT NOT NULL,
  garment_summary TEXT NOT NULL,
  details         JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_date        DATE,
  payout_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'NGN',
  respond_by      TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','accepted','declined','expired')),
  decline_reason  TEXT,
  order_id        UUID REFERENCES stitchd_orders(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at    TIMESTAMPTZ
);
-- One offer per (tailor, styleu_order_ref) — idempotent ingestion.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_styleu_offer ON stitchd_styleu_offers (tailor_id, styleu_order_ref);
CREATE INDEX IF NOT EXISTS idx_stitchd_styleu_offers_inbox ON stitchd_styleu_offers (tailor_id, status, respond_by);

CREATE TABLE IF NOT EXISTS stitchd_styleu_payouts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id        UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  order_id         UUID REFERENCES stitchd_orders(id) ON DELETE SET NULL,
  styleu_order_ref TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'NGN',
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','released','paid')),
  delivered_at     TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_styleu_payout_ref ON stitchd_styleu_payouts (tailor_id, styleu_order_ref);
CREATE INDEX IF NOT EXISTS idx_stitchd_styleu_payouts_tailor ON stitchd_styleu_payouts (tailor_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS stitchd_styleu_metrics (
  tailor_id        UUID PRIMARY KEY REFERENCES tailors(id) ON DELETE CASCADE,
  rating           NUMERIC(3,2),
  on_time_rate     NUMERIC(5,4),
  accept_rate      NUMERIC(5,4),
  completed_count  INTEGER NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link a queue order back to its Style-U source order.
ALTER TABLE stitchd_orders ADD COLUMN IF NOT EXISTS styleu_order_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_stitchd_orders_styleu_ref ON stitchd_orders (tailor_id, styleu_order_ref);
