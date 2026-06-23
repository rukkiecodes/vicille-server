/**
 * StitchdEnterpriseModel — Enterprise tier, entitlement overrides, B2B invoices, locations
 * (batch 17).
 *
 * `resolveEntitlements(tailorId)` is the SINGLE source of effective caps/flags: it merges the
 * per-tenant override row (stitchd_entitlements) over the batch-11 tier defaults. AI metering
 * (doc 01 §7) and the team seat-cap guard (batch 16) both call it, so enterprise overrides win
 * everywhere. Enterprise admin actions are ops-driven (internal service-key route); the
 * tailor-facing surface is read-only.
 *
 * Tenant isolation (doc 01 §3): scoped by `tailorId`.
 */
import { query } from '../../infrastructure/database/postgres.js';
import { entitlementsFor } from './stitchdEntitlements.js';
import StitchdTailorProfileModel from '../../modules/tailors/stitchdTailorProfile.model.js';

const num = (v) => (v == null ? 0 : Number(v));
const capVal = (v) => (v == null ? null : v === -1 ? Infinity : Number(v)); // -1 = unlimited

const StitchdEnterpriseModel = {
  /** Effective entitlements for a tenant: tier defaults with per-tenant overrides applied. */
  async resolveEntitlements(tailorId) {
    const profile = await StitchdTailorProfileModel.findByTailorId(tailorId);
    const tier = profile?.tier || 'starter';
    const base = entitlementsFor(tier);
    const { rows } = await query('SELECT * FROM stitchd_entitlements WHERE tailor_id=$1', [tailorId]);
    const o = rows[0] || null;

    const aiOverride = o ? capVal(o.ai_monthly_cap) : null;
    const teamSeatCap = o && capVal(o.team_seat_cap) != null ? capVal(o.team_seat_cap) : base.teamMemberSlots;
    const features = { ...base.features, ...((o && o.features) || {}) };

    return {
      tier,
      priceNgn: base.priceNgn,
      teamSeatCap,
      multiLocation: Boolean(o?.multi_location_enabled),
      features,
      /** AI monthly cap for a feature (override wins; Infinity = unlimited). */
      aiCap(feature) {
        if (aiOverride != null) return aiOverride;
        return base.aiCaps[feature] ?? 0;
      },
    };
  },

  // ── Entitlement overrides (read + ops set) ───────────────────────────────────
  async getOverrides(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_entitlements WHERE tailor_id=$1', [tailorId]);
    const o = rows[0];
    return o ? {
      aiMonthlyCap: o.ai_monthly_cap, teamSeatCap: o.team_seat_cap,
      multiLocationEnabled: o.multi_location_enabled, features: o.features || {},
    } : null;
  },

  async setOverrides(tailorId, { aiMonthlyCap, teamSeatCap, multiLocationEnabled, features }) {
    const { rows } = await query(
      `INSERT INTO stitchd_entitlements (tailor_id, ai_monthly_cap, team_seat_cap, multi_location_enabled, features, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb, now())
       ON CONFLICT (tailor_id) DO UPDATE
         SET ai_monthly_cap=COALESCE($2, stitchd_entitlements.ai_monthly_cap),
             team_seat_cap=COALESCE($3, stitchd_entitlements.team_seat_cap),
             multi_location_enabled=COALESCE($4, stitchd_entitlements.multi_location_enabled),
             features=COALESCE($5::jsonb, stitchd_entitlements.features),
             updated_at=now()
       RETURNING *`,
      [tailorId, aiMonthlyCap ?? null, teamSeatCap ?? null, multiLocationEnabled ?? null, features ? JSON.stringify(features) : null]
    );
    return rows[0];
  },

  // ── Enterprise account / contract ────────────────────────────────────────────
  async getAccount(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_enterprise_accounts WHERE tailor_id=$1', [tailorId]);
    const a = rows[0];
    if (!a) return null;
    return {
      id: a.id, accountManagerName: a.account_manager_name || null, accountManagerContact: a.account_manager_contact || null,
      contractStart: a.contract_start || null, contractEnd: a.contract_end || null,
      customPriceAmount: a.custom_price_amount == null ? null : num(a.custom_price_amount),
      currency: a.currency, billingTerms: a.billing_terms || null, billingCycle: a.billing_cycle, notes: a.notes || null,
    };
  },

  async upsertAccount(tailorId, input) {
    const { rows } = await query(
      `INSERT INTO stitchd_enterprise_accounts
         (tailor_id, account_manager_name, account_manager_contact, contract_start, contract_end,
          custom_price_amount, currency, billing_terms, billing_cycle, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tailor_id) DO UPDATE SET
         account_manager_name=EXCLUDED.account_manager_name,
         account_manager_contact=EXCLUDED.account_manager_contact,
         contract_start=EXCLUDED.contract_start, contract_end=EXCLUDED.contract_end,
         custom_price_amount=EXCLUDED.custom_price_amount, currency=EXCLUDED.currency,
         billing_terms=EXCLUDED.billing_terms, billing_cycle=EXCLUDED.billing_cycle,
         notes=EXCLUDED.notes, updated_at=now()
       RETURNING *`,
      [tailorId, input.accountManagerName || null, input.accountManagerContact || null,
       input.contractStart || null, input.contractEnd || null, input.customPriceAmount ?? null,
       input.currency || 'NGN', input.billingTerms || null, input.billingCycle || 'monthly', input.notes || null]
    );
    // Promote the tenant to the enterprise tier.
    await query(`UPDATE stitchd_tailor_profile SET tier='enterprise', subscription_status='active', updated_at=now() WHERE tailor_id=$1`, [tailorId]);
    return this.getAccount(tailorId);
  },

  // ── B2B invoices ─────────────────────────────────────────────────────────────
  formatInvoice(r) {
    return {
      id: r.id, number: r.number || null, periodStart: r.period_start || null, periodEnd: r.period_end || null,
      amount: num(r.amount), currency: r.currency, status: r.status,
      issuedAt: r.issued_at || null, dueAt: r.due_at || null, paidAt: r.paid_at || null, pdfUrl: r.pdf_url || null,
      createdAt: r.created_at,
    };
  },

  async listInvoices(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_enterprise_invoices WHERE tailor_id=$1 ORDER BY created_at DESC', [tailorId]);
    return rows.map((r) => this.formatInvoice(r));
  },

  async issueInvoice(tailorId, { number, periodStart, periodEnd, amount, currency, dueAt }) {
    const { rows } = await query(
      `INSERT INTO stitchd_enterprise_invoices
         (tailor_id, number, period_start, period_end, amount, currency, status, issued_at, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,'issued', now(), $7) RETURNING *`,
      [tailorId, number || `STE-${Date.now()}`, periodStart || null, periodEnd || null, num(amount), currency || 'NGN', dueAt || null]
    );
    return this.formatInvoice(rows[0]);
  },

  async setInvoiceStatus(tailorId, invoiceId, status) {
    const paidAt = status === 'paid' ? 'now()' : 'paid_at';
    const { rows } = await query(
      `UPDATE stitchd_enterprise_invoices SET status=$3, paid_at=${paidAt}
        WHERE tailor_id=$1 AND id=$2 RETURNING *`,
      [tailorId, invoiceId, status]
    );
    return rows[0] ? this.formatInvoice(rows[0]) : null;
  },

  // ── Locations ────────────────────────────────────────────────────────────────
  async listLocations(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_locations WHERE tailor_id=$1 ORDER BY is_primary DESC, created_at ASC', [tailorId]);
    return rows.map((r) => ({ id: r.id, name: r.name, address: r.address || null, isPrimary: r.is_primary }));
  },

  async createLocation(tailorId, { name, address, isPrimary }) {
    const { rows } = await query(
      `INSERT INTO stitchd_locations (tailor_id, name, address, is_primary) VALUES ($1,$2,$3,$4) RETURNING *`,
      [tailorId, String(name || '').trim(), address || null, Boolean(isPrimary)]
    );
    const r = rows[0];
    return { id: r.id, name: r.name, address: r.address || null, isPrimary: r.is_primary };
  },

  async assignMemberToLocation(tailorId, memberId, locationId) {
    const { rowCount } = await query(
      'UPDATE stitchd_team_members SET location_id=$3, updated_at=now() WHERE tailor_id=$1 AND id=$2',
      [tailorId, memberId, locationId || null]
    );
    return rowCount > 0;
  },
};

export default StitchdEnterpriseModel;
