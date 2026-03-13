import { query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  return {
    id:               row.id,
    entityId:         row.id,
    order:            row.order_id,
    orderId:          row.order_id,
    collectionItem:   row.collection_item_id,
    name:             row.style_name,
    styleName:        row.style_name,
    category:         row.category || null,
    description:      row.description,
    fabric:           row.fabric,
    color:            row.color,
    customizations:   row.customizations,
    quantity:         row.quantity,
    itemStatus:       row.status,
    status:           row.status,
    createdAt:        row.created_at,
  };
}

const OrderItemModel = {
  async create(data) {
    const resolvedStyleName =
      data.name ||
      data.styleName ||
      data.style?.title ||
      data.style?.name ||
      data.description ||
      data.category ||
      'Custom style';

    const { rows } = await query(
      `INSERT INTO order_items
         (order_id, collection_item_id, style_name, description, fabric, color, quantity, customizations, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        data.order || data.orderId,
        data.collectionItem || data.collectionItemId || null,
        resolvedStyleName,
        data.description || null,
        data.fabric || null,
        data.color || null,
        data.quantity || 1,
        data.customizations || {},
        data.itemStatus || data.status || 'pending',
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM order_items WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      styleName:      'style_name',
      name:           'style_name',
      description:    'description',
      fabric:         'fabric',
      color:          'color',
      quantity:       'quantity',
      customizations: 'customizations',
      itemStatus:     'status',
      status:         'status',
    };
    const fields = [];
    const values = [];
    let i = 1;
    for (const [jsKey, dbCol] of Object.entries(colMap)) {
      if (jsKey in updates) { fields.push(`${dbCol}=$${i++}`); values.push(updates[jsKey]); }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    const { rows } = await query(
      `UPDATE order_items SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async findByOrder(orderId) {
    const { rows } = await query(
      'SELECT * FROM order_items WHERE order_id=$1 ORDER BY created_at ASC', [orderId]
    );
    return rows.map(format);
  },

  async delete(id) {
    await query('DELETE FROM order_items WHERE id=$1', [id]);
  },

  async deleteByOrder(orderId) {
    await query('DELETE FROM order_items WHERE order_id=$1', [orderId]);
  },
};

export default OrderItemModel;
