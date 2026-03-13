-- Migration 013: align measurements table with current backend measurement model

ALTER TABLE measurements
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS measurements JSONB,
  ADD COLUMN IF NOT EXISTS fit TEXT,
  ADD COLUMN IF NOT EXISTS version INT,
  ADD COLUMN IF NOT EXISTS previous_version UUID,
  ADD COLUMN IF NOT EXISTS delta JSONB,
  ADD COLUMN IF NOT EXISTS queued_for_cycle INT,
  ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;

-- Backfill source and timing metadata
UPDATE measurements
SET source = COALESCE(source, 'self'),
    fit = COALESCE(fit, 'regular'),
    captured_at = COALESCE(captured_at, created_at)
WHERE source IS NULL OR fit IS NULL OR captured_at IS NULL;

-- Backfill version by user chronology if missing
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS rn
  FROM measurements
)
UPDATE measurements m
SET version = r.rn
FROM ranked r
WHERE m.id = r.id AND m.version IS NULL;

-- Backfill structured measurements payload from legacy columns if missing
UPDATE measurements
SET measurements = jsonb_strip_nulls(
  jsonb_build_object(
    'neck', neck,
    'chest', chest,
    'waist', waist,
    'hips', hips,
    'shoulder', shoulder_width,
    'sleeveLength', sleeve_length,
    'inseam', inseam,
    'thigh', thigh,
    'wrist', wrist,
    'topLength', back_length,
    'weight', weight
  )
)
WHERE measurements IS NULL;

-- Keep existing captured_by constraint valid by normalizing unknown values
UPDATE measurements
SET captured_by = 'user'
WHERE captured_by IS NULL OR captured_by NOT IN ('user', 'tailor', 'vicelle_staff');

ALTER TABLE measurements
  ALTER COLUMN source SET NOT NULL,
  ALTER COLUMN source SET DEFAULT 'self',
  ALTER COLUMN fit SET DEFAULT 'regular',
  ALTER COLUMN version SET NOT NULL,
  ALTER COLUMN version SET DEFAULT 1,
  ALTER COLUMN measurements SET NOT NULL,
  ALTER COLUMN measurements SET DEFAULT '{}'::jsonb,
  ALTER COLUMN captured_at SET DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_measurements_user_version ON measurements(user_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_captured_at ON measurements(captured_at DESC);
