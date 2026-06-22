/**
 * StitchdTagModel — colour-coded customer tags + birthday lookup (batch 13).
 *
 * Tags live in `stitchd_customer_tags` (created in batch 02). Tenant isolation (doc 01 §3):
 * every method takes `tailorId` first and scopes by it; customer ownership is validated on
 * write. Tag filtering itself is done client-side from the local store (offline-first); the
 * backend supplies tags per customer + CRUD.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';

const MAX_LABEL = 24;

function format(row) {
  return { id: row.id, customerId: row.customer_id, label: row.label, color: row.color || null, createdAt: row.created_at };
}

const StitchdTagModel = {
  format,

  /** Tags on one customer (tenant-scoped). */
  async forCustomer(tailorId, customerId) {
    const { rows } = await query(
      'SELECT * FROM stitchd_customer_tags WHERE tailor_id=$1 AND customer_id=$2 ORDER BY created_at ASC',
      [tailorId, customerId]
    );
    return rows.map(format);
  },

  /** Distinct labels (+colour) the tailor has used — powers the filter bar. */
  async distinctLabels(tailorId) {
    const { rows } = await query(
      `SELECT DISTINCT ON (label) label, color
         FROM stitchd_customer_tags WHERE tailor_id=$1 ORDER BY label, created_at DESC`,
      [tailorId]
    );
    return rows.map((r) => ({ label: r.label, color: r.color || null }));
  },

  async add(tailorId, customerId, label, color) {
    const clean = String(label || '').trim().slice(0, MAX_LABEL);
    if (!clean) throw new GraphQLError('Tag label is required.', { extensions: { code: 'BAD_USER_INPUT' } });
    const owns = await query('SELECT 1 FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
    if (!owns.rows.length) throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    const { rows } = await query(
      `INSERT INTO stitchd_customer_tags (customer_id, tailor_id, label, color)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (customer_id, label) DO UPDATE SET color = EXCLUDED.color
       RETURNING *`,
      [customerId, tailorId, clean, color || null]
    );
    return format(rows[0]);
  },

  async remove(tailorId, id) {
    const { rowCount } = await query('DELETE FROM stitchd_customer_tags WHERE tailor_id=$1 AND id=$2', [tailorId, id]);
    return rowCount > 0;
  },

  /**
   * Customers whose birthday (dob MM-DD) is today in WAT (UTC+1), so the cron/in-app banner
   * doesn't fire a day early. Returns lightweight customer rows for the birthday surface.
   */
  async birthdaysToday(tailorId, now = new Date()) {
    // WAT = UTC+1; shift then take MM-DD.
    const wat = new Date(now.getTime() + 60 * 60 * 1000);
    const mmdd = `${String(wat.getUTCMonth() + 1).padStart(2, '0')}-${String(wat.getUTCDate()).padStart(2, '0')}`;
    const { rows } = await query(
      `SELECT id, name, phone, profile_photo, dob
         FROM stitchd_customers
        WHERE tailor_id=$1 AND dob IS NOT NULL AND to_char(dob,'MM-DD')=$2
        ORDER BY name ASC`,
      [tailorId, mmdd]
    );
    return rows.map((r) => ({
      id: r.id, name: r.name, phone: r.phone || null, profilePhoto: r.profile_photo || null, dob: r.dob,
    }));
  },
};

export default StitchdTagModel;
