import { GraphQLError } from 'graphql';

/**
 * Stitchd tenant-isolation guard (batch-00 PLACEHOLDER).
 *
 * Per doc 01 (Architecture & Multi-tenancy) §3, tenant isolation is enforced at
 * three layers: (1) the auth context resolves the authenticated tailor and exposes
 * `ctx.tailorId`; (2) every Stitchd resolver/model is scoped by `tailorId`; (3)
 * PostgreSQL RLS keyed to a per-request session GUC (`app.tailor_id`) is the backstop.
 *
 * This file implements only layer 1's guard, as a clearly-marked stub:
 *
 *   - The GraphQL context (see `src/graphql/index.js`) currently resolves only a
 *     generic `context.user` ({ id, role, email, type }) from the JWT. There is NOT
 *     yet a dedicated `context.tailorId`. So this placeholder DERIVES the tenant id
 *     defensively: it accepts an already-resolved `context.tailorId`/`context.tailor.id`
 *     if present (forward-compatible with batch 01), otherwise falls back to the
 *     tailor user's own id when `context.user` is a tailor principal.
 *
 *   - The FULL implementation — per-request `ctx.tailorId` resolution in the Apollo
 *     context factory plus wiring the RLS GUC (`SET app.tailor_id`) on the pooled
 *     connection — is deferred to batch 01 / BE-tenancy (doc 01 §3, §6).
 *
 * NOTE: This deliberately does NOT reuse `requireTailor` from `helpers.js`. That helper
 * returns the whole authenticated user for the Vicelle internal flows; the Stitchd
 * guard instead returns the resolved tenant id (`tailorId`) that every Stitchd model
 * method will take as its first argument.
 */

/**
 * Resolve the authenticated tailor's tenant id from the GraphQL context, or throw.
 *
 * @param {object} context - the resolved Apollo context for the request.
 * @returns {string} tailorId - the tenant key to scope every Stitchd query/mutation by.
 * @throws {GraphQLError} UNAUTHENTICATED when no tailor principal can be resolved.
 */
export const requireTailor = (context) => {
  // Forward-compatible: batch 01 will populate one of these directly in the context.
  const explicitTailorId =
    context?.tailorId || context?.tailor?.id || null;
  if (explicitTailorId) {
    return explicitTailorId;
  }

  // Batch-00 fallback: derive the tenant id from the generic tailor user principal.
  const user = context?.user;
  const isTailor =
    user && (user.role === 'tailor' || user.type === 'tailor');
  if (isTailor && user.id) {
    return user.id;
  }

  throw new GraphQLError('Tailor authentication required', {
    extensions: { code: 'UNAUTHENTICATED' },
  });
};

/**
 * Permission-enforcing guard (batch 16). Resolves the tenant via `requireTailor`, then:
 *   - OWNER session (no `memberId`): implicitly holds every permission → allowed.
 *   - MEMBER session: loads the active member row for (tenant, memberId), computes its
 *     effective permissions, and throws FORBIDDEN if `perm` isn't held. A removed/suspended
 *     member fails as UNAUTHENTICATED (access revoked immediately).
 * Returns `{ tailorId, memberId, role }`.
 */
export const requirePermission = async (context, perm) => {
  const tailorId = requireTailor(context);
  const memberId = context?.memberId || null;
  if (!memberId) return { tailorId, memberId: null, role: 'owner' };

  const { query } = await import('../infrastructure/database/postgres.js');
  const { effectivePermissions } = await import('../modules/stitchd/stitchdPermissions.js');
  const { rows } = await query(
    'SELECT role, permissions, status FROM stitchd_team_members WHERE id=$1 AND tailor_id=$2',
    [memberId, tailorId]
  );
  const m = rows[0];
  if (!m || m.status !== 'active') {
    throw new GraphQLError('Your access has changed. Please sign in again.', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  const perms = effectivePermissions(m.role, m.permissions);
  if (!perms.includes(perm)) {
    throw new GraphQLError("You don't have permission to do that.", { extensions: { code: 'FORBIDDEN', reason: 'PERMISSION_DENIED', permission: perm } });
  }
  return { tailorId, memberId, role: m.role };
};

export default requireTailor;
