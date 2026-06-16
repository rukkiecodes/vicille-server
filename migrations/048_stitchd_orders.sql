-- Migration 048: Stitchd orders (+ items + activity)  (batch 04)
--
-- NOTE: migration 041 reserved this as a no-op stub and was already APPLIED to the live
-- DB, so the real tables are created here under a fresh number (editing 041 would never
-- reach environments that already ran it).
--
-- Per doc 01 §2 "Order": distinct from the Vicelle `orders` module — Stitchd orders have
-- NO QC gate and NO admin assignment; the tailor owns the lifecycle. Rooted at the
-- tailor's own customer. Tenant key is `tailor_id`.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–03.

-- ── Orders ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_orders (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id                 UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id               UUID NOT NULL REFERENCES stitchd_customers(id) ON DELETE CASCADE,
  order_number              INT  NOT NULL,                  -- per-tailor human number (#045)
  created_on                DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date                  DATE,
  status                    TEXT NOT NULL DEFAULT 'New'
                              CHECK (status IN ('New','In Progress','Ready','Delivered','Closed')),
  linked_measurement_set_id UUID REFERENCES stitchd_measurement_sets(id) ON DELETE SET NULL,
  total_price               NUMERIC(12,2) NOT NULL DEFAULT 0,
  deposit_paid              NUMERIC(12,2) NOT NULL DEFAULT 0,
  balance_owed              NUMERIC(12,2) NOT NULL DEFAULT 0,
  materials                 JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{label, done}]
  photos                    JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{id, kind, url, ts}]
  voice_notes               JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{id, url, ts}]
  notes                     TEXT,
  source                    TEXT NOT NULL DEFAULT 'direct'
                              CHECK (source IN ('direct','style-u')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Queue: this tailor's, by status, by due date. Plus per-tailor numbering & customer lists.
CREATE INDEX IF NOT EXISTS idx_stitchd_orders_tailor_status_due
  ON stitchd_orders (tailor_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_stitchd_orders_tailor_customer
  ON stitchd_orders (tailor_id, customer_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_orders_tailor_number
  ON stitchd_orders (tailor_id, order_number);

-- ── Order items ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES stitchd_orders(id) ON DELETE CASCADE,
  tailor_id    UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  garment_type TEXT,
  quantity     INT  NOT NULL DEFAULT 1,
  fabric_notes TEXT,
  unit_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
  instructions TEXT,
  position     INT  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_stitchd_order_items_order
  ON stitchd_order_items (order_id);

-- ── Order activity (timeline) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_order_activity (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES stitchd_orders(id) ON DELETE CASCADE,
  tailor_id   UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                 -- created | status | payment | photo | note | edit
  from_status TEXT,
  to_status   TEXT,
  actor       TEXT,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ts          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_order_activity_order_ts
  ON stitchd_order_activity (order_id, ts DESC);
