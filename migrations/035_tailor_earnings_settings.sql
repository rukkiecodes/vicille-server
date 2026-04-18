-- Migration 035: Tailor earnings settings
-- Adds fields for expected earning per job and average job completion timeline

ALTER TABLE tailors
  ADD COLUMN IF NOT EXISTS expected_earning_per_job    NUMERIC,
  ADD COLUMN IF NOT EXISTS average_job_completion_days INT;
