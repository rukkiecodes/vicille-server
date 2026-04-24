-- Migration 034: Allow affiliate-sourced rows in referral_invites
-- inviter_user_id can be NULL when source_type = 'affiliate'
-- invite_code gets a generated default so affiliate inserts don't need to supply one

ALTER TABLE referral_invites
  ALTER COLUMN inviter_user_id DROP NOT NULL;

ALTER TABLE referral_invites
  ALTER COLUMN invite_code DROP NOT NULL;
