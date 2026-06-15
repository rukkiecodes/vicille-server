-- Migration 041: Stitchd orders (+ items)  (STUB — body deferred to batch 01)
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "Order":
-- Distinct from the existing Vicelle `orders` module — Stitchd orders have NO QC gate
-- and NO admin assignment. Rooted at the tailor's own customer.
--
-- Tables / columns that WILL be created in batch 01 (per doc 01 §2):
--   stitchd_orders:
--     id, tailor_id (tenant key), customer_id, created_on, due_date,
--     status (New|In Progress|Ready|Delivered|Closed), linked_measurement_set_id,
--     total_price, deposit_paid, balance_owed, materials[] (checklist),
--     photos[] (inspiration/fabric/progress/completed, timestamped),
--     voice_notes[], source ('direct'|'style-u').
--   stitchd_order_items:
--     garment_type, quantity, fabric_notes, unit_price, instructions.
--
-- The CREATE TABLE bodies are INTENTIONALLY deferred to batch 01. This stub only reserves
-- the migration number and applies cleanly as a safe no-op.

SELECT 1;
