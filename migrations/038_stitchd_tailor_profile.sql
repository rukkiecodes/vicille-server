-- Migration 038: Stitchd tenant / tailor profile  (STUB — body deferred to batch 01)
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "Tailor (Tenant)" and the batch-00
-- placement decision (§2 / batch-00 Risks): Stitchd tenant fields live in a SEPARATE
-- `stitchd_tailor_profile` table keyed to tailor_id, rather than an `app_origin` flag on
-- the shared hot `tailors` table. This keeps Stitchd-only columns off Vicelle's hot path.
--
-- Columns that WILL be created in batch 01 (per doc 01 §2):
--   id, tailor_id (FK -> tailors, tenant key, UNIQUE), business_name, owner_name,
--   location_city, location_area,
--   subscription_status (trial|active|past_due|canceled), tier (starter|pro|enterprise),
--   billing_cycle, trial_ends_at,
--   payout_bank_account (reuse existing tailor bank fields),
--   settings JSONB (currency, measurement unit pref, working hours, notification prefs),
--   created_at, updated_at.
--
-- The CREATE TABLE body is INTENTIONALLY deferred to batch 01. This stub only reserves
-- the migration number and applies cleanly as a safe no-op.

SELECT 1;
