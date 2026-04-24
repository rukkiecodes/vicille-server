import { query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  return {
    id:           row.id,
    name:         row.name,
    description:  row.description,
    category:     row.category,
    imageUrl:     row.image_url,
    thumbnailUrl: row.thumbnail_url,
    sourceUrl:    row.source_url,
    searchQuery:  row.search_query,
    tags:         row.tags || [],
    userId:       row.user_id,
    createdAt:    row.created_at,
  };
}

const SuggestedStyleModel = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO suggested_styles
         (name, description, category, image_url, thumbnail_url,
          source_url, search_query, tags, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        data.name,
        data.description || null,
        data.category || null,
        data.imageUrl,
        data.thumbnailUrl || data.imageUrl,
        data.sourceUrl || null,
        data.searchQuery || null,
        data.tags || [],
        data.userId || null,
      ]
    );
    return format(rows[0]);
  },

  async findById(id) {
    const { rows } = await query(
      'SELECT * FROM suggested_styles WHERE id=$1',
      [id]
    );
    return format(rows[0] || null);
  },
};

export default SuggestedStyleModel;
