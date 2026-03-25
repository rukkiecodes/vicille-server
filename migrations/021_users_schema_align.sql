-- Migration 021: Align users table with the Node.js model expectations
-- The live DB was created with a minimal schema; add all columns the app code needs.

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone                     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activation_code           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_activated              BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS activated_at              TIMESTAMPTZ;

-- Add status (text) alongside is_active (boolean) that already exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'
  CHECK (status IN ('inactive','active','pending','suspended','deleted'));

-- Backfill status from is_active for existing rows
UPDATE users SET status = CASE
  WHEN is_active = TRUE  THEN 'active'
  WHEN is_flagged = TRUE THEN 'suspended'
  ELSE 'inactive'
END
WHERE status = 'active';  -- only touch default-filled rows

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_onboarded              BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step           INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS date_of_birth             DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS height                    NUMERIC;
ALTER TABLE users ADD COLUMN IF NOT EXISTS height_source             TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS gender                    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_photo_url         TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS studio_photos             JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS birthday_package_eligible BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts     INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at             TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by_admin_id       UUID;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_customer_code    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_balance          NUMERIC DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_total_earned     NUMERIC DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_deleted                BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at                TIMESTAMPTZ;

-- Backfill profile_photo_url from avatar_url for existing rows
UPDATE users SET profile_photo_url = avatar_url WHERE avatar_url IS NOT NULL AND profile_photo_url IS NULL;

-- Index for fast passcode lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_activation_code ON users(activation_code) WHERE activation_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_is_deleted ON users(is_deleted);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status) WHERE is_deleted = FALSE;
