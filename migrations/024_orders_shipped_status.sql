-- Migration 024: Add shipped status and shipped_at column
-- Orders can now be "shipped" (en route) before the client confirms delivery.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;

-- Extend the status check constraint to allow 'shipped'
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'styling_in_progress',
    'production_in_progress',
    'package_ready_payment_required',
    'package_ready_delivery_in_progress',
    'shipped',
    'delivered',
    'cancelled'
  )
);
