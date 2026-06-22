-- Migration 055: Stitchd subscription billing & tiers (batch 11)
--
-- Turns the 30-day trial (batch 01) into a paying subscription via Paystack recurring card
-- charges (tailor ↔ Stitchd money; distinct from batches 09/10 tailor ↔ customer money).
-- Adds billing state to the tailor profile + invoices, card-on-file, and dunning tracking.
-- Tier entitlements live in CODE (src/modules/stitchd/stitchdEntitlements.js), not a table,
-- so AI batches (07/12) and the team gate (16) read one source of truth.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–10.

-- ── Billing state on the tailor profile ────────────────────────────────────────
ALTER TABLE stitchd_tailor_profile
  ADD COLUMN IF NOT EXISTS current_period_end        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grace_ends_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paystack_customer_code    TEXT,
  ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_email_token      TEXT,
  ADD COLUMN IF NOT EXISTS paystack_plan_code        TEXT;

-- subscription_status already allows 'trial'; widen the set used by billing.
-- (No CHECK constraint exists on the column, so values are free-form: trial|active|past_due|canceled.)

-- ── Invoices (one per successful/failed recurring charge) ───────────────────────
CREATE TABLE IF NOT EXISTS stitchd_billing_invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id           UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  paystack_invoice_ref TEXT,
  amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency            TEXT NOT NULL DEFAULT 'NGN',
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('paid','failed','pending')),
  tier                TEXT,
  period_start        TIMESTAMPTZ,
  period_end          TIMESTAMPTZ,
  paid_at             TIMESTAMPTZ,
  hosted_url          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_invoices_tailor
  ON stitchd_billing_invoices (tailor_id, created_at DESC);
-- Idempotent webhook recording.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_invoices_ref
  ON stitchd_billing_invoices (paystack_invoice_ref) WHERE paystack_invoice_ref IS NOT NULL;

-- ── Card on file for recurring charge ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_payment_methods (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id                 UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  paystack_authorization_code TEXT,
  card_brand                TEXT,
  last4                     TEXT,
  exp_month                 TEXT,
  exp_year                  TEXT,
  is_default                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_payment_method_default
  ON stitchd_payment_methods (tailor_id) WHERE is_default;

-- ── Dunning (failed-renewal retry/notify/suspend tracking) ─────────────────────
CREATE TABLE IF NOT EXISTS stitchd_dunning_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id     UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  attempt       INT NOT NULL DEFAULT 1,
  outcome       TEXT,                              -- failed | retried | recovered | suspended
  next_retry_at TIMESTAMPTZ,
  notified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_dunning_tailor
  ON stitchd_dunning_events (tailor_id, created_at DESC);
