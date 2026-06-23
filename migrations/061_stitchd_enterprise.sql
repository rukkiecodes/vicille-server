-- Migration 061: Stitchd Enterprise tier & account management (batch 17)
--
-- Enterprise is ops-onboarded with custom, invoiced pricing (no self-serve Paystack). Adds:
--   • stitchd_entitlements   — per-tenant cap/flag OVERRIDES; `resolveEntitlements()` merges
--     these over the batch-11 tier defaults (enterprise overrides win; Starter/Pro use defaults).
--   • stitchd_enterprise_accounts — account manager, contract dates, custom price, terms.
--   • stitchd_enterprise_invoices — the enterprise's bill FROM Stitchd (B2B), reconciled manually.
--   • stitchd_locations + stitchd_team_members.location_id — optional multi-location (behind flag).
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–16.

-- ── Per-tenant entitlement overrides ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_entitlements (
  tailor_id              UUID PRIMARY KEY REFERENCES tailors(id) ON DELETE CASCADE,
  ai_monthly_cap         INTEGER,            -- override applied to every AI feature (null = no override; -1 = unlimited)
  team_seat_cap          INTEGER,            -- override (null = no override; -1 = unlimited)
  multi_location_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  features               JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Enterprise account / contract ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_enterprise_accounts (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id               UUID NOT NULL UNIQUE REFERENCES tailors(id) ON DELETE CASCADE,
  account_manager_name    TEXT,
  account_manager_contact TEXT,
  contract_start          DATE,
  contract_end            DATE,
  custom_price_amount     NUMERIC(12,2),
  currency                TEXT NOT NULL DEFAULT 'NGN',
  billing_terms           TEXT,             -- e.g. net-30
  billing_cycle           TEXT NOT NULL DEFAULT 'monthly',
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── B2B invoices (enterprise's bill from Stitchd) ──────────────────────────────
CREATE TABLE IF NOT EXISTS stitchd_enterprise_invoices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id    UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  number       TEXT,
  period_start DATE,
  period_end   DATE,
  amount       NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'NGN',
  status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','void')),
  issued_at    TIMESTAMPTZ,
  due_at       TIMESTAMPTZ,
  paid_at      TIMESTAMPTZ,
  pdf_url      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_enterprise_invoices_tailor
  ON stitchd_enterprise_invoices (tailor_id, created_at DESC);

-- ── Multi-location (optional, behind multi_location_enabled) ────────────────────
CREATE TABLE IF NOT EXISTS stitchd_locations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id  UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  address    TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stitchd_locations_tailor ON stitchd_locations (tailor_id);

ALTER TABLE stitchd_team_members
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES stitchd_locations(id) ON DELETE SET NULL;
