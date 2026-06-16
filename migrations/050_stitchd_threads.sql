-- Migration 050: Stitchd communication — logged threads, outbound messages, templates (batch 06)
--
-- NOTE: migration 043 reserved `stitchd_threads` as a no-op stub and was already APPLIED to
-- the live DB, so the real tables are created here under a fresh number (next free is 050).
--
-- WhatsApp is the customer's interface, not Stitchd (spec §2.7). Stitchd cannot read WhatsApp,
-- so threads log ONLY outbound messages the tailor sent THROUGH Stitchd — "what Stitchd handed
-- to WhatsApp". Inbound capture + voice import arrive with the WhatsApp Business API (batch 21)
-- and voice-note import (batch 13).
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–05 (isolation via the
-- requireTailor guard + tailor_id scoping in every model method); system-default templates
-- (tailor_id NULL) are globally readable.

-- ── Threads: one per (tailor, customer) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_threads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id       UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id     UUID NOT NULL REFERENCES stitchd_customers(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_threads_tailor_customer
  ON stitchd_threads (tailor_id, customer_id);

-- ── Messages: outbound-only in P1 ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_uuid  UUID NOT NULL,                  -- offline idempotency key (per tailor)
  thread_id    UUID NOT NULL REFERENCES stitchd_threads(id) ON DELETE CASCADE,
  tailor_id    UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  customer_id  UUID NOT NULL REFERENCES stitchd_customers(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'text'
                 CHECK (kind IN ('text','voice','photo')),     -- P1 writes 'text' only
  body         TEXT,
  media_url    TEXT,                            -- nullable, P2
  direction    TEXT NOT NULL DEFAULT 'outbound'
                 CHECK (direction IN ('outbound','inbound')),  -- P1 outbound only
  template_key TEXT,                            -- which template was used (nullable)
  sent_via     TEXT NOT NULL DEFAULT 'whatsapp'
                 CHECK (sent_via IN ('whatsapp','sms','share')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: a replayed offline log (same tailor + client_uuid) is a no-op insert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_messages_tailor_clientuuid
  ON stitchd_messages (tailor_id, client_uuid);
CREATE INDEX IF NOT EXISTS idx_stitchd_messages_tailor_customer
  ON stitchd_messages (tailor_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_stitchd_messages_thread_created
  ON stitchd_messages (thread_id, created_at DESC);

-- ── Message templates: system defaults (tailor_id NULL) + tenant overrides ──────
CREATE TABLE IF NOT EXISTS stitchd_message_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id     UUID REFERENCES tailors(id) ON DELETE CASCADE,  -- NULL = system default
  key           TEXT NOT NULL,
  title         TEXT NOT NULL,
  body_template TEXT NOT NULL,
  placeholders  TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One system default per key; one override per (tailor, key).
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_templates_system_key
  ON stitchd_message_templates (key) WHERE tailor_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_templates_tailor_key
  ON stitchd_message_templates (tailor_id, key) WHERE tailor_id IS NOT NULL;

-- Seed system defaults (idempotent — only insert when the system key is absent).
INSERT INTO stitchd_message_templates (tailor_id, key, title, body_template, placeholders)
SELECT NULL, v.key, v.title, v.body_template, v.placeholders
FROM (VALUES
  ('payment_reminder', 'Payment reminder',
   'Hi {customerName}, a friendly reminder that you have an outstanding balance of {amountOwed} with {businessName}. Thank you!',
   ARRAY['customerName','amountOwed','businessName']),
  ('ready_for_pickup', 'Ready for pickup',
   'Hi {customerName}, your order {orderNumber} is ready for pickup. Thank you for choosing {businessName}!',
   ARRAY['customerName','orderNumber','businessName']),
  ('fitting_confirmation', 'Fitting confirmation',
   'Hi {customerName}, this is a reminder about your fitting for order {orderNumber} on {dueDate}. See you then! — {businessName}',
   ARRAY['customerName','orderNumber','dueDate','businessName']),
  ('receipt', 'Payment receipt',
   E'{businessName}\nReceipt\n\nCustomer: {customerName}\nAmount: {amountPaid}\nBalance after: {balance}\n\nThank you!',
   ARRAY['businessName','customerName','amountPaid','balance'])
) AS v(key, title, body_template, placeholders)
WHERE NOT EXISTS (
  SELECT 1 FROM stitchd_message_templates t WHERE t.tailor_id IS NULL AND t.key = v.key
);
