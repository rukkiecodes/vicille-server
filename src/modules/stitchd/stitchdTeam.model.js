/**
 * StitchdTeamModel — team members & sub-user RBAC (batch 16).
 *
 * Owner-managed staff under one tenant. Gated to Pro/Enterprise (batch 11 entitlements) with a
 * per-tier seat cap. Invite = a member row with status='invited' + token; accepted implicitly
 * on the invitee's first OTP login. Tenant isolation (doc 01 §3): scoped by `tailorId`.
 */
import crypto from 'crypto';
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import { effectivePermissions, ROLES } from './stitchdPermissions.js';
import { hasFeature } from './stitchdEntitlements.js';
import StitchdEnterpriseModel from './stitchdEnterprise.model.js';
import termii from '../../services/termii.service.js';
import logger from '../../core/logger/index.js';

export function normalizePhone(raw) {
  const d = String(raw || '').replace(/[^\d]/g, '');
  return d.length ? d : null;
}

function format(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name || null,
    phone: row.phone,
    role: row.role,
    status: row.status,
    permissions: effectivePermissions(row.role, row.permissions),
    workingHours: row.working_hours || null,
    invitedAt: row.invited_at,
    acceptedAt: row.accepted_at || null,
  };
}

const StitchdTeamModel = {
  format,

  /** An active/invited membership for a phone (active preferred) — used by OTP login. */
  async membershipByPhone(phone) {
    const p = normalizePhone(phone);
    if (!p) return null;
    const { rows } = await query(
      `SELECT * FROM stitchd_team_members
        WHERE phone=$1 AND status IN ('invited','active')
        ORDER BY (status='active') DESC, invited_at DESC LIMIT 1`,
      [p]
    );
    return rows[0] || null;
  },

  /** Mark an invited member active on first login (returns the row). */
  async acceptOnLogin(memberRow) {
    if (memberRow.status === 'active') return memberRow;
    const { rows } = await query(
      `UPDATE stitchd_team_members SET status='active', accepted_at=now(), updated_at=now()
        WHERE id=$1 RETURNING *`,
      [memberRow.id]
    );
    return rows[0];
  },

  /** Seat usage vs the EFFECTIVE cap (tier default or enterprise override; ∞ → null). */
  async seatInfo(tailorId, tier) {
    const cap = (await StitchdEnterpriseModel.resolveEntitlements(tailorId)).teamSeatCap; // owner counts as a seat
    const { rows } = await query(
      `SELECT COUNT(*)::int AS n FROM stitchd_team_members WHERE tailor_id=$1 AND status IN ('invited','active')`,
      [tailorId]
    );
    const used = (rows[0]?.n || 0) + 1; // +1 for the owner
    return { cap: cap === Infinity ? null : cap, used, available: cap === Infinity ? null : Math.max(0, cap - used) };
  },

  async listMembers(tailorId) {
    const { rows } = await query(
      `SELECT * FROM stitchd_team_members WHERE tailor_id=$1 AND status <> 'removed' ORDER BY invited_at ASC`,
      [tailorId]
    );
    return rows.map(format);
  },

  async findById(tailorId, id) {
    const { rows } = await query('SELECT * FROM stitchd_team_members WHERE tailor_id=$1 AND id=$2', [tailorId, id]);
    return rows[0] ? format(rows[0]) : null;
  },

  /**
   * Invite a member by phone. Gated to Pro+ with the tier seat cap. Idempotent on
   * (tailor, phone) — re-inviting a removed member reactivates the invite.
   */
  async invite(tailorId, tier, { phone, name, role = 'staff' }) {
    if (!hasFeature(tier, 'teamMembers')) {
      throw new GraphQLError('Team members are available on the Pro plan.', { extensions: { code: 'FORBIDDEN', reason: 'UPGRADE_REQUIRED' } });
    }
    const p = normalizePhone(phone);
    if (!p) throw new GraphQLError('A valid phone number is required.', { extensions: { code: 'BAD_USER_INPUT' } });
    if (!ROLES.includes(role) || role === 'owner') role = 'staff';

    const seats = await this.seatInfo(tailorId, tier);
    if (seats.available != null && seats.available <= 0) {
      throw new GraphQLError('You’ve reached your team size limit for this plan.', { extensions: { code: 'FORBIDDEN', reason: 'SEAT_LIMIT' } });
    }

    const token = crypto.randomBytes(8).toString('hex');
    const { rows } = await query(
      `INSERT INTO stitchd_team_members (tailor_id, name, phone, role, status, invite_token, invited_by)
       VALUES ($1,$2,$3,$4,'invited',$5,$1)
       ON CONFLICT (tailor_id, phone) DO UPDATE
         SET status='invited', role=EXCLUDED.role, name=COALESCE(EXCLUDED.name, stitchd_team_members.name),
             invite_token=EXCLUDED.invite_token, invited_at=now(), updated_at=now()
       RETURNING *`,
      [tailorId, name || null, p, role, token]
    );
    await this._sendInvite(p);
    return format(rows[0]);
  },

  async _sendInvite(phone) {
    try {
      await termii.sendSms({ to: phone, message: 'You’ve been invited to a team on Stitchd. Download Stitchd and sign in with this phone number to join.' });
    } catch (e) {
      logger.error('[team] invite SMS failed:', e.message);
    }
  },

  async resend(tailorId, memberId) {
    const { rows } = await query(`SELECT phone FROM stitchd_team_members WHERE tailor_id=$1 AND id=$2 AND status='invited'`, [tailorId, memberId]);
    if (!rows[0]) throw new GraphQLError('Invite not found.', { extensions: { code: 'NOT_FOUND' } });
    await this._sendInvite(rows[0].phone);
    return true;
  },

  async updateRole(tailorId, memberId, role) {
    if (!ROLES.includes(role) || role === 'owner') throw new GraphQLError('Invalid role.', { extensions: { code: 'BAD_USER_INPUT' } });
    const { rows } = await query(
      `UPDATE stitchd_team_members SET role=$3, permissions=NULL, updated_at=now()
        WHERE tailor_id=$1 AND id=$2 AND status <> 'removed' RETURNING *`,
      [tailorId, memberId, role]
    );
    if (!rows[0]) throw new GraphQLError('Member not found.', { extensions: { code: 'NOT_FOUND' } });
    return format(rows[0]);
  },

  async setPermissions(tailorId, memberId, permissions) {
    const { rows } = await query(
      `UPDATE stitchd_team_members SET permissions=$3::jsonb, updated_at=now()
        WHERE tailor_id=$1 AND id=$2 AND status <> 'removed' RETURNING *`,
      [tailorId, memberId, JSON.stringify(permissions || [])]
    );
    if (!rows[0]) throw new GraphQLError('Member not found.', { extensions: { code: 'NOT_FOUND' } });
    return format(rows[0]);
  },

  async setWorkingHours(tailorId, memberId, workingHours) {
    const { rows } = await query(
      `UPDATE stitchd_team_members SET working_hours=$3::jsonb, updated_at=now()
        WHERE tailor_id=$1 AND id=$2 AND status <> 'removed' RETURNING *`,
      [tailorId, memberId, JSON.stringify(workingHours || {})]
    );
    if (!rows[0]) throw new GraphQLError('Member not found.', { extensions: { code: 'NOT_FOUND' } });
    return format(rows[0]);
  },

  async setStatus(tailorId, memberId, status) {
    const { rows } = await query(
      `UPDATE stitchd_team_members SET status=$3, updated_at=now()
        WHERE tailor_id=$1 AND id=$2 RETURNING *`,
      [tailorId, memberId, status]
    );
    if (!rows[0]) throw new GraphQLError('Member not found.', { extensions: { code: 'NOT_FOUND' } });
    return format(rows[0]);
  },

  /** Effective permissions for the caller (owner → all). */
  async myPermissions(tailorId, memberId) {
    if (!memberId) return { role: 'owner', permissions: effectivePermissions('owner') };
    const { rows } = await query('SELECT role, permissions, status FROM stitchd_team_members WHERE tailor_id=$1 AND id=$2', [tailorId, memberId]);
    const m = rows[0];
    if (!m || m.status !== 'active') return { role: 'viewer', permissions: [] };
    return { role: m.role, permissions: effectivePermissions(m.role, m.permissions) };
  },
};

export default StitchdTeamModel;
