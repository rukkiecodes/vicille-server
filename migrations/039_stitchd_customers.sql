-- Migration 039: Stitchd customers (+ tags)  (batch 02)
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "Customer" / "CustomerTag":
-- The tailor OWNS their customers — records that exist only inside that tailor's tenant
-- and are invisible to every other tailor (trust is the product, spec §2.5). Distinct
-- from Vicelle's own `users`. The tenant key is `tailor_id` (= tailors.id).
--
-- Idempotent: safe to re-run.
--
-- NOTE on RLS (doc 01 §3, layer 3): row-level security is INTENTIONALLY still deferred
-- (see migration 044). Enabling RLS now would require the per-request `app.tailor_id`
-- GUC to be SET on every pooled connection; that pool wiring is not in place yet, so
-- enabling RLS would make every query (which goes through the shared pool) return zero
-- rows. Until 044 wires the GUC, isolation is enforced at layer 1 (the `requireTailor`
-- guard) + layer 2 (every model method filters by tailor_id). Both backstops land then.

-- ── Customers ────────────────────────────────────────────────────────────────
-- `id` is a UUID with a server-side default, but it is ALSO client-generatable: the
-- offline-first frontend (doc 01 §8) creates a UUID locally so a record made offline
-- keeps a stable identity, and createStitchdCustomer is idempotent on that id.
CREATE TABLE IF NOT EXISTS stitchd_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id       UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT,
  secondary_phone TEXT,
  email           TEXT,
  profile_photo   TEXT,
  full_body_photo TEXT,
  dob             DATE,
  address         TEXT,
  landmark        TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tenant-scoped lookups: list/search by name and by phone are always within a tailor.
CREATE INDEX IF NOT EXISTS idx_stitchd_customers_tailor_name
  ON stitchd_customers (tailor_id, name);
CREATE INDEX IF NOT EXISTS idx_stitchd_customers_tailor_phone
  ON stitchd_customers (tailor_id, phone);
-- "Recent" sort / filter.
CREATE INDEX IF NOT EXISTS idx_stitchd_customers_tailor_created
  ON stitchd_customers (tailor_id, created_at DESC);

-- ── Customer tags (created now, used in P2 / batch 13) ──────────────────────────
-- Color-coded labels (VIP, slow payer, …). The TABLE is created here so customers can
-- carry tags later without a further migration; tag CRUD + filter-by-tag is P2.
CREATE TABLE IF NOT EXISTS stitchd_customer_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES stitchd_customers(id) ON DELETE CASCADE,
  tailor_id   UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stitchd_customer_tags_tailor
  ON stitchd_customer_tags (tailor_id);
CREATE INDEX IF NOT EXISTS idx_stitchd_customer_tags_customer
  ON stitchd_customer_tags (customer_id);
