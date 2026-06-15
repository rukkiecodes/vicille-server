-- Migration 043: Stitchd conversation threads (+ messages)  (STUB — body deferred to batch 01)
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "ConversationThread":
-- A thread is linked to a customer. Stitchd logs the messages IT sends; WhatsApp is the
-- transport (deep links), so this is a local message log, not a chat transport.
--
-- Tables / columns that WILL be created in batch 01 (per doc 01 §2):
--   stitchd_threads:
--     id, tailor_id (tenant key), customer_id, created_at, updated_at.
--   stitchd_messages:
--     id, thread_id, tailor_id (tenant key), kind (text|voice|photo),
--     body | media_url, direction, ts.
--
-- The CREATE TABLE bodies are INTENTIONALLY deferred to batch 01. This stub only reserves
-- the migration number and applies cleanly as a safe no-op.

SELECT 1;
