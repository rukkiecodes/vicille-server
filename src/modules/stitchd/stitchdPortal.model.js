/**
 * StitchdPortalModel — read-only customer portal tokens + SMS fallback (batch 18).
 *
 * A high-entropy token grants a CUSTOMER read-only access to exactly one order (or their open
 * orders) via a public web page — no app, no login. `resolveToken` returns a MINIMAL projection
 * (never another tenant's data, never internal cost notes). Pay-balance delegates to the batch-09
 * Paystack collection. SMS (Termii) is the non-WhatsApp channel.
 *
 * Tenant isolation (doc 01 §3): authenticated methods take `tailorId` first; the public
 * `resolveToken`/`initPayment` resolve the tenant FROM the token only.
 */
import crypto from 'crypto';
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import StitchdPaymentModel from './stitchdPayment.model.js';
import termii from '../../services/termii.service.js';
import logger from '../../core/logger/index.js';

const PORTAL_BASE = (process.env.STITCHD_PORTAL_URL || process.env.PUBLIC_BASE_URL || 'https://vicille-server.vercel.app').replace(/\/$/, '');
const num = (v) => (v == null ? 0 : Number(v));

function portalUrl(token) {
  return `${PORTAL_BASE}/portal/${token}`;
}

const StitchdPortalModel = {
  portalUrl,

  // ── Token management (authenticated) ─────────────────────────────────────────
  async createLink(tailorId, { orderId, customerId, scope = 'order', expiresAt = null }) {
    let cid = customerId || null;
    if (orderId) {
      const { rows } = await query('SELECT customer_id FROM stitchd_orders WHERE id=$1 AND tailor_id=$2 AND deleted_at IS NULL', [orderId, tailorId]);
      if (!rows[0]) throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });
      cid = rows[0].customer_id;
    }
    if (!cid) throw new GraphQLError('A customer or order is required.', { extensions: { code: 'BAD_USER_INPUT' } });

    const token = crypto.randomBytes(24).toString('base64url');
    const { rows } = await query(
      `INSERT INTO stitchd_portal_tokens (tailor_id, customer_id, order_id, token, scope, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tailorId, cid, orderId || null, token, orderId ? 'order' : scope, expiresAt]
    );
    return this.formatLink(rows[0]);
  },

  formatLink(r) {
    return {
      id: r.id, orderId: r.order_id || null, scope: r.scope, url: portalUrl(r.token),
      revoked: !!r.revoked_at, expiresAt: r.expires_at || null,
      viewCount: r.view_count || 0, lastViewedAt: r.last_viewed_at || null, createdAt: r.created_at,
    };
  },

  async revokeLink(tailorId, id) {
    const { rowCount } = await query(
      'UPDATE stitchd_portal_tokens SET revoked_at=now() WHERE tailor_id=$1 AND id=$2 AND revoked_at IS NULL',
      [tailorId, id]
    );
    return rowCount > 0;
  },

  async listByOrder(tailorId, orderId) {
    const { rows } = await query(
      'SELECT * FROM stitchd_portal_tokens WHERE tailor_id=$1 AND order_id=$2 ORDER BY created_at DESC',
      [tailorId, orderId]
    );
    return rows.map((r) => this.formatLink(r));
  },

  // ── Public token resolution (NO tenant id ever accepted) ─────────────────────
  async _tokenRow(token) {
    if (!token) return null;
    const { rows } = await query(
      `SELECT * FROM stitchd_portal_tokens
        WHERE token=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > now())`,
      [token]
    );
    return rows[0] || null;
  },

  /** Minimal public projection for the portal page (or null if invalid/revoked/expired). */
  async resolveToken(token) {
    const t = await this._tokenRow(token);
    if (!t) return null;
    // Count the view (best-effort).
    query('UPDATE stitchd_portal_tokens SET view_count=view_count+1, last_viewed_at=now() WHERE id=$1', [t.id]).catch(() => {});

    const biz = await query(
      'SELECT business_name, logo_url FROM stitchd_tailor_profile WHERE tailor_id=$1',
      [t.tailor_id]
    );
    const cust = await query('SELECT name FROM stitchd_customers WHERE id=$1', [t.customer_id]);
    const firstName = (cust.rows[0]?.name || '').split(' ')[0] || null;

    if (!t.order_id) {
      // Customer scope — list open orders (status + balance only).
      const { rows } = await query(
        `SELECT order_number, status, due_date, total_price, balance_owed
           FROM stitchd_orders WHERE tailor_id=$1 AND customer_id=$2 AND deleted_at IS NULL
             AND status NOT IN ('Delivered','Closed') ORDER BY due_date ASC`,
        [t.tailor_id, t.customer_id]
      );
      return {
        scope: 'customer', businessName: biz.rows[0]?.business_name || 'Stitchd', logoUrl: biz.rows[0]?.logo_url || null,
        customerFirstName: firstName,
        orders: rows.map((o) => ({ orderNumber: o.order_number, status: o.status, dueDate: o.due_date, total: num(o.total_price), balance: num(o.balance_owed) })),
      };
    }

    const { rows: orows } = await query(
      `SELECT order_number, status, due_date, total_price, deposit_paid, balance_owed FROM stitchd_orders WHERE id=$1`,
      [t.order_id]
    );
    const o = orows[0];
    if (!o) return null;
    const { rows: items } = await query(
      'SELECT garment_type, quantity FROM stitchd_order_items WHERE order_id=$1 ORDER BY position ASC',
      [t.order_id]
    );
    return {
      scope: 'order',
      businessName: biz.rows[0]?.business_name || 'Stitchd',
      logoUrl: biz.rows[0]?.logo_url || null,
      customerFirstName: firstName,
      order: {
        orderNumber: o.order_number, status: o.status, dueDate: o.due_date,
        total: num(o.total_price), depositPaid: num(o.deposit_paid), balance: num(o.balance_owed),
        items: items.map((i) => ({ garmentType: i.garment_type || 'Item', quantity: i.quantity ?? 1 })),
      },
    };
  },

  /** Public pay-balance: resolve the order from the token, init a Paystack collection. */
  async initPayment(token) {
    const t = await this._tokenRow(token);
    if (!t || !t.order_id) return null;
    const { rows } = await query('SELECT balance_owed FROM stitchd_orders WHERE id=$1 AND deleted_at IS NULL', [t.order_id]);
    const balance = num(rows[0]?.balance_owed);
    if (!(balance > 0)) return { authUrl: null, message: 'This order is fully paid.' };
    const intent = await StitchdPaymentModel.initiateCollection(t.tailor_id, {
      clientUuid: crypto.randomUUID(), customerId: t.customer_id, orderId: t.order_id, amount: balance, channel: 'card',
    });
    return { authUrl: intent.authUrl || null };
  },

  // ── SMS (Termii) ─────────────────────────────────────────────────────────────
  async sendSms(tailorId, customerId, body) {
    const prof = await query('SELECT sms_enabled FROM stitchd_tailor_profile WHERE tailor_id=$1', [tailorId]);
    if (prof.rows[0] && prof.rows[0].sms_enabled === false) {
      throw new GraphQLError('SMS is turned off for your account.', { extensions: { code: 'FAILED_PRECONDITION' } });
    }
    const cust = await query('SELECT phone FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
    const phone = cust.rows[0]?.phone;
    if (!phone) throw new GraphQLError('This customer has no phone number.', { extensions: { code: 'BAD_USER_INPUT' } });

    let status = 'sent', providerRef = null, error = null;
    try {
      const res = await termii.sendSms({ to: phone, message: body });
      providerRef = res?.messageId || res?.message_id || null;
    } catch (e) {
      status = 'failed'; error = String(e.message).slice(0, 300);
      logger.error('[portal] SMS send failed:', e.message);
    }
    const { rows } = await query(
      `INSERT INTO stitchd_sms_log (tailor_id, customer_id, to_phone, body, status, provider_ref, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [tailorId, customerId, phone, body, status, providerRef, error]
    );
    const r = rows[0];
    if (status === 'failed') throw new GraphQLError('Could not send the SMS. Please try again.', { extensions: { code: 'BAD_GATEWAY' } });
    return { id: r.id, toPhone: r.to_phone, status: r.status, sentAt: r.sent_at };
  },

  async smsLog(tailorId, customerId) {
    const { rows } = await query(
      'SELECT * FROM stitchd_sms_log WHERE tailor_id=$1 AND customer_id=$2 ORDER BY sent_at DESC LIMIT 50',
      [tailorId, customerId]
    );
    return rows.map((r) => ({ id: r.id, toPhone: r.to_phone, body: r.body, status: r.status, sentAt: r.sent_at }));
  },

  // ── Abuse limiter (fixed window, serverless-safe via Postgres) — migration 066 ──────
  /**
   * Atomically increment a per-bucket counter and report whether the request is allowed.
   * The window self-resets when older than `windowSec`. FAILS OPEN on DB error — rate limiting
   * is best-effort defense and must never lock real customers out of their order page.
   */
  async checkRate(bucket, limit, windowSec) {
    try {
      const { rows } = await query(
        `INSERT INTO stitchd_portal_rate (bucket, window_start, count)
           VALUES ($1, now(), 1)
         ON CONFLICT (bucket) DO UPDATE SET
           window_start = CASE WHEN stitchd_portal_rate.window_start < now() - make_interval(secs => $2)
                               THEN now() ELSE stitchd_portal_rate.window_start END,
           count = CASE WHEN stitchd_portal_rate.window_start < now() - make_interval(secs => $2)
                        THEN 1 ELSE stitchd_portal_rate.count + 1 END
         RETURNING count`,
        [bucket, windowSec]
      );
      return (rows[0]?.count || 0) <= limit;
    } catch (e) {
      logger.error('[portal] rate check failed (fail-open):', e.message);
      return true;
    }
  },

  /** Daily cron: drop stale limiter rows so the table stays small. */
  async pruneRateLimits(now = new Date()) {
    const { rowCount } = await query(`DELETE FROM stitchd_portal_rate WHERE window_start < $1::timestamptz - interval '1 day'`, [now]);
    return { pruned: rowCount };
  },

  async setChannelPref(tailorId, customerId, channel) {
    const ch = channel === 'sms' ? 'sms' : 'whatsapp';
    const { rowCount } = await query(
      'UPDATE stitchd_customers SET preferred_channel=$3, updated_at=now() WHERE tailor_id=$1 AND id=$2',
      [tailorId, customerId, ch]
    );
    if (!rowCount) throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    return ch;
  },
};

export default StitchdPortalModel;
