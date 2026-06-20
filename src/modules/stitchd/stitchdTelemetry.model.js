/**
 * StitchdTelemetryModel — analytics events + beta feedback (batch 08, migration 052).
 *
 * Self-hosted in Supabase (no third-party vendor). The client sends only the event NAME and
 * non-PII props — measurements, phone numbers and customer details never leave the device
 * (spec §2.5 trust). Tenant isolation (doc 01 §3): every row is scoped to `tailorId`.
 */
import { query } from '../../infrastructure/database/postgres.js';

/** Keys we explicitly drop from any props object as a defence-in-depth PII guard. */
const PII_KEYS = new Set(['phone', 'secondaryPhone', 'email', 'name', 'customerName', 'address', 'measurements', 'fields']);

function scrub(props) {
  if (!props || typeof props !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (PII_KEYS.has(k)) continue;
    // Keep scalars/short values only; drop nested objects that could smuggle PII.
    if (v == null || typeof v === 'object') continue;
    out[k] = v;
  }
  return out;
}

const StitchdTelemetryModel = {
  scrub,

  /**
   * Record a batch of analytics events for one tenant. Best-effort: bad rows are skipped.
   * Each event = { event, props?, clientTs? }.
   */
  async recordEvents(tailorId, events = []) {
    const rows = (Array.isArray(events) ? events : []).filter((e) => e && typeof e.event === 'string' && e.event);
    if (!rows.length) return 0;

    const values = [];
    const params = [];
    let i = 1;
    for (const e of rows) {
      params.push(tailorId, e.event, JSON.stringify(scrub(e.props)), e.clientTs || null);
      values.push(`($${i++}, $${i++}, $${i++}::jsonb, $${i++})`);
    }
    await query(
      `INSERT INTO stitchd_analytics_events (tailor_id, event, props, client_ts) VALUES ${values.join(', ')}`,
      params
    );
    return rows.length;
  },

  /** Store an in-app beta feedback submission. */
  async recordFeedback(tailorId, { message, screenshotUrl = null, context = {} } = {}) {
    const text = String(message || '').trim();
    if (!text) return null;
    const { rows } = await query(
      `INSERT INTO stitchd_feedback (tailor_id, message, screenshot_url, context)
       VALUES ($1, $2, $3, $4::jsonb)
       RETURNING id, created_at`,
      [tailorId, text, screenshotUrl, JSON.stringify(context || {})]
    );
    return { id: rows[0].id, createdAt: rows[0].created_at };
  },
};

export default StitchdTelemetryModel;
