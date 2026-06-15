-- Migration 040: Stitchd measurement sets  (STUB — body deferred to batch 01)
--
-- Per doc 01 (Architecture & Multi-tenancy) §2 "MeasurementSet":
-- Versioned, NEVER overwritten — a new set appends with its own date so history is
-- preserved. Reuses the existing `BodyMeasurements` field vocabulary as the canonical
-- key set, but stores values as flexible JSONB so unusual garments can add keys.
--
-- Table / columns that WILL be created in batch 01 (per doc 01 §2):
--   stitchd_measurement_sets:
--     id, customer_id, tailor_id (tenant key), taken_on, taken_by (tailor/team member),
--     unit (cm|inch), garment_type?, fields JSONB (neck, chest, shoulder, …),
--     photos[], voice_note?, notes, version, previous_version_id.
--
-- The CREATE TABLE body is INTENTIONALLY deferred to batch 01. This stub only reserves
-- the migration number and applies cleanly as a safe no-op.

SELECT 1;
