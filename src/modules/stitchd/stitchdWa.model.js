/**
 * StitchdWaModel — WhatsApp Business API templates, sends + delivery audit, and the unified
 * customer-notify channel router (batch 21).
 *
 * `notifyCustomer` is the single entry point flows use to reach a customer: it prefers the
 * WhatsApp API for opted-in customers (when configured), falls back to SMS (batch 18) by the
 * customer's preferred channel, and otherwise reports 'manual' so the caller opens a wa.me
 * deep link (batch 06). All WA sends are logged in stitchd_wa_messages for delivery tracking.
 *
 * Tenant isolation (doc 01 §3): every method scopes by `tailorId`.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import whatsapp from '../../services/whatsapp.service.js';
import StitchdPortalModel from './stitchdPortal.model.js';
import logger from '../../core/logger/index.js';

/** Interpolate a {{1}}..{{n}} template body with ordered params (for SMS fallback / local log). */
function interpolate(body, params) {
  return String(body || '').replace(/\{\{(\d+)\}\}/g, (_m, i) => params[Number(i) - 1] ?? '');
}

const StitchdWaModel = {
  async listTemplates(tailorId) {
    const { rows } = await query(
      `SELECT * FROM stitchd_wa_templates WHERE tailor_id IS NULL OR tailor_id=$1 ORDER BY key, tailor_id NULLS LAST`,
      [tailorId]
    );
    // Tenant override (tailor_id set) wins over the global default for the same key.
    const byKey = {};
    for (const r of rows) if (!byKey[r.key] || r.tailor_id) byKey[r.key] = r;
    return Object.values(byKey).map((r) => ({
      id: r.id, key: r.key, body: r.body, variables: r.variables || [], category: r.category,
      approvalStatus: r.approval_status, locale: r.locale, isCustom: !!r.tailor_id,
    }));
  },

  async _resolveTemplate(tailorId, key, locale = 'en') {
    const { rows } = await query(
      `SELECT * FROM stitchd_wa_templates WHERE key=$1 AND locale=$2 AND (tailor_id IS NULL OR tailor_id=$3)
        ORDER BY tailor_id NULLS LAST LIMIT 1`,
      [key, locale, tailorId]
    );
    return rows[0] || null;
  },

  /** Map a params object to the template's ordered variable list. */
  _orderedParams(template, params = {}) {
    const vars = template.variables || [];
    return vars.map((name) => params[name] ?? '');
  },

  /** Send a templated WA message + log it. Returns the logged message (status sent|failed). */
  async sendTemplate(tailorId, customerId, key, params = {}) {
    const template = await this._resolveTemplate(tailorId, key);
    if (!template) throw new GraphQLError('Unknown message template.', { extensions: { code: 'BAD_USER_INPUT' } });
    const cust = await query('SELECT phone FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
    const phone = cust.rows[0]?.phone;
    if (!phone) throw new GraphQLError('This customer has no phone number.', { extensions: { code: 'BAD_USER_INPUT' } });

    const ordered = this._orderedParams(template, params);
    let status = 'sent', providerRef = null, error = null;
    try {
      const r = await whatsapp.sendTemplate({ to: phone, templateName: template.provider_template_id || key, languageCode: template.locale, params: ordered });
      providerRef = r.providerRef;
    } catch (e) {
      status = 'failed'; error = String(e.message).slice(0, 300);
      logger.error('[wa] send failed:', e.message);
    }
    const { rows } = await query(
      `INSERT INTO stitchd_wa_messages (tailor_id, customer_id, template_key, params, provider_ref, status, error)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING *`,
      [tailorId, customerId, key, JSON.stringify(params), providerRef, status, error]
    );
    const m = rows[0];
    if (status === 'failed') throw new GraphQLError('Could not send the WhatsApp message.', { extensions: { code: 'BAD_GATEWAY' } });
    return { id: m.id, templateKey: m.template_key, status: m.status, sentAt: m.sent_at };
  },

  async setWaOptIn(tailorId, customerId, enabled) {
    const { rowCount } = await query('UPDATE stitchd_customers SET wa_auto_optin=$3, updated_at=now() WHERE tailor_id=$1 AND id=$2', [tailorId, customerId, !!enabled]);
    if (!rowCount) throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    return !!enabled;
  },

  /**
   * Unified channel router. Returns { channel: 'whatsapp'|'sms'|'manual', body? }.
   * - WhatsApp API: customer opted in AND provider configured.
   * - SMS: customer's preferred channel is 'sms' (or WA send failed) — interpolated body.
   * - manual: caller should open a wa.me deep link (batch 06) with `body`.
   */
  async notifyCustomer(tailorId, customerId, key, params = {}) {
    const { rows } = await query('SELECT phone, wa_auto_optin, preferred_channel FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
    const cust = rows[0];
    if (!cust) throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    const template = await this._resolveTemplate(tailorId, key);
    const body = template ? interpolate(template.body, this._orderedParams(template, params)) : '';

    if (cust.wa_auto_optin && whatsapp.isConfigured()) {
      try { await this.sendTemplate(tailorId, customerId, key, params); return { channel: 'whatsapp', body }; }
      catch (e) { logger.error('[wa] auto-notify failed, falling back:', e.message); }
    }
    if (cust.preferred_channel === 'sms' && body) {
      try { await StitchdPortalModel.sendSms(tailorId, customerId, body); return { channel: 'sms', body }; }
      catch (e) { logger.error('[wa] SMS fallback failed:', e.message); }
    }
    return { channel: 'manual', body };
  },

  /** Webhook ingest: Meta delivery statuses → update stitchd_wa_messages by provider_ref. */
  async ingestWebhook(payload) {
    try {
      const entries = payload?.entry || [];
      for (const e of entries) {
        for (const ch of e.changes || []) {
          for (const st of ch.value?.statuses || []) {
            const status = ['sent', 'delivered', 'read', 'failed'].includes(st.status) ? st.status : null;
            if (status && st.id) {
              await query('UPDATE stitchd_wa_messages SET status=$2 WHERE provider_ref=$1', [st.id, status]).catch(() => {});
            }
          }
        }
      }
    } catch (e) { logger.error('[wa] webhook ingest error:', e.message); }
    return true;
  },
};

export default StitchdWaModel;
