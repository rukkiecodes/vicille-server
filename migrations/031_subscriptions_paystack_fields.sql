-- Migration 031: Add Paystack plan/subscription tracking fields
-- Supports card-based subscriptions via Paystack's native Subscriptions API.
-- All Vicelle plans are monthly; Paystack manages the billing cycle automatically.

-- 1. Paystack plan code on subscription_plans
--    Populated when admin creates/updates a plan (synced to Paystack).
--    NULL until synced. Required before a user can subscribe.
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS paystack_plan_code VARCHAR(50);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_paystack_plan_code
  ON subscription_plans (paystack_plan_code)
  WHERE paystack_plan_code IS NOT NULL;

-- 2. Paystack subscription tracking on user_subscriptions
--    paystack_subscription_code — SUB_xxxx from Paystack; stored at first payment
--    paystack_email_token       — required to call disable/enable via API
--    authorization_code         — card AUTH_xxxx; stored for reference/fallback
--    payment_channel            — 'card' | 'direct_debit' | 'wallet'
ALTER TABLE user_subscriptions
  ADD COLUMN IF NOT EXISTS paystack_subscription_code VARCHAR(50),
  ADD COLUMN IF NOT EXISTS paystack_email_token       VARCHAR(100),
  ADD COLUMN IF NOT EXISTS authorization_code         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_channel            VARCHAR(20) DEFAULT 'card';

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_subscriptions_paystack_sub_code
  ON user_subscriptions (paystack_subscription_code)
  WHERE paystack_subscription_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_authorization_code
  ON user_subscriptions (authorization_code)
  WHERE authorization_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_payment_channel
  ON user_subscriptions (payment_channel);
