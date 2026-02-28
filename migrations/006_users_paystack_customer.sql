-- Add Paystack customer code to users table.
-- Stored after the user is registered as a Paystack customer on first login.
-- Used to associate Paystack authorizations (saved cards) with the correct user.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS paystack_customer_code VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_users_paystack_customer_code
  ON users (paystack_customer_code) WHERE paystack_customer_code IS NOT NULL;
