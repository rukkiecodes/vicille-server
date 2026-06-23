/**
 * StitchdTemplateModel — order templates + body-type measurement templates (batch 19).
 *
 * Saved configs that let a tailor re-create a common order, or pre-fill a measurement set, in a
 * few taps. Instantiation delegates to the canonical models (StitchdOrderModel.create /
 * StitchdMeasurementModel.append) so all the usual rules (totals, versioning) still apply.
 *
 * Tenant isolation (doc 01 §3): every method scopes by `tailorId`.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';
import StitchdOrderModel from './stitchdOrder.model.js';
import StitchdMeasurementModel from './stitchdMeasurement.model.js';

const num = (v) => (v == null ? null : Number(v));

const StitchdTemplateModel = {
  // ── Order templates ──────────────────────────────────────────────────────────
  formatOrderTemplate(r) {
    return {
      id: r.id, name: r.name, items: r.items || [],
      defaultDueOffsetDays: r.default_due_offset_days, defaultTotal: num(r.default_total),
      createdAt: r.created_at, updatedAt: r.updated_at,
    };
  },

  async listOrderTemplates(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_order_templates WHERE tailor_id=$1 ORDER BY updated_at DESC', [tailorId]);
    return rows.map((r) => this.formatOrderTemplate(r));
  },

  async createOrderTemplate(tailorId, { name, items, defaultDueOffsetDays, defaultTotal }) {
    if (!String(name || '').trim()) throw new GraphQLError('A template name is required.', { extensions: { code: 'BAD_USER_INPUT' } });
    const { rows } = await query(
      `INSERT INTO stitchd_order_templates (tailor_id, name, items, default_due_offset_days, default_total)
       VALUES ($1,$2,$3::jsonb,$4,$5) RETURNING *`,
      [tailorId, name.trim(), JSON.stringify(items || []), Number(defaultDueOffsetDays) || 14, defaultTotal ?? null]
    );
    return this.formatOrderTemplate(rows[0]);
  },

  async updateOrderTemplate(tailorId, id, { name, items, defaultDueOffsetDays, defaultTotal }) {
    const { rows } = await query(
      `UPDATE stitchd_order_templates SET
         name=COALESCE($3, name),
         items=COALESCE($4::jsonb, items),
         default_due_offset_days=COALESCE($5, default_due_offset_days),
         default_total=$6, updated_at=now()
       WHERE tailor_id=$1 AND id=$2 RETURNING *`,
      [tailorId, id, name ?? null, items ? JSON.stringify(items) : null, defaultDueOffsetDays ?? null, defaultTotal ?? null]
    );
    if (!rows[0]) throw new GraphQLError('Template not found.', { extensions: { code: 'NOT_FOUND' } });
    return this.formatOrderTemplate(rows[0]);
  },

  async deleteOrderTemplate(tailorId, id) {
    const { rowCount } = await query('DELETE FROM stitchd_order_templates WHERE tailor_id=$1 AND id=$2', [tailorId, id]);
    return rowCount > 0;
  },

  /** Create a new order for a customer from a template (items + due offset + default total). */
  async createOrderFromTemplate(tailorId, templateId, customerId) {
    const { rows } = await query('SELECT * FROM stitchd_order_templates WHERE tailor_id=$1 AND id=$2', [tailorId, templateId]);
    const t = rows[0];
    if (!t) throw new GraphQLError('Template not found.', { extensions: { code: 'NOT_FOUND' } });
    const offset = (t.default_due_offset_days || 14) * 24 * 60 * 60 * 1000;
    const dueDate = new Date(Date.now() + offset).toISOString().slice(0, 10);
    return StitchdOrderModel.create(tailorId, {
      customerId,
      items: (t.items || []).map((i) => ({
        garmentType: i.garmentType, quantity: i.quantity ?? 1, fabricNotes: i.fabricNotes || null,
        unitPrice: i.unitPrice ?? 0, instructions: i.instructions || null,
      })),
      totalPrice: t.default_total != null ? Number(t.default_total) : undefined,
      dueDate,
    });
  },

  // ── Body-type measurement templates ──────────────────────────────────────────
  formatBodyType(r) {
    return { id: r.id, name: r.name, unit: r.unit, garmentType: r.garment_type || null, fields: r.fields || {} };
  },

  async listBodyTypeTemplates(tailorId) {
    const { rows } = await query('SELECT * FROM stitchd_body_type_templates WHERE tailor_id=$1 ORDER BY name ASC', [tailorId]);
    return rows.map((r) => this.formatBodyType(r));
  },

  async createBodyTypeTemplate(tailorId, { name, unit, garmentType, fields }) {
    if (!String(name || '').trim()) throw new GraphQLError('A template name is required.', { extensions: { code: 'BAD_USER_INPUT' } });
    const { rows } = await query(
      `INSERT INTO stitchd_body_type_templates (tailor_id, name, unit, garment_type, fields)
       VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
      [tailorId, name.trim(), unit === 'cm' ? 'cm' : 'inch', garmentType || null, JSON.stringify(fields || {})]
    );
    return this.formatBodyType(rows[0]);
  },

  async deleteBodyTypeTemplate(tailorId, id) {
    const { rowCount } = await query('DELETE FROM stitchd_body_type_templates WHERE tailor_id=$1 AND id=$2', [tailorId, id]);
    return rowCount > 0;
  },

  /** Pre-fill + persist a new (versioned) measurement set from a body-type template. */
  async createMeasurementSetFromBodyType(tailorId, templateId, customerId) {
    const { rows } = await query('SELECT * FROM stitchd_body_type_templates WHERE tailor_id=$1 AND id=$2', [tailorId, templateId]);
    const t = rows[0];
    if (!t) throw new GraphQLError('Template not found.', { extensions: { code: 'NOT_FOUND' } });
    return StitchdMeasurementModel.append(tailorId, {
      customerId, unit: t.unit, garmentType: t.garment_type || null, fields: t.fields || {},
      notes: `From body-type template: ${t.name}`,
    });
  },
};

export default StitchdTemplateModel;
