-- Migration 051: Stitchd AI Fit Consultant chat persistence (batch 07)
--
-- The text-based AI Fit Consultant (spec §5.6, §7.6) records each conversation turn so the
-- chat survives app restarts and a response can later be saved as a note on a customer/order
-- (doc 01 §7 recommends server-side persistence for cross-device save-as-note). AI USAGE
-- METERING already lives in `stitchd_ai_usage` (migration 047, reused via the `feature`
-- column 'fit_consultant') — this migration only adds the message log.
--
-- Tenant isolation (doc 01 §3): every row is scoped to `tailor_id`; the optional
-- customer_id/order_id are this tailor's own records. Outbound assistant answers and the
-- tailor's prompts are stored as alternating roles.
--
-- Idempotent on (tailor_id, client_uuid) so a replayed offline send returns the same turn.
-- RLS deferred consistent with batches 01–06 (isolation via the requireTailor guard +
-- tailor_id scoping in every model method).

CREATE TABLE IF NOT EXISTS stitchd_ai_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id   UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  client_uuid UUID,                              -- idempotency key for the user turn (offline-first)
  feature     TEXT NOT NULL DEFAULT 'fit_consultant',
  role        TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content     TEXT NOT NULL,
  customer_id UUID REFERENCES stitchd_customers(id) ON DELETE SET NULL,
  order_id    UUID REFERENCES stitchd_orders(id) ON DELETE SET NULL,
  photo_urls  JSONB NOT NULL DEFAULT '[]'::jsonb, -- vision context attached to a user turn
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One conversation, newest-last: read the tenant's turns for a feature in order.
CREATE INDEX IF NOT EXISTS idx_stitchd_ai_messages_tailor_feature
  ON stitchd_ai_messages (tailor_id, feature, created_at);

-- Idempotent replay of an offline user turn (NULL client_uuid rows — e.g. assistant
-- answers — are exempt from the uniqueness constraint via the partial index).
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_ai_messages_tailor_client
  ON stitchd_ai_messages (tailor_id, client_uuid)
  WHERE client_uuid IS NOT NULL;
