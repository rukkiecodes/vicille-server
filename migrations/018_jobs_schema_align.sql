-- ============================================================
-- 018: Align jobs table to match the Node.js JobModel schema
-- Adds all missing columns and updates the status CHECK constraint
-- ============================================================

-- Add missing columns (safe with IF NOT EXISTS)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_tag           TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_id              UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS order_item_ids       UUID[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_by          TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assignment_type      TEXT DEFAULT 'manual';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS measurements         JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS stylist_instructions TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notes                TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS priority             TEXT DEFAULT 'normal';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS materials_required   JSONB DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS materials_issued     BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS materials_received_by TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS status_history       JSONB DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completion_proof     JSONB;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS qc_review_id         UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS commission           NUMERIC DEFAULT 0;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS payout_id            UUID;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_paid              BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS reassignments        JSONB DEFAULT '[]';
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_flagged           BOOLEAN DEFAULT FALSE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS flag_reason          TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS flagged_by           TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS resolved_at          TIMESTAMPTZ;

-- Drop the old status CHECK constraint (auto-named by Postgres)
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Add updated status CHECK constraint that includes all statuses
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'unassigned', 'assigned', 'declined',
    'materials_pending', 'materials_received',
    'in_progress', 'ready_for_qc', 'under_qc',
    'completed', 'qc_approved', 'qc_rejected', 'reassigned'
  ));

-- Create indexes for the new lookup columns
CREATE INDEX IF NOT EXISTS idx_jobs_user_id    ON jobs(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_client_tag ON jobs(client_tag);
CREATE INDEX IF NOT EXISTS idx_jobs_is_paid    ON jobs(is_paid);
CREATE INDEX IF NOT EXISTS idx_jobs_is_flagged ON jobs(is_flagged);
