-- Migration 028: Affiliates, affiliate wallets, and affiliate wallet transactions

-- Affiliate accounts (separate from users)
CREATE TABLE IF NOT EXISTS affiliates (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      TEXT NOT NULL,
  email          TEXT UNIQUE NOT NULL,
  phone          TEXT,
  password_hash  TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'suspended')),
  referral_code  VARCHAR(16) UNIQUE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliates_email         ON affiliates(email);
CREATE INDEX IF NOT EXISTS idx_affiliates_referral_code ON affiliates(referral_code);
CREATE INDEX IF NOT EXISTS idx_affiliates_status        ON affiliates(status);

-- One wallet per affiliate (created atomically on registration)
CREATE TABLE IF NOT EXISTS affiliate_wallets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID UNIQUE NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  balance       NUMERIC NOT NULL DEFAULT 0,
  total_earned  NUMERIC NOT NULL DEFAULT 0,
  currency      VARCHAR(8) NOT NULL DEFAULT 'NGN',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Transaction ledger for affiliate wallets
CREATE TABLE IF NOT EXISTS affiliate_wallet_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  affiliate_id  UUID NOT NULL REFERENCES affiliates(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('credit', 'debit', 'withdrawal')),
  amount        NUMERIC NOT NULL,
  currency      VARCHAR(8) NOT NULL DEFAULT 'NGN',
  description   TEXT,
  reference_id  UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_wallet_tx_affiliate ON affiliate_wallet_transactions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_wallet_tx_type      ON affiliate_wallet_transactions(affiliate_id, type);

-- Auto-update updated_at on affiliates
CREATE TRIGGER trg_affiliates_updated_at
  BEFORE UPDATE ON affiliates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Auto-update updated_at on affiliate_wallets
CREATE TRIGGER trg_affiliate_wallets_updated_at
  BEFORE UPDATE ON affiliate_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
