-- Migration 027: Add referral_reward_ngn column to subscription_plans
-- Each plan carries its own reward amount paid to the referrer when the
-- referred user activates a subscription on that plan.

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS referral_reward_ngn NUMERIC NOT NULL DEFAULT 1000;

-- Set reward amounts proportional to plan pricing
UPDATE subscription_plans SET referral_reward_ngn = 1000  WHERE slug = 'starter-package';
UPDATE subscription_plans SET referral_reward_ngn = 2000  WHERE slug = 'exclusive-starter';
UPDATE subscription_plans SET referral_reward_ngn = 3500  WHERE slug = 'elevated-style';
UPDATE subscription_plans SET referral_reward_ngn = 5000  WHERE slug = 'luxe-wardrobe-refresh';
UPDATE subscription_plans SET referral_reward_ngn = 10000 WHERE slug = 'styleu-prestige';
UPDATE subscription_plans SET referral_reward_ngn = 20000 WHERE slug = 'styleu-executive';
UPDATE subscription_plans SET referral_reward_ngn = 35000 WHERE slug = 'styleu-elite';
UPDATE subscription_plans SET referral_reward_ngn = 1000  WHERE slug = 'custom-package';
