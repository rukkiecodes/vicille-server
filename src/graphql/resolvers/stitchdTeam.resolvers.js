/**
 * Stitchd team & RBAC resolvers (batch 16). Management mutations require the `team:manage`
 * permission (owner holds it implicitly) and are audited. Tenant resolved via `requireTailor`/
 * `requirePermission`; the model scopes by tailorId and gates on tier + seat cap.
 */
import { GraphQLError } from 'graphql';
import StitchdTeamModel from '../../modules/stitchd/stitchdTeam.model.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';
import { PERMISSIONS, PERMISSION_GROUPS } from '../../modules/stitchd/stitchdPermissions.js';
import { requireTailor, requirePermission } from '../stitchd.guard.js';
import AuditModel from '../../modules/audit/audit.model.js';
import logger from '../../core/logger/index.js';

async function tierFor(tailorId) {
  const profile = await StitchdTailorProfileModel.findByTailorId(tailorId);
  return profile?.tier || 'starter';
}

async function audit(actor, action, targetId, meta = {}) {
  try {
    await AuditModel.logEvent({
      event_type: action,
      event_category: 'stitchd_team',
      actor_id: actor.memberId || actor.tailorId,
      actor: actor.memberId ? `member:${actor.memberId}` : `owner:${actor.tailorId}`,
      target_type: 'stitchd_team_member',
      target_id: targetId || null,
      target: JSON.stringify(meta),
    });
  } catch (e) { logger.error('[team] audit write failed:', e.message); }
}

function wrap(e, msg) {
  if (e instanceof GraphQLError) return e;
  logger.error(`${msg}:`, e);
  return new GraphQLError(`${msg}. Please try again.`, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
}

const stitchdTeamResolvers = {
  Query: {
    stitchdTeamMembers: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdTeamModel.listMembers(tailorId); }
      catch (e) { throw wrap(e, 'Could not load your team'); }
    },
    stitchdMyPermissions: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdTeamModel.myPermissions(tailorId, ctx?.memberId || null); }
      catch (e) { throw wrap(e, 'Could not load your permissions'); }
    },
    stitchdTeamSeats: async (_p, _a, ctx) => {
      const tailorId = requireTailor(ctx);
      try { return await StitchdTeamModel.seatInfo(tailorId, await tierFor(tailorId)); }
      catch (e) { throw wrap(e, 'Could not load seats'); }
    },
    stitchdPermissionCatalog: async (_p, _a, ctx) => {
      requireTailor(ctx);
      return PERMISSION_GROUPS.map((g) => ({
        label: g.label,
        permissions: g.perms.map((k) => ({ key: k, label: PERMISSIONS[k] || k })),
      }));
    },
  },

  Mutation: {
    inviteStitchdTeamMember: async (_p, { phone, name, role }, ctx) => {
      const actor = await requirePermission(ctx, 'team:manage');
      try {
        const member = await StitchdTeamModel.invite(actor.tailorId, await tierFor(actor.tailorId), { phone, name, role });
        await audit(actor, 'team.invite', member.id, { phone, role });
        return member;
      } catch (e) { throw wrap(e, 'Could not send the invite'); }
    },
    updateStitchdTeamMemberRole: async (_p, { id, role }, ctx) => {
      const actor = await requirePermission(ctx, 'team:manage');
      try { const m = await StitchdTeamModel.updateRole(actor.tailorId, id, role); await audit(actor, 'team.role', id, { role }); return m; }
      catch (e) { throw wrap(e, 'Could not update the role'); }
    },
    setStitchdTeamMemberPermissions: async (_p, { id, permissions }, ctx) => {
      const actor = await requirePermission(ctx, 'team:manage');
      try { const m = await StitchdTeamModel.setPermissions(actor.tailorId, id, permissions); await audit(actor, 'team.permissions', id, { count: permissions.length }); return m; }
      catch (e) { throw wrap(e, 'Could not update permissions'); }
    },
    setStitchdTeamMemberWorkingHours: async (_p, { id, workingHours }, ctx) => {
      const actor = await requirePermission(ctx, 'team:manage');
      try { return await StitchdTeamModel.setWorkingHours(actor.tailorId, id, workingHours); }
      catch (e) { throw wrap(e, 'Could not save working hours'); }
    },
    suspendStitchdTeamMember: async (_p, { id, suspended }, ctx) => {
      const actor = await requirePermission(ctx, 'team:manage');
      try { const m = await StitchdTeamModel.setStatus(actor.tailorId, id, suspended ? 'suspended' : 'active'); await audit(actor, suspended ? 'team.suspend' : 'team.reactivate', id); return m; }
      catch (e) { throw wrap(e, 'Could not update the member'); }
    },
    removeStitchdTeamMember: async (_p, { id }, ctx) => {
      const actor = await requirePermission(ctx, 'team:manage');
      try { await StitchdTeamModel.setStatus(actor.tailorId, id, 'removed'); await audit(actor, 'team.remove', id); return true; }
      catch (e) { throw wrap(e, 'Could not remove the member'); }
    },
    resendStitchdTeamInvite: async (_p, { id }, ctx) => {
      const actor = await requirePermission(ctx, 'team:manage');
      try { return await StitchdTeamModel.resend(actor.tailorId, id); }
      catch (e) { throw wrap(e, 'Could not resend the invite'); }
    },
  },
};

export default stitchdTeamResolvers;
