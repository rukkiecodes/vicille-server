-- Migration 014: add measurement linkage to orders

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS measurement_id UUID REFERENCES measurements(id);

CREATE INDEX IF NOT EXISTS idx_orders_measurement_id ON orders(measurement_id);
