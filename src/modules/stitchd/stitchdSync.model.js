/**
 * StitchdSyncModel — delta pull for offline-first refresh (batch 08, doc 01 §8).
 *
 * On reconnect the client passes its last cursor; the server returns every record CHANGED
 * since then (plus tombstoned ids) so the local store updates without re-fetching whole
 * lists. The cursor is the server's `now()` at pull time — using a server clock avoids
 * device clock skew (plan risk). Boundary overlap is harmless: every client upsert is
 * idempotent on id, so a row returned twice just overwrites itself.
 *
 * Scope: customers, orders (queue projection), payments — the entities behind the
 * dashboard/queue/money screens. Append-only measurement sets and message threads are
 * fetched per-customer on demand (they never conflict and carry derived fields), so they
 * are intentionally out of the delta.
 *
 * Tenant isolation (doc 01 §3): every query is scoped by `tailorId`.
 */
import { query } from '../../infrastructure/database/postgres.js';
import StitchdCustomerModel from './stitchdCustomer.model.js';
import StitchdPaymentModel from './stitchdPayment.model.js';

const num = (v) => (v == null ? 0 : Number(v));

/** Queue-projection of an order row (items/activity fetched on detail open). */
function formatOrder(row) {
  return {
    id:                     row.id,
    customerId:             row.customer_id,
    customerName:           row.customer_name ?? null,
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
    itemCount:              row.item_count != null ? Number(row.item_count) : 0,
    items:                  [],
    activity:               [],
    createdAt:              row.created_at,
    updatedAt:              row.updated_at,
  };
}

const StitchdSyncModel = {
  /**
   * Pull everything changed since `since` (ISO string or null for a full pull).
   * Returns { cursor, customers, orders, payments, deletedCustomerIds, deletedOrderIds }.
   */
  async pull(tailorId, since = null) {
    // A null cursor means "first sync" — pull everything live (not tombstones).
    const sinceTs = since || '1970-01-01T00:00:00.000Z';

    const [cursorRes, customersRes, ordersRes, paymentsRes, delCustRes, delOrderRes] = await Promise.all([
      query('SELECT now() AS cursor'),

      query(
        `SELECT * FROM stitchd_customers
          WHERE tailor_id=$1 AND deleted_at IS NULL AND updated_at > $2
          ORDER BY updated_at ASC`,
        [tailorId, sinceTs]
      ),

      query(
        `SELECT o.*, c.name AS customer_name,
                (SELECT COUNT(*) FROM stitchd_order_items i WHERE i.order_id = o.id) AS item_count
           FROM stitchd_orders o
           JOIN stitchd_customers c ON c.id = o.customer_id
          WHERE o.tailor_id=$1 AND o.deleted_at IS NULL AND o.updated_at > $2
          ORDER BY o.updated_at ASC`,
        [tailorId, sinceTs]
      ),

      query(
        `SELECT p.*, c.name AS customer_name
           FROM stitchd_payments p
           JOIN stitchd_customers c ON c.id = p.customer_id
          WHERE p.tailor_id=$1 AND GREATEST(p.created_at, p.updated_at) > $2
          ORDER BY p.created_at ASC`,
        [tailorId, sinceTs]
      ),

      // Tombstones — only meaningful on incremental pulls.
      since
        ? query('SELECT id FROM stitchd_customers WHERE tailor_id=$1 AND deleted_at > $2', [tailorId, sinceTs])
        : Promise.resolve({ rows: [] }),
      since
        ? query('SELECT id FROM stitchd_orders WHERE tailor_id=$1 AND deleted_at > $2', [tailorId, sinceTs])
        : Promise.resolve({ rows: [] }),
    ]);

    return {
      cursor: cursorRes.rows[0].cursor.toISOString(),
      customers: customersRes.rows.map((r) => StitchdCustomerModel.withStats(StitchdCustomerModel.format(r))),
      orders: ordersRes.rows.map(formatOrder),
      payments: paymentsRes.rows.map(StitchdPaymentModel.format),
      deletedCustomerIds: delCustRes.rows.map((r) => r.id),
      deletedOrderIds: delOrderRes.rows.map((r) => r.id),
    };
  },
};

export default StitchdSyncModel;
