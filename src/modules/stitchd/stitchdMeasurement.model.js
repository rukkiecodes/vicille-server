/**
 * StitchdMeasurementModel — tenant-scoped, append-only measurement sets (batch 03).
 *
 * Per doc 01 §2: measurement sets are versioned and NEVER overwritten. `append` creates a
 * new row with `version` = latest+1 and `previous_version_id` = the set it supersedes;
 * there is deliberately NO update/delete method. History reads come back newest-first with
 * a computed `changes` diff vs. the immediately-older version (only shared numeric keys).
 *
 * Tenant isolation (doc 01 §3, layer 2): every method takes `tailorId` first and scopes by
 * it; writes also verify the customer belongs to this tailor.
 */
import { GraphQLError } from 'graphql';
import { query } from '../../infrastructure/database/postgres.js';

/** Shape a raw DB row into the GraphQL `StitchdMeasurementSet` projection. */
function format(row) {
  if (!row) return null;
  return {
    id:                row.id,
    customerId:        row.customer_id,
    takenOn:           row.taken_on,
    takenBy:           row.taken_by || null,
    unit:              row.unit,
    garmentType:       row.garment_type || null,
    fields:            row.fields || {},
    photos:            row.photos || [],
    voiceNote:         row.voice_note || null,
    notes:             row.notes || null,
    version:           row.version,
    previousVersionId: row.previous_version_id || null,
    createdAt:         row.created_at,
    changes:           [], // populated by listByCustomer; empty on single reads
  };
}

/**
 * Compute the diff between a newer and older set: for every numeric field they share whose
 * value changed, emit { field, from, to, delta }. Fields only in one set are ignored
 * (garment types may differ between versions — compare shared keys only, per the plan).
 */
function computeChanges(newer, older) {
  if (!older) return [];
  const changes = [];
  const nf = newer.fields || {};
  const of = older.fields || {};
  for (const key of Object.keys(nf)) {
    if (!(key in of)) continue;
    const to = nf[key];
    const from = of[key];
    if (to === from) continue;
    const bothNumeric = typeof to === 'number' && typeof from === 'number';
    changes.push({ field: key, from, to, delta: bothNumeric ? Number((to - from).toFixed(2)) : null });
  }
  return changes;
}

const StitchdMeasurementModel = {
  format,
  computeChanges,

  /** True if the customer exists and belongs to this tailor. */
  async customerBelongsToTailor(tailorId, customerId) {
    const { rows } = await query(
      'SELECT 1 FROM stitchd_customers WHERE id = $1 AND tailor_id = $2',
      [customerId, tailorId]
    );
    return rows.length > 0;
  },

  /** History for a customer, newest-first, with computed diff vs the previous version. */
  async listByCustomer(tailorId, customerId) {
    const { rows } = await query(
      `SELECT * FROM stitchd_measurement_sets
        WHERE tailor_id = $1 AND customer_id = $2
        ORDER BY version DESC, created_at DESC`,
      [tailorId, customerId]
    );
    const sets = rows.map(format);
    // rows are newest-first, so the "older" comparison target is the next element.
    return sets.map((s, i) => ({ ...s, changes: computeChanges(s, sets[i + 1]) }));
  },

  /** Single set (tenant-scoped), or null. */
  async findById(tailorId, id) {
    const { rows } = await query(
      'SELECT * FROM stitchd_measurement_sets WHERE tailor_id = $1 AND id = $2',
      [tailorId, id]
    );
    return format(rows[0]);
  },

  /** The latest version row for a customer (for version+link computation). */
  async latestForCustomer(tailorId, customerId) {
    const { rows } = await query(
      `SELECT id, version FROM stitchd_measurement_sets
        WHERE tailor_id = $1 AND customer_id = $2
        ORDER BY version DESC, created_at DESC
        LIMIT 1`,
      [tailorId, customerId]
    );
    return rows[0] || null;
  },

  /**
   * Append a new measurement set (never updates). Computes version + previous_version_id
   * from the customer's latest set. Accepts a client-generated `id` and is idempotent on
   * it (a re-sent offline write returns the existing row).
   */
  async append(tailorId, input = {}) {
    const customerId = input.customerId;
    if (!(await this.customerBelongsToTailor(tailorId, customerId))) {
      throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    }

    // Idempotent re-send: same client UUID already stored → return it.
    if (input.id) {
      const existing = await this.findById(tailorId, input.id);
      if (existing) return existing;
    }

    const latest = await this.latestForCustomer(tailorId, customerId);
    const version = latest ? latest.version + 1 : 1;
    const previousVersionId = latest ? latest.id : null;

    const { rows } = await query(
      `INSERT INTO stitchd_measurement_sets
         (id, tailor_id, customer_id, taken_on, taken_by, unit, garment_type,
          fields, photos, voice_note, notes, version, previous_version_id)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3,
               COALESCE($4, CURRENT_DATE), $5, $6, $7,
               $8::jsonb, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      [
        input.id || null,
        tailorId,
        customerId,
        input.takenOn || null,
        input.takenBy || null,
        input.unit === 'cm' ? 'cm' : 'inch',
        input.garmentType || null,
        JSON.stringify(input.fields || {}),
        input.photos || null,
        input.voiceNote || null,
        input.notes || null,
        version,
        previousVersionId,
      ]
    );

    if (!rows[0]) {
      // Conflict (idempotent re-send raced) — return the existing row.
      return input.id ? this.findById(tailorId, input.id) : null;
    }
    return format(rows[0]);
  },
};

export default StitchdMeasurementModel;
