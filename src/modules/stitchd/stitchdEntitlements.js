/**
 * Stitchd tier entitlements — the SINGLE source of truth for what each plan unlocks
 * (batch 11). AI batches (07/12) read the AI caps here via StitchdAiUsageModel; the team
 * gate (batch 16) reads the feature flags / slot counts; billing surfaces prices.
 *
 * Kept as code constants (not a DB table) so the limits are versioned with the code and
 * every consumer imports the same numbers. `Infinity` = unlimited (mapped to null at the
 * GraphQL boundary). Paystack plan codes come from env so plans are created once per
 * environment without code changes.
 */
import { GraphQLError } from 'graphql';

export const TIERS = ['starter', 'pro', 'enterprise'];

/** Monthly NGN price per tier (spec §13). Enterprise is custom (P3). */
const PRICE_NGN = { starter: 5000, pro: 12000, enterprise: 0 };

/** Per-tier entitlements. `aiCaps` keys match `stitchd_ai_usage.feature`. */
const ENTITLEMENTS = {
  starter: {
    aiCaps:          { transcription: 30, fit_consultant: 20, brief: 20, design: 5 },
    teamMemberSlots: 1,
    features:        { teamMembers: false, designGenerator: true, briefExtractor: true, socialPost: false },
  },
  pro: {
    aiCaps:          { transcription: 500, fit_consultant: 300, brief: 200, design: 100 },
    teamMemberSlots: 5,
    features:        { teamMembers: true, designGenerator: true, briefExtractor: true, socialPost: true },
  },
  enterprise: {
    aiCaps:          { transcription: Infinity, fit_consultant: Infinity, brief: Infinity, design: Infinity },
    teamMemberSlots: Infinity,
    features:        { teamMembers: true, designGenerator: true, briefExtractor: true, socialPost: true },
  },
};

function normalizeTier(tier) {
  return TIERS.includes(tier) ? tier : 'starter';
}

/** Full entitlement object for a tier (defaults to starter). */
export function entitlementsFor(tier) {
  const t = normalizeTier(tier);
  return { tier: t, priceNgn: PRICE_NGN[t], ...ENTITLEMENTS[t] };
}

/** Monthly AI cap for a (tier, feature) pair; 0 if the feature is unknown (fail-closed). */
export function aiCapFor(tier, feature) {
  const caps = ENTITLEMENTS[normalizeTier(tier)].aiCaps;
  return caps[feature] ?? 0;
}

/** True if the tier unlocks a boolean feature flag. */
export function hasFeature(tier, feature) {
  return Boolean(ENTITLEMENTS[normalizeTier(tier)].features[feature]);
}

/** Team-member slot count for a tier. */
export function teamSlotsFor(tier) {
  return ENTITLEMENTS[normalizeTier(tier)].teamMemberSlots;
}

/**
 * Throw FORBIDDEN (with an upgrade hint) if a tier does not include a boolean feature.
 * Used by tier-locked gates (team settings, Pro-only AI tools).
 */
export function assertEntitlement(tier, feature) {
  if (!hasFeature(tier, feature)) {
    throw new GraphQLError('That feature is available on a higher plan.', {
      extensions: { code: 'FORBIDDEN', reason: 'TIER_LOCKED', feature, tier: normalizeTier(tier) },
    });
  }
}

/** Paystack plan code for a tier from env (created once per environment). */
export function planCodeFor(tier) {
  const t = normalizeTier(tier);
  if (t === 'pro') return process.env.STITCHD_PAYSTACK_PLAN_PRO || '';
  if (t === 'starter') return process.env.STITCHD_PAYSTACK_PLAN_STARTER || '';
  return '';
}

export default { TIERS, entitlementsFor, aiCapFor, hasFeature, teamSlotsFor, assertEntitlement, planCodeFor };
