-- Migration 010: Comprehensive fix for all vicelle-pay table issues.
-- Safe to run even if some steps were already applied (IF NOT EXISTS / DROP IF EXISTS).
--
-- Fixes:
--   payments             — type NOT NULL default, all missing columns, status CHECK
--   user_payment_methods — missing columns, UNIQUE constraint for ON CONFLICT upsert

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. payments — fix NOT NULL columns that model never provides
-- ─────────────────────────────────────────────────────────────────────────────

-- 'type' is NOT NULL but the model inserts into 'payment_type' instead.
-- Give it a default so rows inserted without it don't fail.
ALTER TABLE payments
  ALTER COLUMN type SET DEFAULT 'subscription';

-- Backfill any NULLs that may have slipped in
UPDATE payments SET type = 'subscription' WHERE type IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. payments — add all columns the model expects that don't exist yet
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS transaction_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_type          TEXT,
  ADD COLUMN IF NOT EXISTS provider_reference    TEXT,
  ADD COLUMN IF NOT EXISTS provider_response     JSONB,
  ADD COLUMN IF NOT EXISTS metadata              JSONB,
  ADD COLUMN IF NOT EXISTS refund                JSONB,
  ADD COLUMN IF NOT EXISTS paid_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at             TIMESTAMPTZ;

-- UNIQUE index on transaction_reference (model uses it as a lookup key)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_reference
  ON payments (transaction_reference)
  WHERE transaction_reference IS NOT NULL;

-- Index on provider_reference for webhook lookups
CREATE INDEX IF NOT EXISTS idx_payments_provider_reference
  ON payments (provider_reference)
  WHERE provider_reference IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. payments — expand status CHECK to include 'success'
--    (model uses STATUS.SUCCESS = 'success'; original only had 'completed')
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'success', 'failed', 'refunded'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. user_payment_methods — add columns missing from original schema
--    (vicelle-pay migration 004 may never have been run)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_payment_methods
  ADD COLUMN IF NOT EXISTS authorization_status   TEXT NOT NULL DEFAULT 'pending'
                           CHECK (authorization_status IN ('pending', 'active', 'revoked')),
  ADD COLUMN IF NOT EXISTS bank_code              TEXT,
  ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT,
  ADD COLUMN IF NOT EXISTS mandate_reference      TEXT,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. user_payment_methods — add UNIQUE constraint on paystack_authorization_code
--    Required by upsertByAuthCode's ON CONFLICT (paystack_authorization_code)
-- ─────────────────────────────────────────────────────────────────────────────

-- Create a unique index (equivalent to a UNIQUE constraint, works with ON CONFLICT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_auth_code_unique
  ON user_payment_methods (paystack_authorization_code)
  WHERE paystack_authorization_code IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. updated_at trigger for user_payment_methods (if not already set up)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_payment_methods_updated_at'
  ) THEN
    CREATE TRIGGER trg_payment_methods_updated_at
      BEFORE UPDATE ON user_payment_methods
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
