-- Adds every column referenced by subscription.model.js that may be missing
-- from the user_subscriptions table.
-- Uses ADD COLUMN IF NOT EXISTS so it is safe to run multiple times.

ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS billing           JSONB,
  ADD COLUMN IF NOT EXISTS next_billing_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS current_cycle     JSONB,
  ADD COLUMN IF NOT EXISTS payment_status    VARCHAR(50)  DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS grace_period_ends TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS start_date        TIMESTAMPTZ  DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS end_date          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewal_enabled   BOOLEAN      DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS cancellation      JSONB;

-- Index used by the billing cron to find subscriptions due for renewal
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_next_billing_date
  ON user_subscriptions (next_billing_date)
  WHERE status = 'active';
