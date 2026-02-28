-- Migration 008: Fix billing_type default and expand status CHECK constraint
--
-- 1. billing_type has NO DEFAULT but subscription.model.js never passes it → null violation
--    Fix: set DEFAULT 'recurring' (all new subscriptions are recurring card-billed)
--
-- 2. status CHECK only allows ('active','paused','cancelled','expired','payment_failed')
--    but the payment resolver sets status='pending_payment' when creating a subscription
--    before payment is confirmed.
--    Fix: drop old constraint, add new one that includes 'pending_payment'

-- 1. Give billing_type a default so INSERTs that omit it don't violate NOT NULL
ALTER TABLE user_subscriptions
  ALTER COLUMN billing_type SET DEFAULT 'recurring';

-- 2. Backfill any existing rows that somehow have billing_type = NULL
UPDATE user_subscriptions
  SET billing_type = 'recurring'
  WHERE billing_type IS NULL;

-- 3. Drop the old status CHECK constraint (name may vary; try both common names)
ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_status_check;

ALTER TABLE user_subscriptions
  DROP CONSTRAINT IF EXISTS user_subscriptions_status_check1;

-- 4. Add the expanded CHECK constraint that includes 'pending_payment'
ALTER TABLE user_subscriptions
  ADD CONSTRAINT user_subscriptions_status_check
  CHECK (status IN (
    'active',
    'paused',
    'cancelled',
    'expired',
    'payment_failed',
    'pending_payment'
  ));
