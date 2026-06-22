/**
 * StitchdAiSuiteModel — persistence for AI Brief Extractor + Design Generator (batch 12).
 *
 * Tenant isolation (doc 01 §3): every method takes `tailorId` first and scopes by it.
 * Generated design images are Cloudinary URLs (hosting handled in the service). Saving a
 * design to an order also appends its images to the order photos so they show on the order.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import StitchdOrderModel from './stitchdOrder.model.js';

function formatBrief(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id || null,
    orderId: row.order_id || null,
    sourceKind: row.source_kind,
    transcript: row.transcript || null,
    extracted: row.extracted || {},
    model: row.model || null,
    createdAt: row.created_at,
  };
}

function formatDesign(row) {
  if (!row) return null;
  return {
    id: row.id,
    customerId: row.customer_id || null,
    orderId: row.order_id || null,
    prompt: row.prompt,
    styleModifiers: row.style_modifiers || [],
    color: row.color || null,
    imageUrls: row.image_urls || [],
    provider: row.provider || null,
    model: row.model || null,
    createdAt: row.created_at,
  };
}

const StitchdAiSuiteModel = {
  formatBrief,
  formatDesign,

  async ownsCustomer(tailorId, customerId) {
    if (!customerId) return true;
    const { rows } = await query('SELECT 1 FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
    return rows.length > 0;
  },
  async ownsOrder(tailorId, orderId) {
    if (!orderId) return true;
    const { rows } = await query('SELECT 1 FROM stitchd_orders WHERE id=$1 AND tailor_id=$2 AND deleted_at IS NULL', [orderId, tailorId]);
    return rows.length > 0;
  },

  async recordBrief(tailorId, { customerId, orderId, sourceKind, sourceMediaUrl, transcript, extracted, model }) {
    const { rows } = await query(
      `INSERT INTO stitchd_ai_briefs
         (tailor_id, customer_id, order_id, source_kind, source_media_url, transcript, extracted, model)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)
       RETURNING *`,
      [tailorId, customerId || null, orderId || null, sourceKind || 'text', sourceMediaUrl || null, transcript || null, JSON.stringify(extracted || {}), model || null]
    );
    return formatBrief(rows[0]);
  },

  async listBriefs(tailorId, { limit = 30 } = {}) {
    const { rows } = await query('SELECT * FROM stitchd_ai_briefs WHERE tailor_id=$1 ORDER BY created_at DESC LIMIT $2', [tailorId, limit]);
    return rows.map(formatBrief);
  },

  async recordDesign(tailorId, { customerId, orderId, prompt, styleModifiers, color, imageUrls, provider, model }) {
    const { rows } = await query(
      `INSERT INTO stitchd_ai_designs
         (tailor_id, customer_id, order_id, prompt, style_modifiers, color, image_urls, provider, model)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9)
       RETURNING *`,
      [tailorId, customerId || null, orderId || null, prompt, JSON.stringify(styleModifiers || []), color || null, JSON.stringify(imageUrls || []), provider || 'gemini', model || null]
    );
    return formatDesign(rows[0]);
  },

  async listDesigns(tailorId, { limit = 30 } = {}) {
    const { rows } = await query('SELECT * FROM stitchd_ai_designs WHERE tailor_id=$1 ORDER BY created_at DESC LIMIT $2', [tailorId, limit]);
    return rows.map(formatDesign);
  },

  /** Attach a design to a customer/order; if an order, append its images to the order photos. */
  async saveDesignTo(tailorId, { designId, customerId, orderId }) {
    const { rows } = await query('SELECT * FROM stitchd_ai_designs WHERE tailor_id=$1 AND id=$2', [tailorId, designId]);
    const design = rows[0];
    if (!design) throw new GraphQLError('Design not found.', { extensions: { code: 'NOT_FOUND' } });
    if (!(await this.ownsCustomer(tailorId, customerId))) throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    if (!(await this.ownsOrder(tailorId, orderId))) throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });

    const { rows: upd } = await query(
      `UPDATE stitchd_ai_designs
          SET customer_id=COALESCE($2, customer_id), order_id=COALESCE($3, order_id)
        WHERE id=$1 RETURNING *`,
      [designId, customerId || null, orderId || null]
    );

    if (orderId) {
      const urls = design.image_urls || [];
      for (let i = 0; i < urls.length; i++) {
        await StitchdOrderModel.addPhoto(tailorId, orderId, {
          id: `design-${designId}-${i}`, kind: 'design', url: urls[i],
        }).catch(() => {});
      }
    }
    return formatDesign(upd[0]);
  },
};

export default StitchdAiSuiteModel;
