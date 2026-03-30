-- Migration 029: Extend referral_invites to support affiliate track +
--               add user referral wallet transaction ledger

-- Allow referral_invites to track both user and affiliate referrals
ALTER TABLE referral_invites
  ADD COLUMN IF NOT EXISTS source_type  TEXT NOT NULL DEFAULT 'user'
    CHECK (source_type IN ('user', 'affiliate')),
  ADD COLUMN IF NOT EXISTS affiliate_id UUID REFERENCES affiliates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_referral_invites_source_type  ON referral_invites(source_type);
CREATE INDEX IF NOT EXISTS idx_referral_invites_affiliate_id ON referral_invites(affiliate_id);

-- Transaction ledger for user referral balances
-- Gives users a full history of how their referral_balance changed over time
CREATE TABLE IF NOT EXISTS referral_wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'withdrawal')),
  amount        NUMERIC NOT NULL,
  currency      VARCHAR(8) NOT NULL DEFAULT 'NGN',
  description   TEXT,
  reference_id  UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_wallet_tx_user ON referral_wallet_transactions(user_id);
