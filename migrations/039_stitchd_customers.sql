-- Migration 039: Stitchd customers (+ tags)  (STUB — body deferred to batch 01)
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "Customer" / "CustomerTag":
-- The tailor OWNS their customers — records that exist only inside that tailor's tenant
-- and are invisible to every other tailor. Distinct from Vicelle's own `users`.
--
-- Tables / columns that WILL be created in batch 01 (per doc 01 §2):
--   stitchd_customers:
--     id, tailor_id (tenant key), name, phone, secondary_phone, email?, profile_photo?,
--     full_body_photo?, dob?, address?, landmark?, notes (free text), created_at, updated_at.
--   stitchd_customer_tags (child of customer):
--     id, customer_id, tailor_id, label, color  (color-coded labels: VIP, slow payer, …).
--
-- The CREATE TABLE bodies are INTENTIONALLY deferred to batch 01. This stub only reserves
-- the migration number and applies cleanly as a safe no-op.

SELECT 1;
