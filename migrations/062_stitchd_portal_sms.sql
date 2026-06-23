-- Migration 062: Stitchd customer portal + SMS fallback (batch 18)
--
-- A read-only, tokenized public web page lets the tailor's CUSTOMER follow an order and pay
-- their balance with no app/login. SMS (Termii) is the fallback channel for customers not on
-- WhatsApp. Portal tokens are high-entropy + revocable + optionally expiring and grant access
-- to exactly one order (or a customer's open orders).
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–17.

CREATE TABLE IF NOT EXISTS stitchd_portal_tokens (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id      UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id    UUID NOT NULL REFERENCES stitchd_customers(id) ON DELETE CASCADE,
  order_id       UUID REFERENCES stitchd_orders(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,                  -- high-entropy; the only credential
  scope          TEXT NOT NULL DEFAULT 'order' CHECK (scope IN ('order','customer')),
  expires_at     TIMESTAMPTZ,
  revoked_at     TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  view_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_portal_tokens_order ON stitchd_portal_tokens (tailor_id, order_id);

CREATE TABLE IF NOT EXISTS stitchd_sms_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id    UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id  UUID REFERENCES stitchd_customers(id) ON DELETE SET NULL,
  to_phone     TEXT NOT NULL,
  body         TEXT NOT NULL,
  provider     TEXT NOT NULL DEFAULT 'termii',
  status       TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','failed','delivered')),
  provider_ref TEXT,
  error        TEXT,
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_sms_log_customer ON stitchd_sms_log (tailor_id, customer_id, sent_at DESC);

-- Per-customer preferred channel + tenant SMS toggle.
ALTER TABLE stitchd_customers
  ADD COLUMN IF NOT EXISTS preferred_channel TEXT DEFAULT 'whatsapp'
    CHECK (preferred_channel IN ('whatsapp','sms'));
ALTER TABLE stitchd_tailor_profile
  ADD COLUMN IF NOT EXISTS sms_enabled BOOLEAN NOT NULL DEFAULT TRUE;
