-- Migration 030: Add user-specific shareable referral code to users table
-- This enables the in-app affiliate programme where users get a personal
-- referral code to share (separate from per-email invite codes).

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)
  WHERE referral_code IS NOT NULL;
