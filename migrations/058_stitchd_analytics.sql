-- Migration 058: Stitchd analytics indexes (batch 14)
--
-- The Analytics Dashboard (monthly revenue, top customers, best-selling garments, dormant
-- customers) runs LIVE per-tenant aggregate queries — not materialized views — because a
-- single tailor's data is small, live is always fresh, and it avoids MV refresh-cron overhead.
-- These indexes keep those aggregates fast on a mid-range phone over 3G.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–13.

-- Best-selling garments: GROUP BY garment_type per tenant over order items.
CREATE INDEX IF NOT EXISTS idx_stitchd_order_items_tailor_garment
  ON stitchd_order_items (tailor_id, garment_type);

-- Dormant customers: most-recent order per (tenant, customer).
CREATE INDEX IF NOT EXISTS idx_stitchd_orders_tailor_customer_created
  ON stitchd_orders (tailor_id, customer_id, created_on DESC);

-- Monthly revenue / top customers read stitchd_payments by (tailor_id, paid_on); the
-- (tailor_id, customer_id, paid_on) index from migration 049 already covers these scans.
