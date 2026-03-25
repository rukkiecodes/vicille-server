-- Migration 022: Fix account_type constraint and add default so client signups work
-- Live DB has CHECK (account_type IN ('student','business')) with no default.
-- Vicelle client self-signup uses account_type='client' which was not in the constraint.

-- Drop the old restrictive constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_account_type_check;

-- Add a broader constraint that covers all valid types
ALTER TABLE users ADD CONSTRAINT users_account_type_check
  CHECK (account_type IN ('client', 'tailor', 'student', 'business', 'admin'));

-- Set a default so INSERT without account_type doesn't fail
ALTER TABLE users ALTER COLUMN account_type SET DEFAULT 'client';
