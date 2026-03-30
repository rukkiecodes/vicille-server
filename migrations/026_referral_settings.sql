-- Migration 026: Referral settings — admin-configurable base reward amount

CREATE TABLE IF NOT EXISTS referral_settings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_amount  NUMERIC NOT NULL DEFAULT 1000,
  currency     VARCHAR(8) NOT NULL DEFAULT 'NGN',
  updated_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the single settings row (only one row should ever exist)
INSERT INTO referral_settings (base_amount, currency)
VALUES (1000, 'NGN')
ON CONFLICT DO NOTHING;
