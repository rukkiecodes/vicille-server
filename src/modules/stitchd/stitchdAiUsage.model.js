/**
 * StitchdAiUsageModel — per-tenant AI usage metering (doc 01 §7).
 *
 * Backs the tier-capped allowance for AI features. Transcription (batch 03) is the first
 * consumer; design/fit/etc. (batch 07/12) reuse the same table via the `feature` column.
 *
 * Flow used by resolvers: call `assertWithinCap` BEFORE the upstream (paid) call so an
 * over-cap tenant is rejected without spending; call `record` only AFTER the call
 * succeeds, so failed calls don't consume the allowance.
 *
 * Tenant isolation (doc 01 §3, layer 2): every method is keyed by `tailorId`.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import { aiCapFor } from './stitchdEntitlements.js';
import StitchdEnterpriseModel from './stitchdEnterprise.model.js';

// Tier AI caps now live in the entitlements engine (batch 11) so billing + AI batches share
// one source of truth. `capFor` delegates to `aiCapFor(tier, feature)`.

/** Human label per feature for cap-reached messaging. */
const LABELS = {
  transcription: 'voice transcription',
  fit_consultant: 'AI Fit Consultant',
  brief: 'AI Brief Extractor',
  design: 'AI Design Generator',
};

/** Calendar-month bucket 'YYYY-MM' (UTC) the usage counts against. */
function currentPeriod(now = new Date()) {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

const StitchdAiUsageModel = {
  currentPeriod,

  /** Cap for a (feature, tier) pair; 0 if the feature is unknown (fail-closed). */
  capFor(feature, tier) {
    return aiCapFor(tier, feature);
  },

  /** Total units consumed by this tenant for a feature in the given period. */
  async usedThisPeriod(tailorId, feature, period = currentPeriod()) {
    const { rows } = await query(
      `SELECT COALESCE(SUM(units), 0)::int AS used
         FROM stitchd_ai_usage
        WHERE tailor_id = $1 AND feature = $2 AND period = $3`,
      [tailorId, feature, period]
    );
    return rows[0]?.used || 0;
  },

  /**
   * Throw FORBIDDEN if the tenant is at/over its cap for this feature this period.
   * Returns { used, cap, remaining } when allowed.
   */
  async assertWithinCap(tailorId, feature, tier) {
    // Effective cap = tier default with any per-tenant override (batch 17 enterprise wins).
    const cap = (await StitchdEnterpriseModel.resolveEntitlements(tailorId)).aiCap(feature);
    if (cap === Infinity) return { used: 0, cap: Infinity, remaining: Infinity };
    const period = currentPeriod();
    const used = await this.usedThisPeriod(tailorId, feature, period);
    if (used >= cap) {
      const label = LABELS[feature] || 'AI';
      throw new GraphQLError(
        `You've reached this month's ${label} limit for your plan.`,
        { extensions: { code: 'FORBIDDEN', reason: 'AI_CAP_REACHED', feature, cap, used } }
      );
    }
    return { used, cap, remaining: cap - used };
  },

  /** Record consumed units (after a successful upstream call). */
  async record(tailorId, feature, units = 1, period = currentPeriod()) {
    await query(
      `INSERT INTO stitchd_ai_usage (tailor_id, feature, units, period)
       VALUES ($1, $2, $3, $4)`,
      [tailorId, feature, units, period]
    );
  },

  /** Snapshot for surfacing "queries remaining" (batch 07 AI hub). */
  async snapshot(tailorId, feature, tier) {
    const cap = (await StitchdEnterpriseModel.resolveEntitlements(tailorId)).aiCap(feature);
    const used = await this.usedThisPeriod(tailorId, feature);
    return {
      feature,
      period: currentPeriod(),
      used,
      cap: cap === Infinity ? null : cap,
      remaining: cap === Infinity ? null : Math.max(0, cap - used),
    };
  },
};

export default StitchdAiUsageModel;
