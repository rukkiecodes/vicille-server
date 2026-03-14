-- 017_studio_photos.sql
-- Adds a JSONB column to store up to 4 studio (full-body) photo URLs per user.
-- These photos are used by the virtual try-on service.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS studio_photos JSONB DEFAULT '[]';
