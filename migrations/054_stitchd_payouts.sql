-- Migration 054: Stitchd weekly payouts to the tailor's bank (batch 10)
--
-- Closes the money loop from batch 09: collected in-app payments (settlement_status =
-- 'pending_payout') are aggregated weekly and settled to the tailor's bank via Paystack
-- transfers. Three new tables; `stitchd_payments.payout_id` / `settled_at` already exist
-- (added in migration 053) and are flipped to 'paid_out' on settlement.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–09.

-- ── Tailor payout bank account (one default per tailor) ────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_payout_bank_accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id               UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  bank_code               TEXT NOT NULL,
  bank_name               TEXT,
  account_number          TEXT NOT NULL,
  account_name            TEXT,                          -- resolved via Paystack
  paystack_recipient_code TEXT,                          -- created once, reused for transfers
  is_default              BOOLEAN NOT NULL DEFAULT TRUE,
  verified_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One default account per tailor (the settlement target).
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_payout_bank_default
  ON stitchd_payout_bank_accounts (tailor_id) WHERE is_default;

-- ── Payouts (one per tenant per settlement period) ─────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_payouts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id             UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  period_start          TIMESTAMPTZ NOT NULL,
  period_end            TIMESTAMPTZ NOT NULL,
  scheduled_for         TIMESTAMPTZ NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','paid','failed')),
  gross_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
  fee_total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency              TEXT NOT NULL DEFAULT 'NGN',
  provider              TEXT NOT NULL DEFAULT 'paystack',
  provider_transfer_ref TEXT,
  bank_account_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at            TIMESTAMPTZ
);
-- Idempotency: at most one payout per tenant per period (cron re-run safety).
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_payouts_tenant_period
  ON stitchd_payouts (tailor_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_stitchd_payouts_tailor_scheduled
  ON stitchd_payouts (tailor_id, scheduled_for DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_payouts_transfer_ref
  ON stitchd_payouts (provider_transfer_ref) WHERE provider_transfer_ref IS NOT NULL;

-- ── Itemised breakdown: one row per settled payment ────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_payout_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id  UUID NOT NULL REFERENCES stitchd_payouts(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES stitchd_payments(id) ON DELETE CASCADE,
  order_id   UUID REFERENCES stitchd_orders(id) ON DELETE SET NULL,
  gross      NUMERIC(12,2) NOT NULL DEFAULT 0,
  fee        NUMERIC(12,2) NOT NULL DEFAULT 0,
  net        NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_payout_items_payout
  ON stitchd_payout_items (payout_id);
-- A payment can only belong to one payout.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_payout_items_payment
  ON stitchd_payout_items (payment_id);

-- Eligibility scan: pending_payout payments past the holding window, oldest first.
CREATE INDEX IF NOT EXISTS idx_stitchd_payments_settlement_scan
  ON stitchd_payments (tailor_id, settlement_status, paid_on);
