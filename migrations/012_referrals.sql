-- Migration 012: Referral system

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS referral_balance NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referral_total_earned NUMERIC NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS referral_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_user_id UUID UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  invited_email TEXT,
  invite_code VARCHAR(32) UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rewarded', 'cancelled')),
  reward_amount NUMERIC NOT NULL DEFAULT 0,
  reward_currency VARCHAR(8) NOT NULL DEFAULT 'NGN',
  accepted_at TIMESTAMPTZ,
  rewarded_at TIMESTAMPTZ,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_invites_inviter_user_id
  ON referral_invites(inviter_user_id);

CREATE INDEX IF NOT EXISTS idx_referral_invites_invited_user_id
  ON referral_invites(invited_user_id);

CREATE INDEX IF NOT EXISTS idx_referral_invites_status
  ON referral_invites(status);

CREATE TRIGGER trg_referral_invites_updated_at
  BEFORE UPDATE ON referral_invites
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();