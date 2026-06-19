/**
 * StitchdAiMessageModel — Fit Consultant chat persistence (batch 07, migration 051).
 *
 * Stores each conversation turn so the chat survives restarts and an assistant answer can
 * be saved as a note on a customer/order. Tenant isolation (doc 01 §3): every method takes
 * `tailorId` first and scopes by it. User turns are idempotent on (tailorId, clientUuid).
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';

const FEATURE = 'fit_consultant';

function format(row) {
  if (!row) return null;
  return {
    id:         row.id,
    clientUuid: row.client_uuid || null,
    feature:    row.feature,
    role:       row.role,
    content:    row.content,
    customerId: row.customer_id || null,
    orderId:    row.order_id || null,
    photoUrls:  row.photo_urls || [],
    createdAt:  row.created_at,
  };
}

const StitchdAiMessageModel = {
  FEATURE,
  format,

  /** Conversation history for a feature, oldest-first (chat order). */
  async history(tailorId, { feature = FEATURE, limit = 50 } = {}) {
    const { rows } = await query(
      `SELECT * FROM stitchd_ai_messages
        WHERE tailor_id=$1 AND feature=$2
        ORDER BY created_at ASC
        LIMIT $3`,
      [tailorId, feature, limit]
    );
    return rows.map(format);
  },

  /**
   * Record a user turn. Idempotent on (tailorId, clientUuid): a replayed send returns the
   * existing row instead of inserting a duplicate.
   */
  async recordUserTurn(tailorId, { clientUuid, content, customerId = null, orderId = null, photoUrls = [], feature = FEATURE }) {
    const { rows } = await query(
      `INSERT INTO stitchd_ai_messages
         (tailor_id, client_uuid, feature, role, content, customer_id, order_id, photo_urls)
       VALUES ($1,$2,$3,'user',$4,$5,$6,$7::jsonb)
       ON CONFLICT (tailor_id, client_uuid) WHERE client_uuid IS NOT NULL DO NOTHING
       RETURNING *`,
      [tailorId, clientUuid || null, feature, content, customerId, orderId, JSON.stringify(photoUrls || [])]
    );
    if (rows[0]) return format(rows[0]);
    // Idempotent replay.
    const existing = await query(
      `SELECT * FROM stitchd_ai_messages WHERE tailor_id=$1 AND client_uuid=$2`,
      [tailorId, clientUuid]
    );
    return format(existing.rows[0]);
  },

  /** Record an assistant answer (no client_uuid; never replayed). */
  async recordAssistantTurn(tailorId, { content, customerId = null, orderId = null, feature = FEATURE }) {
    const { rows } = await query(
      `INSERT INTO stitchd_ai_messages
         (tailor_id, feature, role, content, customer_id, order_id)
       VALUES ($1,$2,'assistant',$3,$4,$5)
       RETURNING *`,
      [tailorId, feature, content, customerId, orderId]
    );
    return format(rows[0]);
  },

  /** Tenant-scoped single read (for save-as-note), or null. */
  async findById(tailorId, id) {
    const { rows } = await query(
      `SELECT * FROM stitchd_ai_messages WHERE tailor_id=$1 AND id=$2`,
      [tailorId, id]
    );
    return format(rows[0]);
  },

  /** Whether `customerId` / `orderId` belong to this tenant (ownership check for save-as-note). */
  async assertTargetOwned(tailorId, { customerId, orderId }) {
    if (customerId) {
      const { rows } = await query('SELECT 1 FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
      if (!rows.length) throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    }
    if (orderId) {
      const { rows } = await query('SELECT 1 FROM stitchd_orders WHERE id=$1 AND tailor_id=$2', [orderId, tailorId]);
      if (!rows.length) throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });
    }
  },

  /**
   * Append `text` (the AI answer) to the customer's and/or order's notes, tenant-scoped.
   * Existing notes are preserved; the AI note is appended under a labelled separator.
   */
  async appendNoteToTarget(tailorId, { customerId, orderId, text }) {
    const block = `\n\n— AI Fit Consultant —\n${String(text || '').trim()}`;
    if (customerId) {
      await query(
        `UPDATE stitchd_customers
            SET notes = TRIM(LEADING FROM COALESCE(notes, '') || $3), updated_at = now()
          WHERE tailor_id=$1 AND id=$2`,
        [tailorId, customerId, block]
      );
    }
    if (orderId) {
      await query(
        `UPDATE stitchd_orders
            SET notes = TRIM(LEADING FROM COALESCE(notes, '') || $3), updated_at = now()
          WHERE tailor_id=$1 AND id=$2`,
        [tailorId, orderId, block]
      );
    }
  },
};

export default StitchdAiMessageModel;
