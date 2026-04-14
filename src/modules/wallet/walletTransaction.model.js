import { query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  return {
    id:                row.id,
    walletId:          row.wallet_id,
    userId:            row.user_id,
    type:              row.type,
    direction:         row.direction,
    amountKobo:        Number(row.amount_kobo),
    amountNgn:         Number(row.amount_kobo) / 100,
    balanceBefore:     Number(row.balance_before),
    balanceAfter:      Number(row.balance_after),
    status:            row.status,
    paystackReference: row.paystack_reference || null,
    paystackChannel:   row.paystack_channel   || null,
    description:       row.description        || null,
    metadata:          row.metadata           || null,
    createdAt:         row.created_at,
  };
}

const WalletTransactionModel = {
  async findByUserId(userId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await query(
      `SELECT * FROM wallet_transactions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows.map(format);
  },

  async countByUserId(userId) {
    const { rows } = await query(
      'SELECT COUNT(*) AS cnt FROM wallet_transactions WHERE user_id = $1',
      [userId]
    );
    return parseInt(rows[0].cnt, 10);
  },

  async findByReference(paystackReference) {
    const { rows } = await query(
      'SELECT * FROM wallet_transactions WHERE paystack_reference = $1 LIMIT 1',
      [paystackReference]
    );
    return format(rows[0] || null);
  },

  async existsByReference(paystackReference) {
    const { rows } = await query(
      'SELECT id FROM wallet_transactions WHERE paystack_reference = $1 LIMIT 1',
      [paystackReference]
    );
    return rows.length > 0;
  },

  async findById(id) {
    const { rows } = await query(
      'SELECT * FROM wallet_transactions WHERE id = $1 LIMIT 1', [id]
    );
    return format(rows[0] || null);
  },
};

export default WalletTransactionModel;
