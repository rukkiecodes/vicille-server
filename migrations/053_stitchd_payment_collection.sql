-- Migration 053: Stitchd in-app digital payment collection (batch 09)
--
-- Extends `stitchd_payments` (batch 05) with the digital-collection fields so a tailor can
-- collect via Paystack link/USSD/transfer, the webhook attributes the payment, and batch 10
-- can settle it. Adds an audit table and the pending-payout index.
--
-- IMPORTANT — balance correctness: batch 05's `stitchd_recompute_order_balance` summed ALL
-- payment rows for an order. A digital collection is created in `status='initiated'` BEFORE
-- the customer actually pays, so counting it would wrongly drop the balance. This migration
-- redefines the recompute to count only MONEY ACTUALLY IN: cash rows (status NULL) plus
-- in-app rows whose `status='success'`. Existing cash rows have NULL status → still counted.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–08.

-- ── Digital-collection columns on stitchd_payments ─────────────────────────────
ALTER TABLE stitchd_payments
  ADD COLUMN IF NOT EXISTS provider           TEXT,                        -- 'paystack' | 'flutterwave'
  ADD COLUMN IF NOT EXISTS provider_reference TEXT,                        -- gateway transaction reference
  ADD COLUMN IF NOT EXISTS auth_url           TEXT,                        -- hosted payment page URL
  ADD COLUMN IF NOT EXISTS ussd_code          TEXT,                        -- USSD string when available
  ADD COLUMN IF NOT EXISTS channel            TEXT,                        -- card | transfer | ussd
  ADD COLUMN IF NOT EXISTS status             TEXT                         -- NULL for cash; digital lifecycle below
                      CHECK (status IS NULL OR status IN ('initiated','pending','success','failed','abandoned')),
  ADD COLUMN IF NOT EXISTS fee_bps            INTEGER NOT NULL DEFAULT 0,  -- platform fee in basis points
  ADD COLUMN IF NOT EXISTS fee_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_amount         NUMERIC(12,2),               -- amount - fee_amount (NULL until success)
  ADD COLUMN IF NOT EXISTS settled_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_id          UUID,                        -- FK reserved for batch 10
  ADD COLUMN IF NOT EXISTS retry_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error         TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key    TEXT;                        -- dedupe webhook + retries

-- A provider reference uniquely identifies a gateway charge (webhook idempotency).
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_payments_provider_reference
  ON stitchd_payments (provider_reference) WHERE provider_reference IS NOT NULL;

-- Batch 10's pending-balance query: who has collected-but-unsettled money.
CREATE INDEX IF NOT EXISTS idx_stitchd_payments_tailor_settlement
  ON stitchd_payments (tailor_id, settlement_status);

-- ── Audit log for traceability + webhook replay safety ─────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_payment_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES stitchd_payments(id) ON DELETE CASCADE,
  tailor_id  UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                       -- initiated | webhook_received | success | failed | retried
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_payment_events_payment
  ON stitchd_payment_events (payment_id, ts);

-- ── Balance recompute: count only money actually collected ─────────────────────
CREATE OR REPLACE FUNCTION stitchd_recompute_order_balance(p_order_id UUID)
RETURNS void AS $$
BEGIN
  IF p_order_id IS NULL THEN RETURN; END IF;
  UPDATE stitchd_orders o
     SET deposit_paid = COALESCE(s.paid, 0),
         balance_owed = GREATEST(0, o.total_price - COALESCE(s.paid, 0)),
         updated_at   = now()
    FROM (SELECT COALESCE(SUM(amount), 0) AS paid
            FROM stitchd_payments
           WHERE order_id = p_order_id
             AND (status IS NULL OR status = 'success')) s   -- cash (NULL) or collected
   WHERE o.id = p_order_id;
END;
$$ LANGUAGE plpgsql;
