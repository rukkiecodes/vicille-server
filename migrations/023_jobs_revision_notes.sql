-- Migration 023: add revision_notes to jobs for admin QC rejection feedback
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS revision_notes TEXT;
