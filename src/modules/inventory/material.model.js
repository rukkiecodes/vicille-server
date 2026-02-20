import { query } from '../../infrastructure/database/postgres.js';
import { generateSku } from '../../core/utils/randomCode.js';

function format(row) {
  if (!row) return null;
  const m = {
    id:               row.id,
    entityId:         row.id,
    name:             row.name,
    sku:              row.sku,
    category:         row.category,
    description:      row.description,
    supplier:         row.supplier,
    quantityInStock:  row.quantity_in_stock,
    unit:             row.unit,
    reorderLevel:     row.reorder_level,
    reorderQuantity:  row.reorder_quantity,
    costPerUnit:      row.cost_per_unit,
    currency:         row.currency,
    properties:       row.properties,
    images:           row.images || [],
    isActive:         row.is_active,
    lastRestocked:    row.last_restocked,
    lastIssued:       row.last_issued,
    createdBy:        row.created_by,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };

  Object.defineProperties(m, {
    isLowStock:   { get() { return this.quantityInStock <= this.reorderLevel; }},
    stockValue:   { get() { return this.quantityInStock * this.costPerUnit; }},
    primaryImage: { get() { return (this.images || [])[0] || null; }},
  });

  m.toSafeJSON = () => ({
    ...m, isLowStock: m.isLowStock, stockValue: m.stockValue, primaryImage: m.primaryImage,
  });

  return m;
}

const MaterialModel = {
  async create(data) {
    const prefix = data.category ? data.category.substring(0, 3).toUpperCase() : 'MAT';
    const sku = data.sku || generateSku(prefix);

    const { rows } = await query(
      `INSERT INTO inventory
         (name, sku, category, description, supplier, quantity_in_stock, unit,
          reorder_level, reorder_quantity, cost_per_unit, currency, properties,
          images, is_active, last_restocked, last_issued, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        data.name,
        sku,
        data.category || null,
        data.description || null,
        data.supplier || null,
        data.quantityInStock || 0,
        data.unit || null,
        data.reorderLevel  ?? 10,
        data.reorderQuantity ?? 50,
        data.costPerUnit || 0,
        data.currency || 'NGN',
        data.properties || null,
        data.images || [],
        data.isActive !== false,
        data.lastRestocked || null,
        data.lastIssued || null,
        data.createdBy || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM inventory WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findBySku(sku) {
    const { rows } = await query('SELECT * FROM inventory WHERE sku=$1', [sku]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      name:            'name',
      category:        'category',
      description:     'description',
      supplier:        'supplier',
      quantityInStock: 'quantity_in_stock',
      unit:            'unit',
      reorderLevel:    'reorder_level',
      reorderQuantity: 'reorder_quantity',
      costPerUnit:     'cost_per_unit',
      currency:        'currency',
      properties:      'properties',
      images:          'images',
      isActive:        'is_active',
      lastRestocked:   'last_restocked',
      lastIssued:      'last_issued',
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
      `UPDATE inventory SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async addStock(id, quantity) {
    const { rows } = await query(
      `UPDATE inventory SET quantity_in_stock = quantity_in_stock + $1, last_restocked = NOW()
       WHERE id=$2 RETURNING *`,
      [quantity, id]
    );
    return format(rows[0] || null);
  },

  async deductStock(id, quantity) {
    const material = await this.findById(id);
    if (!material) return null;
    if (quantity > material.quantityInStock) throw new Error('Insufficient stock');
    const { rows } = await query(
      `UPDATE inventory SET quantity_in_stock = quantity_in_stock - $1, last_issued = NOW()
       WHERE id=$2 RETURNING *`,
      [quantity, id]
    );
    return format(rows[0] || null);
  },

  async findLowStock() {
    const { rows } = await query(
      'SELECT * FROM inventory WHERE is_active=TRUE AND quantity_in_stock <= reorder_level ORDER BY quantity_in_stock ASC'
    );
    return rows.map(format);
  },

  async findByCategory(category) {
    const { rows } = await query(
      'SELECT * FROM inventory WHERE category=$1 AND is_active=TRUE', [category]
    );
    return rows.map(format);
  },

  async search(searchQuery) {
    const { rows } = await query(
      `SELECT * FROM inventory WHERE is_active=TRUE
       AND (name ILIKE $1 OR sku ILIKE $1 OR description ILIKE $1)`,
      [`%${searchQuery}%`]
    );
    return rows.map(format);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.category)               { conds.push(`category=$${i++}`);  vals.push(filters.category); }
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`); vals.push(filters.isActive); }
    const { rows } = await query(
      `SELECT * FROM inventory WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.category)               { conds.push(`category=$${i++}`);  vals.push(filters.category); }
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`); vals.push(filters.isActive); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM inventory WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM inventory WHERE id=$1', [id]);
  },
};

export default MaterialModel;
