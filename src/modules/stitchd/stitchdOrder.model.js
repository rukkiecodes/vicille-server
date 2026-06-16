/**
 * StitchdOrderModel — tenant-scoped order lifecycle (batch 04).
 *
 * The operational heart of Stitchd. Unlike the Vicelle internal app there is NO QC gate
 * and NO admin assignment — the tailor advances status one step at a time
 * (New → In Progress → Ready → Delivered → Closed), each logged to an activity timeline.
 *
 * Tenant isolation (doc 01 §3, layer 2): every method takes `tailorId` first and scopes by
 * it; customer + measurement-set ownership is validated on write.
 *
 * Balance source of truth (single recompute path): balance_owed = total_price − deposit_paid
 * − Σ payments. Payments land in batch 05; until then Σ payments = 0, so balance reflects
 * total − deposit. `recomputeBalance` is the one place this is computed.
 */
import { GraphQLError } from 'graphql';
import { query, getClient } from '../../infrastructure/database/postgres.js';

export const STATUS_FLOW = ['New', 'In Progress', 'Ready', 'Delivered', 'Closed'];

/** The next status after `s` in the flow, or null if already at the end / unknown. */
function nextStatus(s) {
  const i = STATUS_FLOW.indexOf(s);
  if (i === -1 || i === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[i + 1];
}

const num = (v) => (v == null ? 0 : Number(v));

function formatItem(row) {
  return {
    id:           row.id,
    garmentType:  row.garment_type || null,
    quantity:     row.quantity ?? 1,
    fabricNotes:  row.fabric_notes || null,
    unitPrice:    num(row.unit_price),
    instructions: row.instructions || null,
    position:     row.position ?? 0,
  };
}

function formatActivity(row) {
  return {
    id:         row.id,
    kind:       row.kind,
    fromStatus: row.from_status || null,
    toStatus:   row.to_status || null,
    actor:      row.actor || null,
    meta:       row.meta || {},
    ts:         row.ts,
  };
}

/** Shape an order row (+ optional items/activity/customerName) into the GraphQL projection. */
function format(row, { items = [], activity = [], customerName = null } = {}) {
  if (!row) return null;
  return {
    id:                     row.id,
    customerId:             row.customer_id,
    customerName:           customerName ?? row.customer_name ?? null,
    orderNumber:            row.order_number,
    createdOn:              row.created_on,
    dueDate:                row.due_date || null,
    status:                 row.status,
    linkedMeasurementSetId: row.linked_measurement_set_id || null,
    totalPrice:             num(row.total_price),
    depositPaid:            num(row.deposit_paid),
    balanceOwed:            num(row.balance_owed),
    materials:              row.materials || [],
    photos:                 row.photos || [],
    voiceNotes:             row.voice_notes || [],
    notes:                  row.notes || null,
    source:                 row.source || 'direct',
    itemCount:              row.item_count != null ? Number(row.item_count) : items.length,
    items:                  items.map(formatItem),
    activity:               activity.map(formatActivity),
    createdAt:              row.created_at,
    updatedAt:              row.updated_at,
  };
}

/** total = Σ(qty × unitPrice) unless an explicit override is provided. */
function computeTotal(items, override) {
  if (override != null && !Number.isNaN(Number(override))) return Number(override);
  return (items || []).reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0);
}

function recomputeBalance(total, deposit, paid = 0) {
  return Math.max(0, Number(total) - Number(deposit) - Number(paid));
}

const StitchdOrderModel = {
  STATUS_FLOW,
  nextStatus,
  recomputeBalance,

  async customerBelongsToTailor(tailorId, customerId) {
    const { rows } = await query('SELECT 1 FROM stitchd_customers WHERE id=$1 AND tailor_id=$2', [customerId, tailorId]);
    return rows.length > 0;
  },

  async logActivity(client, tailorId, orderId, entry) {
    await client.query(
      `INSERT INTO stitchd_order_activity (order_id, tailor_id, kind, from_status, to_status, actor, meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orderId, tailorId, entry.kind, entry.fromStatus || null, entry.toStatus || null, entry.actor || null, JSON.stringify(entry.meta || {})]
    );
  },

  /** The customer's latest measurement set id, or null. */
  async latestMeasurementSetId(tailorId, customerId) {
    const { rows } = await query(
      `SELECT id FROM stitchd_measurement_sets
        WHERE tailor_id=$1 AND customer_id=$2
        ORDER BY version DESC, created_at DESC LIMIT 1`,
      [tailorId, customerId]
    );
    return rows[0]?.id || null;
  },

  /**
   * Create an order + items in one transaction. Defaults due_date to +2 weeks and the
   * linked measurement set to the customer's latest. Accepts a client UUID (idempotent).
   * Writes a "created" activity entry.
   */
  async create(tailorId, input = {}) {
    if (!(await this.customerBelongsToTailor(tailorId, input.customerId))) {
      throw new GraphQLError('Customer not found.', { extensions: { code: 'NOT_FOUND' } });
    }
    // Idempotent re-send.
    if (input.id) {
      const existing = await this.findById(tailorId, input.id);
      if (existing) return existing;
    }

    const items = Array.isArray(input.items) ? input.items : [];
    const total = computeTotal(items, input.totalPrice);
    const deposit = Number(input.depositPaid || 0);
    const balance = recomputeBalance(total, deposit);

    const dueDate =
      input.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const linkedSetId =
      input.linkedMeasurementSetId || (await this.latestMeasurementSetId(tailorId, input.customerId));

    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows: numRows } = await client.query(
        'SELECT COALESCE(MAX(order_number),0)+1 AS n FROM stitchd_orders WHERE tailor_id=$1',
        [tailorId]
      );
      const orderNumber = numRows[0].n;

      const { rows: orderRows } = await client.query(
        `INSERT INTO stitchd_orders
           (id, tailor_id, customer_id, order_number, due_date, status,
            linked_measurement_set_id, total_price, deposit_paid, balance_owed,
            materials, photos, voice_notes, notes, source)
         VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, 'New',
                 $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13, 'direct')
         ON CONFLICT (id) DO NOTHING
         RETURNING *`,
        [
          input.id || null, tailorId, input.customerId, orderNumber, dueDate,
          linkedSetId, total, deposit, balance,
          JSON.stringify(input.materials || []),
          JSON.stringify(input.photos || []),
          JSON.stringify(input.voiceNotes || []),
          input.notes || null,
        ]
      );

      if (!orderRows[0]) {
        await client.query('ROLLBACK');
        return input.id ? this.findById(tailorId, input.id) : null;
      }
      const order = orderRows[0];

      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        await client.query(
          `INSERT INTO stitchd_order_items
             (order_id, tailor_id, garment_type, quantity, fabric_notes, unit_price, instructions, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [order.id, tailorId, it.garmentType || null, it.quantity || 1, it.fabricNotes || null, it.unitPrice || 0, it.instructions || null, i]
        );
      }

      // Deposit captured at creation is recorded as a cash payment so balances and
      // payment history have a single source of truth (the balance trigger then
      // recomputes deposit_paid/balance_owed from payments — batch 05).
      if (deposit > 0) {
        await client.query(
          `INSERT INTO stitchd_payments
             (client_uuid, tailor_id, customer_id, order_id, type, amount, currency, method, note)
           VALUES (gen_random_uuid(), $1, $2, $3, 'cash_recorded', $4, 'NGN', 'cash', 'Deposit at order creation')`,
          [tailorId, input.customerId, order.id, deposit]
        );
        await this.logActivity(client, tailorId, order.id, { kind: 'payment', meta: { amount: deposit, deposit: true } });
      }

      await this.logActivity(client, tailorId, order.id, {
        kind: 'created', toStatus: 'New', meta: { orderNumber, total },
      });

      await client.query('COMMIT');
      return this.findById(tailorId, order.id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },

  /** Queue list: tenant-scoped, filtered/sorted, with customer name + item count. */
  async list(tailorId, opts = {}) {
    const where = ['o.tailor_id = $1'];
    const vals = [tailorId];
    const filter = opts.filter || 'ALL';
    if (filter === 'NEW') where.push(`o.status = 'New'`);
    else if (filter === 'IN_PROGRESS') where.push(`o.status = 'In Progress'`);
    else if (filter === 'READY') where.push(`o.status = 'Ready'`);
    else if (filter === 'OVERDUE') where.push(`o.due_date < CURRENT_DATE AND o.status NOT IN ('Delivered','Closed')`);
    else if (filter === 'ACTIVE') where.push(`o.status NOT IN ('Delivered','Closed')`);

    const orderBy =
      opts.sort === 'CREATED' ? 'o.created_at DESC'
      : opts.sort === 'CUSTOMER' ? 'c.name ASC'
      : 'o.due_date ASC NULLS LAST';

    const { rows } = await query(
      `SELECT o.*, c.name AS customer_name,
              (SELECT COUNT(*) FROM stitchd_order_items i WHERE i.order_id = o.id) AS item_count
         FROM stitchd_orders o
         JOIN stitchd_customers c ON c.id = o.customer_id
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}`,
      vals
    );
    return rows.map((r) => format(r, { customerName: r.customer_name }));
  },

  /** Orders with a due date inside [start, end] for the calendar (lightweight). */
  async byDateRange(tailorId, start, end) {
    const { rows } = await query(
      `SELECT o.*, c.name AS customer_name,
              (SELECT COUNT(*) FROM stitchd_order_items i WHERE i.order_id = o.id) AS item_count
         FROM stitchd_orders o
         JOIN stitchd_customers c ON c.id = o.customer_id
        WHERE o.tailor_id = $1 AND o.due_date BETWEEN $2 AND $3
        ORDER BY o.due_date ASC`,
      [tailorId, start, end]
    );
    return rows.map((r) => format(r, { customerName: r.customer_name }));
  },

  /** Full detail: order + items + activity timeline + customer name. */
  async findById(tailorId, id) {
    const { rows } = await query(
      `SELECT o.*, c.name AS customer_name
         FROM stitchd_orders o
         JOIN stitchd_customers c ON c.id = o.customer_id
        WHERE o.tailor_id = $1 AND o.id = $2`,
      [tailorId, id]
    );
    if (!rows[0]) return null;
    const [{ rows: items }, { rows: activity }] = await Promise.all([
      query('SELECT * FROM stitchd_order_items WHERE order_id=$1 ORDER BY position ASC', [id]),
      query('SELECT * FROM stitchd_order_activity WHERE order_id=$1 ORDER BY ts DESC', [id]),
    ]);
    return format(rows[0], { items, activity, customerName: rows[0].customer_name });
  },

  /** Raw order row (tenant-scoped) — internal helper. */
  async _row(tailorId, id) {
    const { rows } = await query('SELECT * FROM stitchd_orders WHERE tailor_id=$1 AND id=$2', [tailorId, id]);
    return rows[0] || null;
  },

  /**
   * Advance status one step (or to an explicit `toStatus`). No QC gate. Logs activity.
   * Idempotent if the target equals the current status. Optionally attaches a completion
   * photo + note (typically on → Ready).
   */
  async advanceStatus(tailorId, id, toStatus = null, extras = {}) {
    const row = await this._row(tailorId, id);
    if (!row) throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });

    const target = toStatus || nextStatus(row.status);
    if (!target) return this.findById(tailorId, id); // already Closed
    if (target === row.status) return this.findById(tailorId, id); // idempotent
    if (!STATUS_FLOW.includes(target)) {
      throw new GraphQLError('Invalid status.', { extensions: { code: 'BAD_USER_INPUT' } });
    }

    const client = await getClient();
    try {
      await client.query('BEGIN');

      let photos = row.photos || [];
      if (extras.completionPhoto) {
        const p = extras.completionPhoto;
        if (!photos.some((x) => x.id === p.id)) {
          photos = [...photos, { id: p.id, kind: p.kind || 'completed', url: p.url, ts: p.ts || new Date().toISOString() }];
        }
      }

      await client.query(
        `UPDATE stitchd_orders SET status=$1, photos=$2::jsonb, updated_at=now() WHERE tailor_id=$3 AND id=$4`,
        [target, JSON.stringify(photos), tailorId, id]
      );
      await this.logActivity(client, tailorId, id, {
        kind: 'status', fromStatus: row.status, toStatus: target,
        meta: extras.note ? { note: extras.note } : {},
      });

      await client.query('COMMIT');
      return this.findById(tailorId, id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },

  /** Edit due date / notes / total override / items (replace). Recomputes balance + logs edit. */
  async update(tailorId, id, patch = {}) {
    const row = await this._row(tailorId, id);
    if (!row) throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });

    const client = await getClient();
    try {
      await client.query('BEGIN');

      let total = num(row.total_price);
      if (Array.isArray(patch.items)) {
        await client.query('DELETE FROM stitchd_order_items WHERE order_id=$1', [id]);
        for (let i = 0; i < patch.items.length; i++) {
          const it = patch.items[i];
          await client.query(
            `INSERT INTO stitchd_order_items
               (order_id, tailor_id, garment_type, quantity, fabric_notes, unit_price, instructions, position)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [id, tailorId, it.garmentType || null, it.quantity || 1, it.fabricNotes || null, it.unitPrice || 0, it.instructions || null, i]
          );
        }
        total = computeTotal(patch.items, patch.totalPrice);
      } else if (patch.totalPrice != null) {
        total = Number(patch.totalPrice);
      }

      const deposit = patch.depositPaid != null ? Number(patch.depositPaid) : num(row.deposit_paid);
      const balance = recomputeBalance(total, deposit);

      await client.query(
        `UPDATE stitchd_orders
            SET due_date = COALESCE($1, due_date),
                notes    = COALESCE($2, notes),
                total_price = $3,
                deposit_paid = $4,
                balance_owed = $5,
                updated_at = now()
          WHERE tailor_id=$6 AND id=$7`,
        [patch.dueDate || null, patch.notes ?? null, total, deposit, balance, tailorId, id]
      );
      await this.logActivity(client, tailorId, id, { kind: 'edit', meta: { total } });

      await client.query('COMMIT');
      return this.findById(tailorId, id);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },

  async remove(tailorId, id) {
    const { rowCount } = await query('DELETE FROM stitchd_orders WHERE tailor_id=$1 AND id=$2', [tailorId, id]);
    return rowCount > 0;
  },

  async updateMaterials(tailorId, id, materials) {
    const { rows } = await query(
      `UPDATE stitchd_orders SET materials=$1::jsonb, updated_at=now()
        WHERE tailor_id=$2 AND id=$3 RETURNING id`,
      [JSON.stringify(materials || []), tailorId, id]
    );
    if (!rows[0]) throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });
    return this.findById(tailorId, id);
  },

  /** Append a photo {id,kind,url,ts}; dedupe by id so retries don't double-add. Logs activity. */
  async addPhoto(tailorId, id, photo) {
    const row = await this._row(tailorId, id);
    if (!row) throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });
    const photos = row.photos || [];
    if (!photos.some((p) => p.id === photo.id)) {
      photos.push({ id: photo.id, kind: photo.kind || 'progress', url: photo.url, ts: photo.ts || new Date().toISOString() });
      const client = await getClient();
      try {
        await client.query('BEGIN');
        await client.query(`UPDATE stitchd_orders SET photos=$1::jsonb, updated_at=now() WHERE tailor_id=$2 AND id=$3`,
          [JSON.stringify(photos), tailorId, id]);
        await this.logActivity(client, tailorId, id, { kind: 'photo', meta: { kind: photo.kind || 'progress' } });
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    }
    return this.findById(tailorId, id);
  },

  /** Append a voice note {id,url,ts}; dedupe by id. */
  async addVoiceNote(tailorId, id, voice) {
    const row = await this._row(tailorId, id);
    if (!row) throw new GraphQLError('Order not found.', { extensions: { code: 'NOT_FOUND' } });
    const notes = row.voice_notes || [];
    if (!notes.some((v) => v.id === voice.id)) {
      notes.push({ id: voice.id, url: voice.url, ts: voice.ts || new Date().toISOString() });
      await query(`UPDATE stitchd_orders SET voice_notes=$1::jsonb, updated_at=now() WHERE tailor_id=$2 AND id=$3`,
        [JSON.stringify(notes), tailorId, id]);
    }
    return this.findById(tailorId, id);
  },
};

export default StitchdOrderModel;
