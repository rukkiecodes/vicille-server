import { query } from '../../infrastructure/database/postgres.js';
import { generateUniqueSlug } from '../../core/utils/randomCode.js';

function format(row) {
  if (!row) return null;
  const s = {
    id:            row.id,
    entityId:      row.id,
    name:          row.name,
    slug:          row.slug,
    description:   row.description,
    category:      row.category,
    images:        row.images || [],
    tags:          row.tags || [],
    keywords:      row.keywords || [],
    source:        row.source,
    searchQuery:   row.search_query,
    searchResults: row.search_results,
    isActive:      row.is_active,
    createdBy:     row.created_by,
    createdAt:     row.created_at,
    updatedAt:     row.updated_at,
  };

  Object.defineProperty(s, 'primaryImage', { get() {
    if (!this.images?.length) return null;
    return this.images.find(img => img.isPrimary) || this.images[0];
  }});

  s.toSafeJSON = () => ({ ...s, primaryImage: s.primaryImage });

  return s;
}

const StyleModel = {
  async create(data) {
    const slug = data.slug || generateUniqueSlug(data.name);
    const { rows } = await query(
      `INSERT INTO styles
         (name, slug, description, category, images, tags, keywords,
          source, search_query, search_results, is_active, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        data.name,
        slug,
        data.description || null,
        data.category || null,
        data.images || [],
        data.tags || [],
        data.keywords || [],
        data.source || 'manual',
        data.searchQuery || null,
        data.searchResults || null,
        data.isActive !== false,
        data.createdBy || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM styles WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findBySlug(slug) {
    const { rows } = await query(
      'SELECT * FROM styles WHERE slug=$1 AND is_active=TRUE LIMIT 1', [slug]
    );
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      name:          'name',
      slug:          'slug',
      description:   'description',
      category:      'category',
      images:        'images',
      tags:          'tags',
      keywords:      'keywords',
      source:        'source',
      searchQuery:   'search_query',
      searchResults: 'search_results',
      isActive:      'is_active',
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
      `UPDATE styles SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.category)               { conds.push(`category=$${i++}`);  vals.push(filters.category); }
    if (filters.isActive !== undefined) { conds.push(`is_active=$${i++}`); vals.push(filters.isActive); }
    const { rows } = await query(
      `SELECT * FROM styles WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async search(searchQuery) {
    const { rows } = await query(
      `SELECT * FROM styles WHERE is_active=TRUE
       AND (name ILIKE $1 OR description ILIKE $1
            OR $2 = ANY(tags) OR $2 = ANY(keywords))
       ORDER BY created_at DESC`,
      [`%${searchQuery}%`, searchQuery]
    );
    return rows.map(format);
  },

  async delete(id) {
    await query('DELETE FROM styles WHERE id=$1', [id]);
  },
};

export default StyleModel;
