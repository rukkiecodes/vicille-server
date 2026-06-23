/**
 * StitchdStyleUModel — Stitchd-side Style-U marketplace integration (batch 20).
 *
 * Style-U (the consumer wardrobe service) is a SEPARATE product not built here; it owns the
 * consumer, payment and QC. This model owns the Stitchd side: opt-in/vetting, the offer inbox
 * (accept/decline within an SLA), materializing accepted offers into normal queue orders with
 * source='style-u', and a SEPARATE payout stream paid per delivered order.
 *
 * Tailor-facing methods scope by `tailorId`. The INTERNAL methods (enqueueOffer / setVetting /
 * onOrderDelivered / recordMetrics / markPayoutPaid) are the Style-U-side boundary — invoked by
 * the service-key internal route, never exposed to tailors. Keep this contract narrow + versioned.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import StitchdOrderModel from './stitchdOrder.model.js';
import logger from '../../core/logger/index.js';

const num = (v) => (v == null ? 0 : Number(v));
const MARKETPLACE_CUSTOMER_NAME = 'Style-U Customer';

const StitchdStyleUModel = {
  // ── Connection / vetting ──────────────────────────────────────────────────────
  async getConnection(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_styleu_connection WHERE tailor_id=$1', [tailorId]);
    const c = rows[0];
    if (!c) return { status: 'not_connected', specialties: [], capacityOptin: true, appliedAt: null, vettedAt: null };
    return { status: c.status, specialties: c.specialties || [], capacityOptin: c.capacity_optin, appliedAt: c.applied_at || null, vettedAt: c.vetted_at || null };
  },

  async apply(tailorId, specialties = [], capacityOptin = true) {
    const { rows } = await query(
      `INSERT INTO stitchd_styleu_connection (tailor_id, status, specialties, capacity_optin, applied_at)
       VALUES ($1,'pending_vetting',$2,$3, now())
       ON CONFLICT (tailor_id) DO UPDATE
         SET status = CASE WHEN stitchd_styleu_connection.status IN ('approved','suspended')
                           THEN stitchd_styleu_connection.status ELSE 'pending_vetting' END,
             specialties=EXCLUDED.specialties, capacity_optin=EXCLUDED.capacity_optin,
             applied_at=COALESCE(stitchd_styleu_connection.applied_at, now()), updated_at=now()
       RETURNING *`,
      [tailorId, specialties, capacityOptin]
    );
    const c = rows[0];
    return { status: c.status, specialties: c.specialties || [], capacityOptin: c.capacity_optin, appliedAt: c.applied_at, vettedAt: c.vetted_at };
  },

  async setCapacityOptin(tailorId, optin) {
    await query('UPDATE stitchd_styleu_connection SET capacity_optin=$2, updated_at=now() WHERE tailor_id=$1', [tailorId, !!optin]);
    return this.getConnection(tailorId);
  },

  async disconnect(tailorId) {
    await query(`UPDATE stitchd_styleu_connection SET status='not_connected', updated_at=now() WHERE tailor_id=$1`, [tailorId]);
    return this.getConnection(tailorId);
  },

  // ── Inbox / offers ────────────────────────────────────────────────────────────
  formatOffer(r) {
    return {
      id: r.id, styleuOrderRef: r.styleu_order_ref, garmentSummary: r.garment_summary, details: r.details || {},
      dueDate: r.due_date || null, payoutAmount: num(r.payout_amount), currency: r.currency,
      respondBy: r.respond_by || null, status: r.status, orderId: r.order_id || null, createdAt: r.created_at,
    };
  },

  async listInbox(tailorId) {
    const { rows } = await query(
      `SELECT * FROM stitchd_styleu_offers
        WHERE tailor_id=$1 AND status='pending' AND (respond_by IS NULL OR respond_by > now())
        ORDER BY respond_by ASC NULLS LAST, created_at DESC`,
      [tailorId]
    );
    return rows.map((r) => this.formatOffer(r));
  },

  async offerDetail(tailorId, offerId) {
    const { rows } = await query('SELECT * FROM stitchd_styleu_offers WHERE tailor_id=$1 AND id=$2', [tailorId, offerId]);
    return rows[0] ? this.formatOffer(rows[0]) : null;
  },

  async _ensureMarketplaceCustomer(tailorId) {
    const { rows } = await query('SELECT id FROM stitchd_customers WHERE tailor_id=$1 AND name=$2 LIMIT 1', [tailorId, MARKETPLACE_CUSTOMER_NAME]);
    if (rows[0]) return rows[0].id;
    const ins = await query('INSERT INTO stitchd_customers (tailor_id, name) VALUES ($1,$2) RETURNING id', [tailorId, MARKETPLACE_CUSTOMER_NAME]);
    return ins.rows[0].id;
  },

  /** Accept an offer → materialize a source='style-u' queue order + create a pending payout. Idempotent. */
  async acceptOffer(tailorId, offerId) {
    const conn = await this.getConnection(tailorId);
    if (conn.status !== 'approved') throw new GraphQLError('Your Style-U account is not approved yet.', { extensions: { code: 'FORBIDDEN', reason: 'NOT_APPROVED' } });

    const { rows } = await query('SELECT * FROM stitchd_styleu_offers WHERE tailor_id=$1 AND id=$2', [tailorId, offerId]);
    const offer = rows[0];
    if (!offer) throw new GraphQLError('Offer not found.', { extensions: { code: 'NOT_FOUND' } });
    if (offer.status === 'accepted' && offer.order_id) return StitchdOrderModel.findById(tailorId, offer.order_id); // idempotent
    if (offer.status !== 'pending') throw new GraphQLError('This offer is no longer available.', { extensions: { code: 'FAILED_PRECONDITION' } });
    if (offer.respond_by && new Date(offer.respond_by) < new Date()) {
      await query(`UPDATE stitchd_styleu_offers SET status='expired' WHERE id=$1`, [offer.id]);
      throw new GraphQLError('This offer has expired.', { extensions: { code: 'FAILED_PRECONDITION', reason: 'EXPIRED' } });
    }

    const customerId = await this._ensureMarketplaceCustomer(tailorId);
    // Reuse the standard create path (order number, activity), then tag as Style-U.
    const order = await StitchdOrderModel.create(tailorId, {
      customerId,
      items: [{ garmentType: offer.garment_summary, quantity: 1, unitPrice: 0 }],
      dueDate: offer.due_date || undefined,
      notes: `Style-U marketplace order (${offer.styleu_order_ref})`,
    });
    await query('UPDATE stitchd_orders SET source=$3, styleu_order_ref=$4 WHERE tailor_id=$1 AND id=$2', [tailorId, order.id, 'style-u', offer.styleu_order_ref]);
    await query(
      `INSERT INTO stitchd_styleu_payouts (tailor_id, order_id, styleu_order_ref, amount, currency, status)
       VALUES ($1,$2,$3,$4,$5,'pending')
       ON CONFLICT (tailor_id, styleu_order_ref) DO UPDATE SET order_id=EXCLUDED.order_id`,
      [tailorId, order.id, offer.styleu_order_ref, num(offer.payout_amount), offer.currency]
    );
    await query(`UPDATE stitchd_styleu_offers SET status='accepted', order_id=$2, responded_at=now() WHERE id=$1`, [offer.id, order.id]);
    return StitchdOrderModel.findById(tailorId, order.id);
  },

  async declineOffer(tailorId, offerId, reason = null) {
    const { rowCount } = await query(
      `UPDATE stitchd_styleu_offers SET status='declined', decline_reason=$3, responded_at=now()
        WHERE tailor_id=$1 AND id=$2 AND status='pending'`,
      [tailorId, offerId, reason]
    );
    if (!rowCount) throw new GraphQLError('This offer is no longer available.', { extensions: { code: 'FAILED_PRECONDITION' } });
    return true;
  },

  // ── Payouts (separate stream) ─────────────────────────────────────────────────
  async listPayouts(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_styleu_payouts WHERE tailor_id=$1 ORDER BY created_at DESC', [tailorId]);
    return rows.map((r) => ({ id: r.id, orderId: r.order_id || null, styleuOrderRef: r.styleu_order_ref, amount: num(r.amount), currency: r.currency, status: r.status, deliveredAt: r.delivered_at || null, paidAt: r.paid_at || null }));
  },

  // ── Metrics ───────────────────────────────────────────────────────────────────
  async getMetrics(tailorId) {
    const offers = await query(`SELECT status, COUNT(*)::int n FROM stitchd_styleu_offers WHERE tailor_id=$1 GROUP BY status`, [tailorId]);
    const tally = Object.fromEntries(offers.rows.map((r) => [r.status, r.n]));
    const responded = (tally.accepted || 0) + (tally.declined || 0) + (tally.expired || 0);
    const acceptRate = responded ? (tally.accepted || 0) / responded : null;
    const completed = await query(`SELECT COUNT(*)::int n FROM stitchd_orders WHERE tailor_id=$1 AND source='style-u' AND status IN ('Delivered','Closed') AND deleted_at IS NULL`, [tailorId]);
    const stored = await query('SELECT rating, on_time_rate FROM stitchd_styleu_metrics WHERE tailor_id=$1', [tailorId]);
    return {
      rating: stored.rows[0]?.rating != null ? Number(stored.rows[0].rating) : null,
      onTimeRate: stored.rows[0]?.on_time_rate != null ? Number(stored.rows[0].on_time_rate) : null,
      acceptRate,
      completedCount: completed.rows[0]?.n || 0,
    };
  },

  // ── SLA expiry (cron) ──────────────────────────────────────────────────────────
  async expireOffers(now = new Date()) {
    const { rowCount } = await query(`UPDATE stitchd_styleu_offers SET status='expired' WHERE status='pending' AND respond_by IS NOT NULL AND respond_by < $1`, [now]);
    return { expired: rowCount };
  },

  // ══ INTERNAL boundary (Style-U side; service-key only) ═══════════════════════════
  /** Style-U pushes a new offer to an approved tailor's inbox. Idempotent on styleu_order_ref. */
  async enqueueOffer(tailorId, offer) {
    const conn = await this.getConnection(tailorId);
    if (conn.status !== 'approved') throw new GraphQLError('Tailor is not an approved Style-U partner.', { extensions: { code: 'FAILED_PRECONDITION' } });
    const { rows } = await query(
      `INSERT INTO stitchd_styleu_offers (tailor_id, styleu_order_ref, garment_summary, details, due_date, payout_amount, currency, respond_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)
       ON CONFLICT (tailor_id, styleu_order_ref) DO NOTHING RETURNING *`,
      [tailorId, offer.styleuOrderRef, offer.garmentSummary || 'Garment', JSON.stringify(offer.details || {}), offer.dueDate || null, num(offer.payoutAmount), offer.currency || 'NGN', offer.respondBy || null]
    );
    return rows[0] ? this.formatOffer(rows[0]) : null;
  },

  /** Ops vetting transition (approved|rejected|suspended|pending_vetting). */
  async setVetting(tailorId, status) {
    const valid = ['approved', 'rejected', 'suspended', 'pending_vetting', 'not_connected'];
    if (!valid.includes(status)) throw new GraphQLError('Invalid status.', { extensions: { code: 'BAD_USER_INPUT' } });
    await query(
      `INSERT INTO stitchd_styleu_connection (tailor_id, status, vetted_at)
       VALUES ($1,$2, now())
       ON CONFLICT (tailor_id) DO UPDATE SET status=EXCLUDED.status, vetted_at=now(), updated_at=now()`,
      [tailorId, status]
    );
    return this.getConnection(tailorId);
  },

  /** Stitchd emits this when a source='style-u' order reaches Delivered → release the payout. */
  async onOrderDelivered(orderId) {
    const { rows } = await query('SELECT tailor_id, styleu_order_ref FROM stitchd_orders WHERE id=$1 AND source=$2', [orderId, 'style-u']);
    if (!rows[0]) return false;
    await query(
      `UPDATE stitchd_styleu_payouts SET status='released', delivered_at=COALESCE(delivered_at, now())
        WHERE tailor_id=$1 AND styleu_order_ref=$2 AND status='pending'`,
      [rows[0].tailor_id, rows[0].styleu_order_ref]
    );
    logger.info('[styleu] order delivered → payout released', { orderId });
    return true;
  },

  /** Style-U marks a released payout as paid (settled on the separate stream). */
  async markPayoutPaid(tailorId, styleuOrderRef) {
    const { rowCount } = await query(`UPDATE stitchd_styleu_payouts SET status='paid', paid_at=now() WHERE tailor_id=$1 AND styleu_order_ref=$2 AND status='released'`, [tailorId, styleuOrderRef]);
    return rowCount > 0;
  },

  /** Style-U writes the tailor's QC-derived rating / on-time rate. */
  async recordMetrics(tailorId, { rating, onTimeRate }) {
    await query(
      `INSERT INTO stitchd_styleu_metrics (tailor_id, rating, on_time_rate, updated_at)
       VALUES ($1,$2,$3, now())
       ON CONFLICT (tailor_id) DO UPDATE SET rating=COALESCE($2, stitchd_styleu_metrics.rating),
         on_time_rate=COALESCE($3, stitchd_styleu_metrics.on_time_rate), updated_at=now()`,
      [tailorId, rating ?? null, onTimeRate ?? null]
    );
    return true;
  },
};

export default StitchdStyleUModel;
