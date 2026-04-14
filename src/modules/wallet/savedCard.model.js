import { query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  return {
    id:                row.id,
    userId:            row.user_id,
    authorizationCode: row.authorization_code,
    last4:             row.last4      || null,
    bin:               row.bin        || null,
    expMonth:          row.exp_month  || null,
    expYear:           row.exp_year   || null,
    cardType:          row.card_type  || null,
    bank:              row.bank       || null,
    brand:             row.brand      || null,
    channel:           row.channel    || 'card',
    signature:         row.signature  || null,
    isDefault:         row.is_default,
    createdAt:         row.created_at,
  };
}

const SavedCardModel = {
  async findByUserId(userId) {
    const { rows } = await query(
      'SELECT * FROM user_saved_cards WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [userId]
    );
    return rows.map(format);
  },

  async findById(id) {
    const { rows } = await query(
      'SELECT * FROM user_saved_cards WHERE id = $1 LIMIT 1', [id]
    );
    return format(rows[0] || null);
  },

  async findBySignature(userId, signature) {
    const { rows } = await query(
      'SELECT * FROM user_saved_cards WHERE user_id = $1 AND signature = $2 LIMIT 1',
      [userId, signature]
    );
    return format(rows[0] || null);
  },

  // Save card only if the signature hasn't been stored yet for this user.
  // Returns the existing or newly created card.
  async upsertBySignature({ userId, authorizationCode, last4, bin, expMonth, expYear, cardType, bank, brand, channel, signature }) {
    if (signature) {
      const existing = await this.findBySignature(userId, signature);
      if (existing) return existing;
    }

    const hasAny = await this.findByUserId(userId);
    const isDefault = hasAny.length === 0; // first card becomes default

    const { rows } = await query(
      `INSERT INTO user_saved_cards
         (user_id, authorization_code, last4, bin, exp_month, exp_year,
          card_type, bank, brand, channel, signature, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [userId, authorizationCode, last4 || null, bin || null,
       expMonth || null, expYear || null, cardType || null,
       bank || null, brand || null, channel || 'card',
       signature || null, isDefault]
    );
    return format(rows[0]);
  },

  async setDefault(userId, cardId) {
    // Unset all, then set the chosen one
    await query(
      'UPDATE user_saved_cards SET is_default = FALSE WHERE user_id = $1', [userId]
    );
    const { rows } = await query(
      'UPDATE user_saved_cards SET is_default = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
      [cardId, userId]
    );
    return format(rows[0] || null);
  },

  async delete(userId, cardId) {
    const { rows } = await query(
      'DELETE FROM user_saved_cards WHERE id = $1 AND user_id = $2 RETURNING *',
      [cardId, userId]
    );
    if (!rows[0]) return false;

    // If we deleted the default card, promote the most recent remaining one
    if (rows[0].is_default) {
      await query(
        `UPDATE user_saved_cards SET is_default = TRUE
         WHERE id = (
           SELECT id FROM user_saved_cards WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
         )`,
        [userId]
      );
    }
    return true;
  },
};

export default SavedCardModel;
