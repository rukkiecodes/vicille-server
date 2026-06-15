-- Migration 042: Stitchd payments  (STUB — body deferred to batch 01)
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "Payment":
-- Reuses the existing payments/wallet/payouts modules and the Python `payments` service
-- for in-app collection (batch 09) and weekly settlement (batch 10).
--
-- Table / columns that WILL be created in batch 01 (per doc 01 §2):
--   stitchd_payments:
--     id, tailor_id (tenant key), customer_id, order_id?,
--     type ('cash_recorded'|'in_app_collected'), amount, currency, paid_on,
--     method (cash|card|transfer|ussd), reference?,
--     settlement_status (pending_payout|paid_out).
--
-- The CREATE TABLE body is INTENTIONALLY deferred to batch 01. This stub only reserves
-- the migration number and applies cleanly as a safe no-op.

SELECT 1;
