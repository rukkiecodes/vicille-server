-- ============================================================
-- 019: Add tailor_id to orders table
-- Required so admin can assign a tailor to an order and the
-- order detail page can display the assigned tailor.
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS tailor_id UUID REFERENCES tailors(id);

CREATE INDEX IF NOT EXISTS idx_orders_tailor ON orders(tailor_id);
