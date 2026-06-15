-- Migration 044: Stitchd Row-Level Security (RLS)  (STUB — body deferred to batch 01)
--
-- Per doc 01 (Architecture & Multi-tenancy) §3 (layer 3, the DB backstop):
-- Enable PostgreSQL RLS on ALL `stitchd_*` tables with a policy keyed to a per-request
-- session GUC (e.g. `app.tailor_id`) set per request from the pool. This is the backstop
-- if a resolver ever forgets to scope a query by tailor_id.
--
-- What WILL be created in batch 01 (per doc 01 §3, §6), once the tables above exist:
--   For each stitchd_* table:
--     ALTER TABLE <t> ENABLE ROW LEVEL SECURITY;
--     CREATE POLICY <t>_tenant_isolation ON <t>
--       USING (tailor_id = current_setting('app.tailor_id', true)::uuid);
--   Plus verification that the Supabase pool supports per-request `SET app.tailor_id`.
--
-- The policy bodies are INTENTIONALLY deferred to batch 01 (they depend on the tables
-- created by 038–043). This stub only reserves the migration number and applies cleanly
-- as a safe no-op.

SELECT 1;
