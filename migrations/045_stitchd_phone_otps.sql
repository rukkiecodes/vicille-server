-- Migration 045: Stitchd phone-OTP store
--
-- Backs the phone-OTP signup flow (batch 01). One row per issued code. The plaintext
-- code is NEVER stored — only a bcrypt hash. Codes expire after a short window and are
-- marked consumed on successful verification.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS stitchd_phone_otps (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone       TEXT NOT NULL,
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  attempts    INT NOT NULL DEFAULT 0,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stitchd_phone_otps_phone
  ON stitchd_phone_otps(phone);
