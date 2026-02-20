import { query } from '../../infrastructure/database/postgres.js';
import { generateSku } from '../../core/utils/randomCode.js';

function format(row) {
  if (!row) return null;
  const a = {
    id:           row.id,
    entityId:     row.id,
    name:         row.name,
    sku:          row.sku,
    category:     row.category,
    description:  row.description,
    images:       row.images || [],
    variants:     row.variants || [],
    basePrice:    row.base_price,
    currency:     row.currency,
    isActive:     row.is_active,
    displayOrder: row.display_order,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };

  Object.defineProperties(a, {
    primaryImage: { get() {
      if (!this.images?.length) return null;
      return this.images.find(img => img.isPrimary) || this.images[0];
    }},
    totalStock: { get() {
      return (this.variants || []).reduce((sum, v) => sum + (v.quantityInStock || 0), 0);
    }},
    isInStock: { get() { return this.totalStock > 0; }},
    formattedPrice: { get() { return `₦${(this.basePrice / 100).toLocaleString()}`; }},
  });

  a.getVariant = (variantSku) => (a.variants || []).find(v => v.sku === variantSku);
  a.checkVariantStock = (variantSku, qty) => {
    const v = a.getVariant(variantSku);
    return v ? v.quantityInStock >= qty : false;
  };
  a.toSafeJSON = () => ({
    ...a, primaryImage: a.primaryImage, totalStock: a.totalStock,
    isInStock: a.isInStock, formattedPrice: a.formattedPrice,
  });

  return a;
}

const AccessoryModel = {
  async create(data) {
    const sku = data.sku || generateSku('ACC');
    const { rows } = await query(
      `INSERT INTO accessories
         (name, sku, category, description, images, variants, base_price, currency, is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        data.name,
        sku,
        data.category || null,
        data.description || null,
        data.images || [],
        data.variants || [],
        data.basePrice,
        data.currency || 'NGN',
        data.isActive !== false,
        data.displayOrder || 0,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM accessories WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findBySku(sku) {
    const { rows } = await query('SELECT * FROM accessories WHERE sku=$1', [sku]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      name:         'name',
      category:     'category',
      description:  'description',
      images:       'images',
      variants:     'variants',
      basePrice:    'base_price',
      currency:     'currency',
      isActive:     'is_active',
      displayOrder: 'display_order',
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
      `UPDATE accessories SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async deductVariantStock(id, variantSku, quantity) {
    const accessory = await this.findById(id);
    if (!accessory) return null;
    const variants = [...(accessory.variants || [])];
    const idx = variants.findIndex(v => v.sku === variantSku);
    if (idx === -1) throw new Error('Variant not found');
    if (variants[idx].quantityInStock < quantity) throw new Error('Insufficient stock');
    variants[idx] = { ...variants[idx], quantityInStock: variants[idx].quantityInStock - quantity };
    return this.findByIdAndUpdate(id, { variants });
  },

  async findByCategory(category) {
    const { rows } = await query(
      'SELECT * FROM accessories WHERE category=$1 AND is_active=TRUE ORDER BY display_order ASC', [category]
    );
    return rows.map(format);
  },

  async findInStock() {
    const { rows } = await query(
      'SELECT * FROM accessories WHERE is_active=TRUE ORDER BY display_order ASC'
    );
    return rows.map(format).filter(a => a.totalStock > 0);
  },

  async search(searchQuery) {
    const { rows } = await query(
      `SELECT * FROM accessories WHERE is_active=TRUE
       AND (name ILIKE $1 OR description ILIKE $1 OR sku ILIKE $1)`,
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
      `SELECT * FROM accessories WHERE ${conds.join(' AND ')} ORDER BY display_order ASC LIMIT $${i++} OFFSET $${i++}`,
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
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM accessories WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM accessories WHERE id=$1', [id]);
  },
};

export default AccessoryModel;
