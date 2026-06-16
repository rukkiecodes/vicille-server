/**
 * StitchdCustomerModel — tenant-scoped data access for `stitchd_customers` (batch 02).
 *
 * Tenant isolation (doc 01 §3, layer 2): EVERY method takes `tailorId` as its first
 * argument and scopes the query by it (WHERE tailor_id = $tailorId). A Stitchd tailor
 * can only ever read/write its own customers — there is no cross-tenant accessor.
 *
 * Customers are tailor-OWNED records, distinct from Vicelle's shared `users` (doc 01 §2).
 *
 * Stats (owedAmount / totalSpent / totalOrders / lastOrderDate) are derived from
 * `stitchd_orders` / `stitchd_payments`, which do not exist until batches 04/05. Until
 * then they are returned zero-safe (0 / null). The single place that computes them is
 * `withStats()` below, so wiring real stats later is a one-spot change.
 */
import { query } from '../../infrastructure/database/postgres.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const RECENT_INTERVAL = "30 days";

/** Allowed sort keys → SQL ORDER BY fragments (whitelist; never interpolate user input). */
const SORT_SQL = {
  recent: 'created_at DESC',
  az: 'lower(name) ASC',
  // orders/spent depend on stats tables (batches 04/05); fall back to recent for now so
  // the sort is still stable and the contract value is accepted.
  orders: 'created_at DESC',
  spent: 'created_at DESC',
};

/** Shape a raw DB row into the GraphQL `StitchdCustomer` projection (no stats). */
function format(row) {
  if (!row) return null;
  return {
    id:             row.id,
    name:           row.name,
    phone:          row.phone || null,
    secondaryPhone: row.secondary_phone || null,
    email:          row.email || null,
    profilePhoto:   row.profile_photo || null,
    fullBodyPhoto:  row.full_body_photo || null,
    dob:            row.dob || null,
    address:        row.address || null,
    landmark:       row.landmark || null,
    notes:          row.notes || null,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };
}

/**
 * Attach computed stats to a formatted customer. Zero-safe until orders/payments exist
 * (batches 04/05 replace the constants here with real aggregates).
 */
function withStats(customer) {
  if (!customer) return null;
  return {
    ...customer,
    totalOrders:   0,
    totalSpent:    0,
    owedAmount:    0,
    lastOrderDate: null,
  };
}

const StitchdCustomerModel = {
  format,
  withStats,

  /**
   * Tenant-scoped, paginated list with search / filter / sort.
   * @param {string} tailorId
   * @param {object} opts - { search?, filter?, sort?, page?, pageSize? }
   * @returns {Promise<{ items: object[], page: number, pageSize: number, total: number }>}
   */
  async list(tailorId, opts = {}) {
    const where = ['tailor_id = $1'];
    const vals = [tailorId];
    let i = 2;

    // ── Search (name ILIKE, or phone digit-contains) ─────────────────────────
    const search = (opts.search || '').trim();
    if (search) {
      const digits = search.replace(/[^\d]/g, '');
      if (digits) {
        where.push(`(name ILIKE $${i} OR phone ILIKE $${i + 1} OR secondary_phone ILIKE $${i + 1})`);
        vals.push(`%${search}%`, `%${digits}%`);
        i += 2;
      } else {
        where.push(`name ILIKE $${i}`);
        vals.push(`%${search}%`);
        i += 1;
      }
    }

    // ── Filter chips ─────────────────────────────────────────────────────────
    // 'all'   — no extra clause.
    // 'recent'— created within the recent window.
    // 'owes'  — balance > 0; depends on payments (batch 05). Until then nobody owes,
    //           so this filter returns empty rather than wrong data (graceful).
    const filter = opts.filter || 'all';
    if (filter === 'recent') {
      where.push(`created_at > now() - INTERVAL '${RECENT_INTERVAL}'`);
    } else if (filter === 'owes') {
      where.push('FALSE'); // no owed balances until batch 05
    }

    const orderBy = SORT_SQL[opts.sort] || SORT_SQL.recent;

    const pageSize = Math.min(Math.max(parseInt(opts.pageSize, 10) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(parseInt(opts.page, 10) || 1, 1);
    const offset = (page - 1) * pageSize;

    const whereSql = where.join(' AND ');

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM stitchd_customers WHERE ${whereSql}`,
      vals
    );
    const total = countRows[0]?.total || 0;

    const { rows } = await query(
      `SELECT * FROM stitchd_customers
        WHERE ${whereSql}
        ORDER BY ${orderBy}
        LIMIT $${i} OFFSET $${i + 1}`,
      [...vals, pageSize, offset]
    );

    return {
      items: rows.map((r) => withStats(format(r))),
      page,
      pageSize,
      total,
    };
  },

  /** Tenant-scoped single read with stats, or null. */
  async findById(tailorId, id) {
    const { rows } = await query(
      'SELECT * FROM stitchd_customers WHERE tailor_id = $1 AND id = $2',
      [tailorId, id]
    );
    return withStats(format(rows[0]));
  },

  /**
   * Create a customer. Accepts a client-generated `id` (offline-first, doc 01 §8) and is
   * idempotent on it: re-sending the same id (e.g. a queued offline write that already
   * synced) returns the existing row instead of erroring or duplicating. Tenant-scoped:
   * the row is always stamped with the caller's tailorId.
   */
  async create(tailorId, input = {}) {
    const cols = ['tailor_id', 'name'];
    const placeholders = ['$1', '$2'];
    const vals = [tailorId, (input.name || '').trim()];
    let i = 3;

    const optional = {
      id:             input.id,
      phone:          input.phone,
      secondary_phone: input.secondaryPhone,
      email:          input.email,
      profile_photo:  input.profilePhoto,
      full_body_photo: input.fullBodyPhoto,
      dob:            input.dob,
      address:        input.address,
      landmark:       input.landmark,
      notes:          input.notes,
    };
    for (const [col, val] of Object.entries(optional)) {
      if (val !== undefined && val !== null && val !== '') {
        cols.push(col);
        placeholders.push(`$${i++}`);
        vals.push(val);
      }
    }

    const { rows } = await query(
      `INSERT INTO stitchd_customers (${cols.join(', ')})
       VALUES (${placeholders.join(', ')})
       ON CONFLICT (id) DO NOTHING
       RETURNING *`,
      vals
    );

    // ON CONFLICT skipped the insert (idempotent re-send) — return the existing row,
    // but only if it belongs to this tenant.
    if (!rows[0]) {
      if (input.id) return this.findById(tailorId, input.id);
      return null;
    }
    return withStats(format(rows[0]));
  },

  /**
   * Tenant-scoped update. Only provided fields are written; always bumps updated_at.
   * Returns the updated customer (with stats) or null if it isn't this tailor's.
   */
  async update(tailorId, id, input = {}) {
    const colMap = {
      name:           'name',
      phone:          'phone',
      secondaryPhone: 'secondary_phone',
      email:          'email',
      profilePhoto:   'profile_photo',
      fullBodyPhoto:  'full_body_photo',
      dob:            'dob',
      address:        'address',
      landmark:       'landmark',
      notes:          'notes',
    };

    const sets = [];
    const vals = [];
    let i = 1;
    for (const [jsKey, col] of Object.entries(colMap)) {
      if (jsKey in input && input[jsKey] !== undefined) {
        sets.push(`${col} = $${i++}`);
        vals.push(input[jsKey] === '' ? null : input[jsKey]);
      }
    }

    if (!sets.length) return this.findById(tailorId, id);

    sets.push('updated_at = now()');
    vals.push(tailorId, id);
    const { rows } = await query(
      `UPDATE stitchd_customers
          SET ${sets.join(', ')}
        WHERE tailor_id = $${i++} AND id = $${i}
        RETURNING *`,
      vals
    );
    return withStats(format(rows[0]));
  },
};

export default StitchdCustomerModel;
