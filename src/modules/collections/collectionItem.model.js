import { query } from '../../infrastructure/database/postgres.js';
import { generateSku } from '../../core/utils/randomCode.js';

function format(row) {
  if (!row) return null;
  const item = {
    id:             row.id,
    entityId:       row.id,
    collection:     row.collection_id,
    collectionId:   row.collection_id,
    name:           row.name,
    sku:            row.sku,
    category:       row.category,
    subcategory:    row.subcategory,
    description:    row.description,
    images:         row.images || [],
    style:          row.style_id,
    tags:           row.tags || [],
    colors:         row.colors || [],
    availableSizes: row.available_sizes || [],
    fabricOptions:  row.fabric_options || [],
    complexityLevel:row.complexity_level,
    estimatedHours: row.estimated_hours,
    isActive:       row.is_active,
    displayOrder:   row.display_order,
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
  };

  Object.defineProperty(item, 'primaryImage', { get() {
    if (!this.images?.length) return null;
    return this.images.find(img => img.isPrimary) || this.images[0];
  }});

  item.toSafeJSON = () => ({ ...item, primaryImage: item.primaryImage });

  return item;
}

const CollectionItemModel = {
  async create(data) {
    const sku = data.sku || generateSku();
    const { rows } = await query(
      `INSERT INTO collection_items
         (collection_id, name, sku, category, subcategory, description, images, style_id,
          tags, colors, available_sizes, fabric_options, complexity_level, estimated_hours,
          is_active, display_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        data.collection || data.collectionId,
        data.name,
        sku,
        data.category || null,
        data.subcategory || null,
        data.description || null,
        data.images || [],
        data.style || data.styleId || null,
        data.tags || [],
        data.colors || [],
        data.availableSizes || [],
        data.fabricOptions || [],
        data.complexityLevel || 'moderate',
        data.estimatedHours || null,
        data.isActive !== false,
        data.displayOrder || 0,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM collection_items WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findBySku(sku) {
    const { rows } = await query('SELECT * FROM collection_items WHERE sku=$1', [sku]);
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      name:            'name',
      category:        'category',
      subcategory:     'subcategory',
      description:     'description',
      images:          'images',
      style:           'style_id',
      tags:            'tags',
      colors:          'colors',
      availableSizes:  'available_sizes',
      fabricOptions:   'fabric_options',
      complexityLevel: 'complexity_level',
      estimatedHours:  'estimated_hours',
      isActive:        'is_active',
      displayOrder:    'display_order',
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
      `UPDATE collection_items SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async findByCollection(collectionId) {
    const { rows } = await query(
      'SELECT * FROM collection_items WHERE collection_id=$1 AND is_active=TRUE ORDER BY display_order ASC',
      [collectionId]
    );
    return rows.map(format);
  },

  async findByCategory(category) {
    const { rows } = await query(
      'SELECT * FROM collection_items WHERE category=$1 AND is_active=TRUE ORDER BY display_order ASC',
      [category]
    );
    return rows.map(format);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.collection)             { conds.push(`collection_id=$${i++}`); vals.push(filters.collection); }
    if (filters.category)               { conds.push(`category=$${i++}`);       vals.push(filters.category); }
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`);      vals.push(filters.isActive); }
    const { rows } = await query(
      `SELECT * FROM collection_items WHERE ${conds.join(' AND ')} ORDER BY display_order ASC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.collection)             { conds.push(`collection_id=$${i++}`); vals.push(filters.collection); }
    if (filters.category)               { conds.push(`category=$${i++}`);       vals.push(filters.category); }
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`);      vals.push(filters.isActive); }
    const { rows } = await query(
      `SELECT COUNT(*) AS cnt FROM collection_items WHERE ${conds.join(' AND ')}`, vals
    );
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM collection_items WHERE id=$1', [id]);
  },
};

export default CollectionItemModel;
