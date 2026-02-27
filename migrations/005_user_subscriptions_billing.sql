-- Migration 005: Add billing JSONB and next_billing_date columns to user_subscriptions
-- These were referenced in the model but never created in the initial schema.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS billing           JSONB,
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ;

-- Index for vicelle-pay billing cron job query
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_next_billing_date
  ON user_subscriptions (next_billing_date)
  WHERE status = 'active';
