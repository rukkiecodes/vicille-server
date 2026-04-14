-- Migration 030: store invited friend's name on referral invites

ALTER TABLE referral_invites
  ADD COLUMN IF NOT EXISTS invited_name TEXT;
