/**
 * StitchdAdvancedAiModel — measurement validator, customer auto-tag, social-post generator
 * (batch 19). Deterministic rules run free/offline; AI passes are metered through the doc 01 §7
 * cap guard (assertWithinCap BEFORE, record AFTER) and tier-gated where applicable.
 *
 * Tenant isolation (doc 01 §3): every method scopes by `tailorId`.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import { validateMeasurements } from './stitchdMeasurementRules.js';
import StitchdAiUsageModel from './stitchdAiUsage.model.js';
import StitchdTagModel from './stitchdTag.model.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';
import { hasFeature } from './stitchdEntitlements.js';
import { generateText } from '../../services/stitchdGenerate.service.js';
import logger from '../../core/logger/index.js';

async function tierFor(tailorId) {
  const p = await StitchdTailorProfileModel.findByTailorId(tailorId);
  return p?.tier || 'starter';
}

const StitchdAdvancedAiModel = {
  // ── Measurement validator ────────────────────────────────────────────────────
  /** Rule checks (free) + optional metered AI pass. Returns [{field, severity, message}]. */
  async validateMeasurementSet(tailorId, { setId, fields, unit, useAi = false }) {
    let f = fields || {};
    let u = unit || 'inch';
    if (setId) {
      const { rows } = await query('SELECT fields, unit FROM stitchd_measurement_sets WHERE tailor_id=$1 AND id=$2', [tailorId, setId]);
      if (rows[0]) { f = rows[0].fields || {}; u = rows[0].unit || 'inch'; }
    }
    const issues = validateMeasurements(f, u);

    if (useAi) {
      try {
        const tier = await tierFor(tailorId);
        await StitchdAiUsageModel.assertWithinCap(tailorId, 'validator', tier);
        const ai = await generateText({
          tier, json: true, maxTokens: 400, temperature: 0.2,
          system: 'You are a master tailor reviewing body measurements for plausibility. Flag only clearly suspicious values. Respond as JSON: {"issues":[{"field":"...","severity":"warning","message":"..."}]}. Empty issues if all look fine.',
          prompt: `Unit: ${u}. Measurements: ${JSON.stringify(f)}`,
        });
        await StitchdAiUsageModel.record(tailorId, 'validator', 1);
        const aiIssues = Array.isArray(ai?.issues) ? ai.issues : [];
        for (const it of aiIssues) {
          if (it?.field && it?.message && !issues.some((x) => x.field === it.field && x.message === it.message)) {
            issues.push({ field: String(it.field), severity: it.severity === 'error' ? 'error' : 'warning', message: String(it.message) });
          }
        }
      } catch (e) {
        if (e?.extensions?.code === 'FORBIDDEN') throw e; // cap reached — surface it
        logger.error('[advancedAi] validator AI pass failed:', e.message); // else fall back to rules
      }
    }
    return issues;
  },

  // ── Customer auto-tag ────────────────────────────────────────────────────────
  async _history(tailorId, customerId) {
    const { rows } = await query(
      `SELECT o.id, o.total_price, o.created_at,
              COALESCE(json_agg(DISTINCT i.garment_type) FILTER (WHERE i.garment_type IS NOT NULL), '[]') AS garments
         FROM stitchd_orders o LEFT JOIN stitchd_order_items i ON i.order_id = o.id
        WHERE o.tailor_id=$1 AND o.customer_id=$2 AND o.deleted_at IS NULL
        GROUP BY o.id`,
      [tailorId, customerId]
    );
    const orders = rows.length;
    const spend = rows.reduce((s, r) => s + (Number(r.total_price) || 0), 0);
    const garments = {};
    for (const r of rows) for (const g of r.garments || []) garments[String(g).toLowerCase()] = (garments[String(g).toLowerCase()] || 0) + 1;
    return { orders, spend, garments };
  },

  _heuristicTags({ orders, spend, garments }) {
    const out = [];
    const native = ['agbada', 'kaftan', 'senator', 'buba', 'iro', 'ankara', 'dashiki'];
    const wedding = ['wedding', 'aso ebi', 'asoebi', 'bridal', 'groom'];
    const nativeHits = Object.keys(garments).filter((g) => native.some((n) => g.includes(n))).length;
    const weddingHits = Object.keys(garments).filter((g) => wedding.some((n) => g.includes(n))).length;
    if (orders >= 5) out.push({ label: 'Regular', confidence: 0.9 });
    if (spend >= 200000) out.push({ label: 'VIP', confidence: 0.85 });
    if (nativeHits >= 2) out.push({ label: 'Native specialist', confidence: 0.8 });
    if (weddingHits >= 1) out.push({ label: 'Wedding client', confidence: 0.75 });
    return out;
  },

  /** Refresh + return suggested tags. Heuristics first; AI escalation when signal is thin. */
  async suggestCustomerTags(tailorId, customerId, { useAi = true } = {}) {
    const hist = await this._history(tailorId, customerId);
    let suggestions = this._heuristicTags(hist);

    if (useAi && suggestions.length < 2 && hist.orders > 0) {
      try {
        const tier = await tierFor(tailorId);
        await StitchdAiUsageModel.assertWithinCap(tailorId, 'autotag', tier);
        const ai = await generateText({
          tier, json: true, maxTokens: 250, temperature: 0.3,
          system: 'You label a tailoring customer with up to 3 short tags based on their order history. Respond as JSON: {"tags":[{"label":"...","confidence":0.0}]}. Use concise tags like "Native specialist", "Corporate", "Bridal".',
          prompt: `Orders: ${hist.orders}. Total spend (NGN): ${hist.spend}. Garments: ${JSON.stringify(hist.garments)}`,
        });
        await StitchdAiUsageModel.record(tailorId, 'autotag', 1);
        for (const t of (ai?.tags || [])) if (t?.label) suggestions.push({ label: String(t.label).slice(0, 40), confidence: Number(t.confidence) || 0.6, ai: true });
      } catch (e) {
        if (e?.extensions?.code === 'FORBIDDEN') throw e;
        logger.error('[advancedAi] autotag AI failed:', e.message);
      }
    }

    // Persist (don't clobber an accepted/dismissed decision).
    const existing = await StitchdTagModel.forCustomer(tailorId, customerId).catch(() => []);
    const existingLabels = new Set((existing || []).map((t) => String(t.label).toLowerCase()));
    for (const s of suggestions) {
      if (existingLabels.has(String(s.label).toLowerCase())) continue;
      await query(
        `INSERT INTO stitchd_ai_tag_suggestions (tailor_id, customer_id, suggested_label, confidence, source)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (tailor_id, customer_id, suggested_label) DO NOTHING`,
        [tailorId, customerId, s.label, s.confidence ?? null, s.ai ? 'ai' : 'heuristic']
      ).catch(() => {});
    }
    return this.listTagSuggestions(tailorId, customerId);
  },

  async listTagSuggestions(tailorId, customerId) {
    const { rows } = await query(
      `SELECT * FROM stitchd_ai_tag_suggestions WHERE tailor_id=$1 AND customer_id=$2 AND status='suggested' ORDER BY confidence DESC NULLS LAST`,
      [tailorId, customerId]
    );
    return rows.map((r) => ({ id: r.id, customerId: r.customer_id, label: r.suggested_label, confidence: r.confidence == null ? null : Number(r.confidence), source: r.source, status: r.status }));
  },

  async acceptTagSuggestion(tailorId, id) {
    const { rows } = await query(`UPDATE stitchd_ai_tag_suggestions SET status='accepted' WHERE tailor_id=$1 AND id=$2 AND status='suggested' RETURNING *`, [tailorId, id]);
    const s = rows[0];
    if (!s) throw new GraphQLError('Suggestion not found.', { extensions: { code: 'NOT_FOUND' } });
    await StitchdTagModel.add(tailorId, s.customer_id, s.suggested_label, null);
    return true;
  },

  async dismissTagSuggestion(tailorId, id) {
    const { rowCount } = await query(`UPDATE stitchd_ai_tag_suggestions SET status='dismissed' WHERE tailor_id=$1 AND id=$2`, [tailorId, id]);
    return rowCount > 0;
  },

  // ── Social post generator ────────────────────────────────────────────────────
  async generateSocialPost(tailorId, { topic, garmentType, tone, platform }) {
    const tier = await tierFor(tailorId);
    if (!hasFeature(tier, 'socialPost')) {
      throw new GraphQLError('The social post generator is available on the Pro plan.', { extensions: { code: 'FORBIDDEN', reason: 'UPGRADE_REQUIRED' } });
    }
    await StitchdAiUsageModel.assertWithinCap(tailorId, 'social', tier);
    const biz = await StitchdTailorProfileModel.findByTailorId(tailorId);
    const result = await generateText({
      tier, json: true, maxTokens: 500, temperature: 0.9,
      system: `You write upbeat, authentic social media posts for an African fashion house/tailor. Keep it short, warm and proudly local. Respond as JSON: {"caption":"...","hashtags":["#..."]}. 4-8 relevant hashtags.`,
      prompt: `Business: ${biz?.businessName || 'our shop'}. Platform: ${platform || 'Instagram'}. Tone: ${tone || 'celebratory'}. Garment: ${garmentType || 'a recent piece'}. Notes: ${topic || ''}`,
    });
    await StitchdAiUsageModel.record(tailorId, 'social', 1);
    return {
      caption: result?.caption || '',
      hashtags: Array.isArray(result?.hashtags) ? result.hashtags.map(String) : [],
    };
  },
};

export default StitchdAdvancedAiModel;
