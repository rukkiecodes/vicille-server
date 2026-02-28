-- Migration 009: Add all columns expected by payment.model.js that are missing
-- from the payments table (original schema used different column names).
-- Safe to run multiple times (ADD COLUMN IF NOT EXISTS).

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS transaction_reference TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS payment_type          TEXT,
  ADD COLUMN IF NOT EXISTS provider_reference    TEXT,
  ADD COLUMN IF NOT EXISTS provider_response     JSONB,
  ADD COLUMN IF NOT EXISTS metadata              JSONB,
  ADD COLUMN IF NOT EXISTS refund                JSONB,
  ADD COLUMN IF NOT EXISTS paid_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at             TIMESTAMPTZ;

-- Expand status CHECK to include 'success' (model uses STATUS.SUCCESS = 'success').
-- Original only had: 'pending','processing','completed','failed','refunded'
ALTER TABLE payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'processing', 'completed', 'success', 'failed', 'refunded'));

-- Indexes for fast lookups used by billing service
CREATE INDEX IF NOT EXISTS idx_payments_transaction_reference
  ON payments (transaction_reference);

CREATE INDEX IF NOT EXISTS idx_payments_provider_reference
  ON payments (provider_reference);
