import { query } from '../../infrastructure/database/postgres.js';
import { generateUniqueSlug } from '../../core/utils/randomCode.js';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function format(row) {
  if (!row) return null;
  const c = {
    id:          row.id,
    entityId:    row.id,
    name:        row.name,
    slug:        row.slug,
    description: row.description,
    theme:       row.theme,
    period:      row.period,
    coverImage:  row.cover_image,
    isActive:    row.is_active,
    isCurrent:   row.is_current,
    createdBy:   row.created_by,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };

  Object.defineProperty(c, 'displayName', { get() {
    if (!this.period) return this.name;
    return `${MONTH_NAMES[this.period.month - 1]} ${this.period.year} Collection`;
  }});

  c.toSafeJSON = () => ({ ...c, displayName: c.displayName });

  return c;
}

const CollectionModel = {
  async create(data) {
    const slug = data.slug || generateUniqueSlug(data.name);
    const { rows } = await query(
      `INSERT INTO collections
         (name, slug, description, theme, period, cover_image, is_active, is_current, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        data.name,
        slug,
        data.description || null,
        data.theme || null,
        data.period || null,
        data.coverImage || null,
        data.isActive !== false,
        data.isCurrent || false,
        data.createdBy || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM collections WHERE id=$1', [id]);
    return format(rows[0] || null);
  },

  async findBySlug(slug) {
    const { rows } = await query(
      'SELECT * FROM collections WHERE slug=$1 AND is_active=TRUE LIMIT 1', [slug]
    );
    return format(rows[0] || null);
  },

  async findByIdAndUpdate(id, updates) {
    const colMap = {
      name:        'name',
      slug:        'slug',
      description: 'description',
      theme:       'theme',
      period:      'period',
      coverImage:  'cover_image',
      isActive:    'is_active',
      isCurrent:   'is_current',
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
      `UPDATE collections SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, values
    );
    return format(rows[0] || null);
  },

  async setAsCurrent(id) {
    await query('UPDATE collections SET is_current=FALSE WHERE is_current=TRUE AND id<>$1', [id]);
    return this.findByIdAndUpdate(id, { isCurrent: true });
  },

  async findCurrent() {
    const { rows } = await query(
      'SELECT * FROM collections WHERE is_current=TRUE AND is_active=TRUE LIMIT 1'
    );
    return format(rows[0] || null);
  },

  async findActive() {
    const { rows } = await query(
      'SELECT * FROM collections WHERE is_active=TRUE ORDER BY created_at DESC'
    );
    return rows.map(format);
  },

  async find(filters = {}, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.isActive  !== undefined) { conds.push(`is_active=$${i++}`);  vals.push(filters.isActive); }
    if (filters.isCurrent !== undefined) { conds.push(`is_current=$${i++}`); vals.push(filters.isCurrent); }
    const { rows } = await query(
      `SELECT * FROM collections WHERE ${conds.join(' AND ')} ORDER BY created_at DESC LIMIT $${i++} OFFSET $${i++}`,
      [...vals, limit, offset]
    );
    return rows.map(format);
  },

  async countDocuments(filters = {}) {
    const conds = ['TRUE'];
    const vals = [];
    let i = 1;
    if (filters.isActive  !== undefined) { conds.push(`is_active=$${i++}`);  vals.push(filters.isActive); }
    if (filters.isCurrent !== undefined) { conds.push(`is_current=$${i++}`); vals.push(filters.isCurrent); }
    const { rows } = await query(`SELECT COUNT(*) AS cnt FROM collections WHERE ${conds.join(' AND ')}`, vals);
    return parseInt(rows[0].cnt, 10);
  },

  async delete(id) {
    await query('DELETE FROM collections WHERE id=$1', [id]);
  },
};

export default CollectionModel;
