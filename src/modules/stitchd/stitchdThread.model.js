/**
 * StitchdThreadModel — tenant-scoped logged communication (batch 06).
 *
 * WhatsApp is the customer's interface, not Stitchd (spec §2.7); Stitchd can't read WhatsApp,
 * so threads log only OUTBOUND messages the tailor sent through it. The client logs what it
 * handed to WhatsApp AFTER launching the deep link — delivery can't be confirmed.
 *
 * Tenant isolation (doc 01 §3): every method takes `tailorId` first and scopes by it; the
 * customer is validated on write. System-default templates (tailor_id NULL) are global; a
 * tenant override (same key) shadows the default.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';

function formatTemplate(row) {
  if (!row) return null;
  return {
    key:          row.key,
    title:        row.title,
    bodyTemplate: row.body_template,
    placeholders: row.placeholders ?? [],
    isCustom:     row.tailor_id != null,
  };
}

function formatThread(row) {
  if (!row) return null;
  return {
    id:            row.id,
    customerId:    row.customer_id,
    lastMessageAt: row.last_message_at,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };
}

function formatMessage(row) {
  if (!row) return null;
  return {
    id:          row.id,
    clientUuid:  row.client_uuid,
    threadId:    row.thread_id,
    customerId:  row.customer_id,
    kind:        row.kind,
    body:        row.body ?? null,
    mediaUrl:    row.media_url ?? null,
    direction:   row.direction,
    templateKey: row.template_key ?? null,
    sentVia:     row.sent_via,
    createdAt:   row.created_at,
  };
}

const StitchdThreadModel = {
  formatTemplate,
  formatThread,
  formatMessage,

  async customerBelongsToTailor(tailorId, customerId) {
    const { rows } = await query('SELECT 1 FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
    return rows.length > 0;
  },

  /** Resolved templates: system defaults overridden by this tenant's edits (by key). */
  async templates(tailorId) {
    const { rows } = await query(
      `SELECT DISTINCT ON (key) key, title, body_template, placeholders, tailor_id
         FROM stitchd_message_templates
        WHERE tailor_id IS NULL OR tailor_id = $1
        ORDER BY key, tailor_id NULLS LAST`,
      [tailorId]
    );
    return rows.map(formatTemplate);
  },

  /** Find or create the (tailor, customer) thread. */
  async ensureThread(tailorId, customerId) {
    const existing = await query(
      'SELECT * FROM stitchd_threads WHERE tailor_id=$1 AND customer_id=$2',
      [tailorId, customerId]
    );
    if (existing.rows[0]) return existing.rows[0];
    const { rows } = await query(
      `INSERT INTO stitchd_threads (tailor_id, customer_id)
       VALUES ($1,$2)
       ON CONFLICT (tailor_id, customer_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [tailorId, customerId]
    );
    return rows[0];
  },

  /** The thread + messages for one customer, newest first (lazily creates an empty thread). */
  async customerThread(tailorId, customerId) {
    if (!(await this.customerBelongsToTailor(tailorId, customerId))) {
      throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    }
    const thread = await this.ensureThread(tailorId, customerId);
    const { rows } = await query(
      `SELECT * FROM stitchd_messages
        WHERE tailor_id=$1 AND thread_id=$2
        ORDER BY created_at DESC`,
      [tailorId, thread.id]
    );
    return { thread: formatThread(thread), messages: rows.map(formatMessage) };
  },

  /**
   * Append an outbound message to a customer's thread. Idempotent on (tailorId, clientUuid):
   * a replayed offline log returns the existing row (exactly one row after replay). Bumps the
   * thread's last_message_at. Returns { thread, message }.
   */
  async logMessage(tailorId, input = {}) {
    if (!input.clientUuid) throw new GraphQLError('Missing message id.', { extensions: { code: 'BAD_USER_INPUT' } });
    if (!(await this.customerBelongsToTailor(tailorId, input.customerId))) {
      throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    }
    const thread = await this.ensureThread(tailorId, input.customerId);

    const { rows } = await query(
      `INSERT INTO stitchd_messages
         (client_uuid, thread_id, tailor_id, customer_id, kind, body, direction, template_key, sent_via)
       VALUES ($1,$2,$3,$4,'text',$5,'outbound',$6,$7)
       ON CONFLICT (tailor_id, client_uuid) DO NOTHING
       RETURNING *`,
      [
        input.clientUuid, thread.id, tailorId, input.customerId,
        input.body ?? null, input.templateKey || null, input.sentVia || 'whatsapp',
      ]
    );

    let messageRow = rows[0];
    if (messageRow) {
      // Fresh insert — advance the thread cursor.
      await query('UPDATE stitchd_threads SET last_message_at = now(), updated_at = now() WHERE id=$1', [thread.id]);
      thread.last_message_at = messageRow.created_at;
    } else {
      const existing = await query(
        'SELECT * FROM stitchd_messages WHERE tailor_id=$1 AND client_uuid=$2',
        [tailorId, input.clientUuid]
      );
      messageRow = existing.rows[0];
    }

    return { thread: formatThread(thread), message: formatMessage(messageRow) };
  },

  /**
   * Log an imported (inbound) voice note with its transcript into the customer thread
   * (batch 13). `kind='voice'`, transcript stored in `body`, audio in `media_url`. Idempotent
   * on (tailorId, clientUuid). Transcription itself happens in the resolver (metered).
   */
  async logVoiceNote(tailorId, input = {}) {
    if (!input.clientUuid) throw new GraphQLError('Missing message id.', { extensions: { code: 'BAD_USER_INPUT' } });
    if (!(await this.customerBelongsToTailor(tailorId, input.customerId))) {
      throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    }
    const thread = await this.ensureThread(tailorId, input.customerId);
    const { rows } = await query(
      `INSERT INTO stitchd_messages
         (client_uuid, thread_id, tailor_id, customer_id, kind, body, media_url, direction, sent_via)
       VALUES ($1,$2,$3,$4,'voice',$5,$6,'inbound','whatsapp')
       ON CONFLICT (tailor_id, client_uuid) DO NOTHING
       RETURNING *`,
      [input.clientUuid, thread.id, tailorId, input.customerId, input.transcript ?? null, input.mediaUrl || null]
    );
    let messageRow = rows[0];
    if (messageRow) {
      await query('UPDATE stitchd_threads SET last_message_at = now(), updated_at = now() WHERE id=$1', [thread.id]);
    } else {
      const existing = await query('SELECT * FROM stitchd_messages WHERE tailor_id=$1 AND client_uuid=$2', [tailorId, input.clientUuid]);
      messageRow = existing.rows[0];
    }
    return { thread: formatThread(thread), message: formatMessage(messageRow) };
  },
};

export default StitchdThreadModel;
