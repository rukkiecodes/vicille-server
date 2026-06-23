-- Migration 065: WhatsApp Business API, B2B customer invoices, multi-currency (batch 21)
--
-- Closes Phase 3: templated WhatsApp auto-notifications (with delivery audit), professional
-- tailor→customer invoices, and per-tenant currency. Subscription billing stays NGN (Paystack);
-- the tenant currency applies to the tailor's OWN pricing/orders/invoices only.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–20.

-- ── WhatsApp templates (global defaults: tailor_id NULL; optional tenant overrides) ──
CREATE TABLE IF NOT EXISTS stitchd_wa_templates (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id            UUID REFERENCES tailors(id) ON DELETE CASCADE,
  key                  TEXT NOT NULL,
  body                 TEXT NOT NULL,
  variables            TEXT[] NOT NULL DEFAULT '{}',
  category             TEXT NOT NULL DEFAULT 'utility',
  provider_template_id TEXT,
  approval_status      TEXT NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending','approved','rejected')),
  locale               TEXT NOT NULL DEFAULT 'en',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_wa_template ON stitchd_wa_templates (COALESCE(tailor_id, '00000000-0000-0000-0000-000000000000'::uuid), key, locale);

-- ── WhatsApp message delivery audit (parallels stitchd_sms_log) ──
CREATE TABLE IF NOT EXISTS stitchd_wa_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id     UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id   UUID REFERENCES stitchd_customers(id) ON DELETE SET NULL,
  template_key  TEXT NOT NULL,
  params        JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_ref  TEXT,
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','delivered','read','failed')),
  error         TEXT,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_wa_messages_customer ON stitchd_wa_messages (tailor_id, customer_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_stitchd_wa_messages_ref ON stitchd_wa_messages (provider_ref);

-- ── B2B customer invoices (tailor → their customer) ──
CREATE TABLE IF NOT EXISTS stitchd_customer_invoices (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id   UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES stitchd_customers(id) ON DELETE SET NULL,
  number      TEXT NOT NULL,
  items       JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{description, quantity, unitPrice}]
  subtotal    NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate    NUMERIC(6,4) NOT NULL DEFAULT 0,        -- e.g. 0.075 for 7.5% VAT
  tax_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  total       NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'NGN',
  status      TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
  notes       TEXT,
  issued_at   TIMESTAMPTZ,
  due_at      TIMESTAMPTZ,
  paid_at     TIMESTAMPTZ,
  pdf_url     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_customer_invoice_number ON stitchd_customer_invoices (tailor_id, number);
CREATE INDEX IF NOT EXISTS idx_stitchd_customer_invoices_tailor ON stitchd_customer_invoices (tailor_id, created_at DESC);

-- ── FX rates (optional cross-currency reporting) ──
CREATE TABLE IF NOT EXISTS stitchd_fx_rates (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base   TEXT NOT NULL,
  quote  TEXT NOT NULL,
  rate   NUMERIC(18,8) NOT NULL,
  as_of  DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_fx_rate ON stitchd_fx_rates (base, quote, as_of);

-- ── Per-tenant currency + per-customer WhatsApp auto-notify opt-in ──
ALTER TABLE stitchd_tailor_profile ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'NGN';
ALTER TABLE stitchd_customers ADD COLUMN IF NOT EXISTS wa_auto_optin BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Seed global default WhatsApp templates (tailor_id NULL) ──
INSERT INTO stitchd_wa_templates (tailor_id, key, body, variables, category) VALUES
  (NULL, 'order_ready', 'Hi {{1}}, your order from {{2}} is ready for pickup! 🎉', '{customerName,businessName}', 'utility'),
  (NULL, 'status_update', 'Hi {{1}}, an update on your order from {{2}}: it is now {{3}}.', '{customerName,businessName,status}', 'utility'),
  (NULL, 'payment_reminder', 'Hi {{1}}, a friendly reminder from {{2}}: you have a balance of {{3}}. You can pay here: {{4}}', '{customerName,businessName,amount,link}', 'utility'),
  (NULL, 'payment_receipt', 'Thank you {{1}}! {{2}} received your payment of {{3}}. Balance: {{4}}.', '{customerName,businessName,amount,balance}', 'utility')
ON CONFLICT DO NOTHING;
