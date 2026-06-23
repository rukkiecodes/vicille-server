-- Migration 060: Stitchd team members & sub-user RBAC (batch 16)
--
-- Lets a Pro/Enterprise tailor add staff under ONE tenant with limited permissions. The owner
-- is the existing `tailors` row (implicit role 'owner' — no member row). Members are invited by
-- phone; the invite is the member row with status='invited' + invite_token, accepted implicitly
-- on the invitee's first OTP login (no separate invites table — kept lean for P3 v1).
--
-- Auth: a member's OTP login issues a token carrying the OWNER's tailor_id + member_id + role,
-- so requireTailor resolves the owner tenant and requirePermission reads the member's perms.
--
-- Idempotent: safe to re-run. RLS deferred consistent with batches 01–15.

CREATE TABLE IF NOT EXISTS stitchd_team_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tailor_id     UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,  -- the tenant (owner)
  user_id       UUID,                                -- the member's own tailors.id, set on accept
  name          TEXT,
  phone         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'staff'
                  CHECK (role IN ('owner','manager','staff','viewer')),
  permissions   JSONB,                               -- override set (null = role defaults)
  status        TEXT NOT NULL DEFAULT 'invited'
                  CHECK (status IN ('invited','active','suspended','removed')),
  working_hours JSONB,
  invite_token  TEXT,
  invited_by    UUID,
  invited_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One member record per phone per tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitchd_team_member_tenant_phone
  ON stitchd_team_members (tailor_id, phone);
CREATE INDEX IF NOT EXISTS idx_stitchd_team_members_tenant_status
  ON stitchd_team_members (tailor_id, status);
-- Login lookup: find an active/invited membership by phone.
CREATE INDEX IF NOT EXISTS idx_stitchd_team_members_phone
  ON stitchd_team_members (phone) WHERE status IN ('invited','active');
