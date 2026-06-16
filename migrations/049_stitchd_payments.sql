-- Migration 049: Stitchd payments (+ order balance trigger)  (batch 05)
--
-- NOTE: migration 042 reserved this as a no-op stub and was already APPLIED to the live
-- DB, so the real table is created here under a fresh number.
--
-- Per doc 01 §2 "Payment": cash recorded now (P1); in-app collection is P2 (batch 09).
-- Payments are the single source of truth for money received: a DB trigger recomputes the
-- parent order's deposit_paid (= Σ payments) and balance_owed (= total_price − Σ payments)
-- on every payment insert/update/delete, so the order, the order list, and the money
-- aggregates never disagree (the recompute-on-write rule, plan §Backend).
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–04.

CREATE TABLE IF NOT EXISTS stitchd_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid       UUID NOT NULL,                 -- offline idempotency key (per tailor)
  tailor_id         UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id       UUID NOT NULL REFERENCES stitchd_customers(id) ON DELETE CASCADE,
  order_id          UUID REFERENCES stitchd_orders(id) ON DELETE SET NULL,  -- nullable: standalone allowed
  type              TEXT NOT NULL DEFAULT 'cash_recorded'
                      CHECK (type IN ('cash_recorded','in_app_collected')),
  amount            NUMERIC(12,2) NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'NGN',
  paid_on           TIMESTAMPTZ NOT NULL DEFAULT now(),
  method            TEXT NOT NULL DEFAULT 'cash'
                      CHECK (method IN ('cash','card','transfer','ussd')),
  reference         TEXT,
  settlement_status TEXT NOT NULL DEFAULT 'pending_payout'
                      CHECK (settlement_status IN ('pending_payout','paid_out')),
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: a replayed offline write (same tailor + client_uuid) is a no-op insert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_payments_tailor_clientuuid
  ON stitchd_payments (tailor_id, client_uuid);
CREATE INDEX IF NOT EXISTS idx_stitchd_payments_tailor_customer_paid
  ON stitchd_payments (tailor_id, customer_id, paid_on DESC);
CREATE INDEX IF NOT EXISTS idx_stitchd_payments_tailor_order
  ON stitchd_payments (tailor_id, order_id);

-- ── Order balance recompute trigger (authoritative) ────────────────────────────
CREATE OR REPLACE FUNCTION stitchd_recompute_order_balance(p_order_id UUID)
RETURNS void AS $$
BEGIN
  IF p_order_id IS NULL THEN RETURN; END IF;
  UPDATE stitchd_orders o
     SET deposit_paid = COALESCE(s.paid, 0),
         balance_owed = GREATEST(0, o.total_price - COALESCE(s.paid, 0)),
         updated_at   = now()
    FROM (SELECT COALESCE(SUM(amount), 0) AS paid
            FROM stitchd_payments WHERE order_id = p_order_id) s
   WHERE o.id = p_order_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION stitchd_payments_balance_trigger()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    PERFORM stitchd_recompute_order_balance(OLD.order_id);
    RETURN OLD;
  END IF;
  PERFORM stitchd_recompute_order_balance(NEW.order_id);
  -- On UPDATE that moved the payment between orders, also fix the old order.
  IF (TG_OP = 'UPDATE' AND OLD.order_id IS DISTINCT FROM NEW.order_id) THEN
    PERFORM stitchd_recompute_order_balance(OLD.order_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stitchd_payments_balance ON stitchd_payments;
CREATE TRIGGER trg_stitchd_payments_balance
  AFTER INSERT OR UPDATE OR DELETE ON stitchd_payments
  FOR EACH ROW EXECUTE FUNCTION stitchd_payments_balance_trigger();
