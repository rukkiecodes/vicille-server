-- Migration 011: Add PayPal Vault columns to user_payment_methods
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE user_payment_methods
  ADD COLUMN IF NOT EXISTS paypal_payment_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS paypal_customer_id   TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_methods_paypal_token
  ON user_payment_methods (paypal_payment_token)
  WHERE paypal_payment_token IS NOT NULL;
