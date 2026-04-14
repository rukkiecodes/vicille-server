-- Migration 032: In-app user wallet
-- Each user gets one wallet. Funded via:
--   (a) Dedicated Virtual Account (DVA) — bank transfer, Paystack detects it
--   (b) Card top-up — one-time Paystack charge
-- Wallet balance can be used to pay for subscriptions and future in-app charges.

-- ── User wallets (one per user) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_wallets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance_kobo       BIGINT NOT NULL DEFAULT 0 CHECK (balance_kobo >= 0),
  currency           VARCHAR(3) NOT NULL DEFAULT 'NGN',

  -- Dedicated Virtual Account (bank transfer funding)
  -- Populated once DVA is assigned via Paystack.
  dva_account_number VARCHAR(20),
  dva_account_name   VARCHAR(100),
  dva_bank_name      VARCHAR(100),
  dva_bank_slug      VARCHAR(50),
  dva_paystack_id    INTEGER,
  dva_assigned       BOOLEAN NOT NULL DEFAULT FALSE,
  dva_assigned_at    TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_user_id
  ON user_wallets (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_wallets_dva_account_number
  ON user_wallets (dva_account_number)
  WHERE dva_account_number IS NOT NULL;

CREATE TRIGGER trg_user_wallets_updated_at
  BEFORE UPDATE ON user_wallets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Wallet transaction ledger ─────────────────────────────────────────────────
-- Immutable audit log — rows are never deleted or updated.
-- balance_before / balance_after are snapshots for audit trail integrity.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id          UUID NOT NULL REFERENCES user_wallets(id),
  user_id            UUID NOT NULL REFERENCES users(id),

  -- Transaction classification
  type               VARCHAR(30) NOT NULL CHECK (type IN (
                       'topup_card',          -- funded via card payment
                       'topup_bank',          -- funded via DVA bank transfer
                       'subscription_debit',  -- subscription paid from wallet
                       'subscription_refund', -- subscription refund back to wallet
                       'admin_credit',        -- manual credit by admin
                       'admin_debit'          -- manual debit by admin
                     )),
  direction          VARCHAR(3) NOT NULL CHECK (direction IN ('in', 'out')),

  -- Amount (always positive; direction indicates in/out)
  amount_kobo        BIGINT NOT NULL CHECK (amount_kobo > 0),

  -- Balance snapshots at time of transaction
  balance_before     BIGINT NOT NULL,
  balance_after      BIGINT NOT NULL,

  status             VARCHAR(20) NOT NULL DEFAULT 'completed'
                       CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),

  -- Paystack reference for traceability and dedup
  paystack_reference VARCHAR(100),
  paystack_channel   VARCHAR(50),  -- 'card' | 'dedicated_nuban' | null

  description        TEXT,
  metadata           JSONB,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id
  ON wallet_transactions (wallet_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id
  ON wallet_transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_wallet_transactions_created_at
  ON wallet_transactions (created_at DESC);

-- Unique index on paystack_reference prevents double-crediting if webhook fires twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_transactions_paystack_reference
  ON wallet_transactions (paystack_reference)
  WHERE paystack_reference IS NOT NULL;

-- ── Saved cards ───────────────────────────────────────────────────────────────
-- Stores reusable Paystack authorization codes from successful card top-ups.
-- Lets users top up instantly without re-entering card details.
CREATE TABLE IF NOT EXISTS user_saved_cards (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  authorization_code VARCHAR(100) NOT NULL,
  last4              VARCHAR(4),
  bin                VARCHAR(10),
  exp_month          VARCHAR(2),
  exp_year           VARCHAR(4),
  card_type          VARCHAR(50),  -- e.g. 'visa DEBIT'
  bank               VARCHAR(100),
  brand              VARCHAR(50),  -- 'visa' | 'mastercard' | 'verve'
  channel            VARCHAR(20),  -- always 'card' here
  -- Paystack card signature — unique fingerprint for dedup (same physical card = same sig)
  signature          VARCHAR(100),
  is_default         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_saved_cards_user_id
  ON user_saved_cards (user_id);

-- Prevent saving the same physical card twice for the same user
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_saved_cards_user_signature
  ON user_saved_cards (user_id, signature)
  WHERE signature IS NOT NULL;

-- ── Backfill: create wallet rows for all existing users ───────────────────────
-- New users get a wallet automatically in application code (on registration).
-- Existing users need wallets created here.
INSERT INTO user_wallets (user_id)
SELECT id FROM users
WHERE is_deleted = FALSE
  AND NOT EXISTS (
    SELECT 1 FROM user_wallets w WHERE w.user_id = users.id
  );
