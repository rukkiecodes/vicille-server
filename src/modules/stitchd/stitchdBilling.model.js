/**
 * StitchdBillingModel — subscription billing & tiers for Stitchd tailors (batch 11).
 *
 * Tailor ↔ Stitchd money (distinct from batches 09/10). Converts the batch-01 trial into a
 * paid Paystack recurring subscription, exposes tier entitlements (single source of truth in
 * stitchdEntitlements.js), records invoices, and drives dunning on failed renewals.
 *
 * Tenant isolation (doc 01 §3): tailor-facing methods take `tailorId` first. Webhook handlers
 * resolve the tenant from Paystack codes / metadata.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import paymentsService from '../../services/paymentsService.js';
import { entitlementsFor, planCodeFor, TIERS } from './stitchdEntitlements.js';
import logger from '../../core/logger/index.js';

const num = (v) => (v == null ? 0 : Number(v));
const GRACE_DAYS = 7;

/** Tailor contact for Paystack (synthesized email if the tailor signed up phone-only). */
async function tailorContact(tailorId) {
  const { rows } = await query(
    `SELECT t.email, t.phone, p.business_name, p.owner_name
       FROM tailors t LEFT JOIN stitchd_tailor_profile p ON p.tailor_id = t.id
      WHERE t.id = $1`,
    [tailorId]
  );
  const r = rows[0] || {};
  const email = r.email && r.email.includes('@') ? r.email : `tailor-${tailorId}@stitchd.ng`;
  return { email, fullName: r.owner_name || r.business_name || 'Stitchd Tailor' };
}

const StitchdBillingModel = {
  GRACE_DAYS,

  /** Subscription state for the tailor (profile-backed). */
  async subscription(tailorId) {
    const { rows } = await query(
      `SELECT subscription_status, tier, billing_cycle, trial_ends_at,
              current_period_end, grace_ends_at, paystack_subscription_code
         FROM stitchd_tailor_profile WHERE tailor_id=$1`,
      [tailorId]
    );
    const r = rows[0];
    if (!r) return null;
    return {
      tier:             r.tier || 'starter',
      status:           r.subscription_status || 'trial',
      billingCycle:     r.billing_cycle || 'monthly',
      trialEndsAt:      r.trial_ends_at || null,
      currentPeriodEnd: r.current_period_end || null,
      graceEndsAt:      r.grace_ends_at || null,
      hasSubscription:  Boolean(r.paystack_subscription_code),
    };
  },

  /** Entitlements for the tailor's current tier (shaped for GraphQL; ∞ → null). */
  async entitlements(tailorId) {
    const sub = await this.subscription(tailorId);
    const ent = entitlementsFor(sub?.tier || 'starter');
    const capOrNull = (v) => (v === Infinity ? null : v);
    return {
      tier:              ent.tier,
      priceNgn:          ent.priceNgn,
      aiFitConsultantCap: capOrNull(ent.aiCaps.fit_consultant),
      aiTranscriptionCap: capOrNull(ent.aiCaps.transcription),
      aiDesignCap:        capOrNull(ent.aiCaps.design),
      teamMemberSlots:    capOrNull(ent.teamMemberSlots),
      teamMembers:        ent.features.teamMembers,
      designGenerator:    ent.features.designGenerator,
      briefExtractor:     ent.features.briefExtractor,
      socialPost:         ent.features.socialPost,
    };
  },

  async invoices(tailorId) {
    const { rows } = await query(
      'SELECT * FROM stitchd_billing_invoices WHERE tailor_id=$1 ORDER BY created_at DESC',
      [tailorId]
    );
    return rows.map((r) => ({
      id: r.id, amount: num(r.amount), currency: r.currency, status: r.status,
      tier: r.tier || null, periodStart: r.period_start, periodEnd: r.period_end,
      paidAt: r.paid_at, hostedUrl: r.hosted_url || null, createdAt: r.created_at,
    }));
  },

  async paymentMethod(tailorId) {
    const { rows } = await query(
      'SELECT * FROM stitchd_payment_methods WHERE tailor_id=$1 AND is_default=TRUE LIMIT 1',
      [tailorId]
    );
    const r = rows[0];
    if (!r) return null;
    return { id: r.id, cardBrand: r.card_brand || null, last4: r.last4 || null, expMonth: r.exp_month || null, expYear: r.exp_year || null, isDefault: r.is_default };
  },

  /**
   * Start (or change to) a paid subscription. Validates the tier has a configured Paystack
   * plan, then asks the payments service to initialize a card authorization for that plan.
   * The trial flips to 'active' on the webhook (STITCHD_SUBSCRIPTION_ACTIVATED). Returns the
   * authorization URL the app opens to collect the card.
   */
  async startSubscription(tailorId, tier) {
    if (!TIERS.includes(tier) || tier === 'enterprise') {
      throw new GraphQLError('Choose a Starter or Pro plan.', { extensions: { code: 'BAD_USER_INPUT' } });
    }
    const planCode = planCodeFor(tier);
    if (!planCode) {
      throw new GraphQLError('Billing is not available right now. Please try again later.', { extensions: { code: 'FAILED_PRECONDITION' } });
    }
    const ent = entitlementsFor(tier);
    const { email, fullName } = await tailorContact(tailorId);
    try {
      const resp = await paymentsService.startStitchdSubscription({
        email, tailorId, planCode, amountKobo: ent.priceNgn * 100, tier, fullName,
      });
      // Record the intended plan; activation is confirmed by the webhook.
      await query('UPDATE stitchd_tailor_profile SET paystack_plan_code=$1, updated_at=now() WHERE tailor_id=$2', [planCode, tailorId]);
      return { authorizationUrl: resp.authorizationUrl || null, reference: resp.reference || null, tier };
    } catch (e) {
      logger.error('startSubscription error:', e.message);
      throw new GraphQLError('Could not start your subscription. Please try again.', { extensions: { code: 'BAD_GATEWAY' } });
    }
  },

  /** Cancel: disable the Paystack subscription (if any) and mark canceled at period end. */
  async cancelSubscription(tailorId) {
    const { rows } = await query(
      'SELECT paystack_subscription_code, paystack_email_token FROM stitchd_tailor_profile WHERE tailor_id=$1',
      [tailorId]
    );
    const r = rows[0];
    if (r?.paystack_subscription_code && r?.paystack_email_token) {
      try {
        await paymentsService.disableSubscription({ subscriptionCode: r.paystack_subscription_code, emailToken: r.paystack_email_token });
      } catch (e) { logger.error('cancelSubscription disable error:', e.message); }
    }
    await query(`UPDATE stitchd_tailor_profile SET subscription_status='canceled', updated_at=now() WHERE tailor_id=$1`, [tailorId]);
    return this.subscription(tailorId);
  },

  /** Update card on file → Paystack subscription management link (or re-auth start). */
  async paymentMethodUpdateLink(tailorId) {
    const { rows } = await query('SELECT paystack_subscription_code FROM stitchd_tailor_profile WHERE tailor_id=$1', [tailorId]);
    const code = rows[0]?.paystack_subscription_code;
    if (code) {
      try {
        const resp = await paymentsService.getSubscriptionManageLink(code);
        if (resp.link) return { authorizationUrl: resp.link, reference: null, tier: null };
      } catch (e) { logger.error('manage link error:', e.message); }
    }
    // No active subscription yet — fall back to starting one on the current tier.
    const sub = await this.subscription(tailorId);
    return this.startSubscription(tailorId, sub?.tier === 'pro' ? 'pro' : 'starter');
  },

  // ── Webhook-driven state (called from internal route) ────────────────────────

  /** Resolve a tailor by Paystack customer code or subscription code. */
  async _tailorByPaystack({ customerCode, subscriptionCode }) {
    if (subscriptionCode) {
      const { rows } = await query('SELECT tailor_id FROM stitchd_tailor_profile WHERE paystack_subscription_code=$1', [subscriptionCode]);
      if (rows[0]) return rows[0].tailor_id;
    }
    if (customerCode) {
      const { rows } = await query('SELECT tailor_id FROM stitchd_tailor_profile WHERE paystack_customer_code=$1', [customerCode]);
      if (rows[0]) return rows[0].tailor_id;
    }
    return null;
  },

  /** Activate (trial → active) on first successful charge. Idempotent-ish. */
  async activate({ tailorId, customerCode, subscriptionCode, emailToken, planCode, tier, reference, amountKobo }) {
    const resolved = tailorId || (await this._tailorByPaystack({ customerCode, subscriptionCode }));
    if (!resolved) { logger.warn('[billing] activate — no tailor resolved'); return; }
    const periodEnd = new Date(Date.now() + 30 * 86400000);
    await query(
      `UPDATE stitchd_tailor_profile
          SET subscription_status='active', billing_cycle='monthly',
              tier=COALESCE($2, tier),
              current_period_end=$3, grace_ends_at=NULL,
              paystack_customer_code=COALESCE($4, paystack_customer_code),
              paystack_subscription_code=COALESCE($5, paystack_subscription_code),
              paystack_email_token=COALESCE($6, paystack_email_token),
              paystack_plan_code=COALESCE($7, paystack_plan_code),
              updated_at=now()
        WHERE tailor_id=$1`,
      [resolved, tier || null, periodEnd, customerCode || null, subscriptionCode || null, emailToken || null, planCode || null]
    );
    await this._writeInvoice(resolved, { reference, amountKobo, status: 'paid', tier, periodEnd });
  },

  /** Recurring renewal succeeded: extend the period, write a paid invoice, clear dunning. */
  async renew({ subscriptionCode, reference, amountKobo }) {
    const tailorId = await this._tailorByPaystack({ subscriptionCode });
    if (!tailorId) return;
    const periodEnd = new Date(Date.now() + 30 * 86400000);
    await query(
      `UPDATE stitchd_tailor_profile
          SET subscription_status='active', current_period_end=$2, grace_ends_at=NULL, updated_at=now()
        WHERE tailor_id=$1`,
      [tailorId, periodEnd]
    );
    await this._writeInvoice(tailorId, { reference, amountKobo, status: 'paid', periodEnd });
  },

  /** Renewal failed: enter dunning (past_due + grace), record failed invoice + dunning event. */
  async paymentFailed({ subscriptionCode, tailorId, reference, amountKobo }) {
    const resolved = tailorId || (await this._tailorByPaystack({ subscriptionCode }));
    if (!resolved) return;
    const grace = new Date(Date.now() + GRACE_DAYS * 86400000);
    await query(
      `UPDATE stitchd_tailor_profile
          SET subscription_status='past_due', grace_ends_at=COALESCE(grace_ends_at, $2), updated_at=now()
        WHERE tailor_id=$1`,
      [resolved, grace]
    );
    await this._writeInvoice(resolved, { reference, amountKobo, status: 'failed' });
    await query(
      `INSERT INTO stitchd_dunning_events (tailor_id, attempt, outcome, next_retry_at)
       VALUES ($1, 1, 'failed', $2)`,
      [resolved, new Date(Date.now() + 3 * 86400000)]
    );
    logger.warn('[billing] dunning started', { tailorId: resolved });
  },

  async _writeInvoice(tailorId, { reference, amountKobo, status, tier = null, periodEnd = null }) {
    await query(
      `INSERT INTO stitchd_billing_invoices
         (tailor_id, paystack_invoice_ref, amount, currency, status, tier, period_end, paid_at)
       VALUES ($1,$2,$3,'NGN',$4,$5,$6,$7)
       ON CONFLICT (paystack_invoice_ref) WHERE paystack_invoice_ref IS NOT NULL DO NOTHING`,
      [tailorId, reference || null, amountKobo ? num(amountKobo) / 100 : 0, status, tier, periodEnd, status === 'paid' ? new Date() : null]
    );
  },

  // ── Crons ────────────────────────────────────────────────────────────────────

  /** Trial-expiry sweep: trials past trial_ends_at with no active sub → past_due (restricted). */
  async expireTrials(now = new Date()) {
    const { rowCount } = await query(
      `UPDATE stitchd_tailor_profile
          SET subscription_status='past_due', updated_at=now()
        WHERE subscription_status='trial' AND tier <> 'enterprise'
          AND trial_ends_at IS NOT NULL AND trial_ends_at < $1`,
      [now]
    );
    return { expired: rowCount };
  },

  /** Dunning sweep: past_due accounts past grace with no recovery → canceled (suspended). */
  async suspendAfterGrace(now = new Date()) {
    const { rowCount } = await query(
      `UPDATE stitchd_tailor_profile
          SET subscription_status='canceled', updated_at=now()
        WHERE subscription_status='past_due' AND tier <> 'enterprise'
          AND grace_ends_at IS NOT NULL AND grace_ends_at < $1`,
      [now]
    );
    return { suspended: rowCount };
  },
};

export default StitchdBillingModel;
