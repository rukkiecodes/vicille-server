import { query, getClient } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) return null;
  return {
    id:               row.id,
    userId:           row.user_id,
    balanceKobo:      Number(row.balance_kobo),
    balanceNgn:       Number(row.balance_kobo) / 100,
    currency:         row.currency,
    dvaAccountNumber: row.dva_account_number || null,
    dvaAccountName:   row.dva_account_name   || null,
    dvaBankName:      row.dva_bank_name       || null,
    dvaBankSlug:      row.dva_bank_slug       || null,
    dvaPaystackId:    row.dva_paystack_id     || null,
    dvaAssigned:      row.dva_assigned,
    dvaAssignedAt:    row.dva_assigned_at     || null,
    createdAt:        row.created_at,
    updatedAt:        row.updated_at,
  };
}

const WalletModel = {
  // Called once at user registration (inside a DB transaction from the caller).
  async create(userId, client = null) {
    const db = client || { query: (...a) => query(...a) };
    const { rows } = await db.query(
      'INSERT INTO user_wallets (user_id) VALUES ($1) RETURNING *',
      [userId]
    );
    return format(rows[0]);
  },

  async findByUserId(userId) {
    const { rows } = await query(
      'SELECT * FROM user_wallets WHERE user_id=$1 LIMIT 1', [userId]
    );
    return format(rows[0] || null);
  },

  async findById(id) {
    const { rows } = await query(
      'SELECT * FROM user_wallets WHERE id=$1 LIMIT 1', [id]
    );
    return format(rows[0] || null);
  },

  // Credit wallet atomically. Returns updated wallet.
  // Must be called inside a DB transaction when combined with ledger writes.
  async creditKobo(walletId, amountKobo, client = null) {
    const db = client || { query: (...a) => query(...a) };
    const { rows } = await db.query(
      `UPDATE user_wallets
         SET balance_kobo = balance_kobo + $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [amountKobo, walletId]
    );
    return format(rows[0] || null);
  },

  // Debit wallet atomically. The CHECK constraint (balance_kobo >= 0) in the DB
  // guarantees no negative balance — the UPDATE will fail if insufficient funds.
  async debitKobo(walletId, amountKobo, client = null) {
    const db = client || { query: (...a) => query(...a) };
    const { rows } = await db.query(
      `UPDATE user_wallets
         SET balance_kobo = balance_kobo - $1, updated_at = NOW()
       WHERE id = $2 AND balance_kobo >= $1
       RETURNING *`,
      [amountKobo, walletId]
    );
    if (!rows[0]) throw new Error('INSUFFICIENT_WALLET_BALANCE');
    return format(rows[0]);
  },

  async updateDva({ userId, accountNumber, accountName, bankName, bankSlug, paystackId }) {
    const { rows } = await query(
      `UPDATE user_wallets
         SET dva_account_number = $1,
             dva_account_name   = $2,
             dva_bank_name      = $3,
             dva_bank_slug      = $4,
             dva_paystack_id    = $5,
             dva_assigned       = TRUE,
             dva_assigned_at    = NOW(),
             updated_at         = NOW()
       WHERE user_id = $6
       RETURNING *`,
      [accountNumber, accountName, bankName, bankSlug, paystackId || null, userId]
    );
    return format(rows[0] || null);
  },

  // Atomic credit + ledger record in a single transaction.
  // Returns { wallet, transaction }.
  async creditWithLedger({ userId, walletId, amountKobo, type, paystackReference, paystackChannel, description, metadata }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Lock the wallet row to prevent concurrent balance races
      const { rows: lockRows } = await client.query(
        'SELECT * FROM user_wallets WHERE id=$1 FOR UPDATE', [walletId]
      );
      if (!lockRows[0]) throw new Error('Wallet not found');
      const balanceBefore = Number(lockRows[0].balance_kobo);

      // Credit
      const { rows: walletRows } = await client.query(
        `UPDATE user_wallets SET balance_kobo = balance_kobo + $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [amountKobo, walletId]
      );
      const balanceAfter = Number(walletRows[0].balance_kobo);

      // Ledger entry
      const { rows: txRows } = await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, user_id, type, direction, amount_kobo, balance_before, balance_after,
            status, paystack_reference, paystack_channel, description, metadata)
         VALUES ($1,$2,$3,'in',$4,$5,$6,'completed',$7,$8,$9,$10)
         RETURNING *`,
        [walletId, userId, type, amountKobo, balanceBefore, balanceAfter,
         paystackReference || null, paystackChannel || null, description || null,
         metadata ? JSON.stringify(metadata) : null]
      );

      await client.query('COMMIT');
      return { wallet: format(walletRows[0]), transaction: txRows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // Atomic debit + ledger record in a single transaction.
  // Returns { wallet, transaction }.
  async debitWithLedger({ userId, walletId, amountKobo, type, description, metadata }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Lock the wallet row
      const { rows: lockRows } = await client.query(
        'SELECT * FROM user_wallets WHERE id=$1 FOR UPDATE', [walletId]
      );
      if (!lockRows[0]) throw new Error('Wallet not found');
      const balanceBefore = Number(lockRows[0].balance_kobo);

      if (balanceBefore < amountKobo) throw new Error('INSUFFICIENT_WALLET_BALANCE');

      // Debit
      const { rows: walletRows } = await client.query(
        `UPDATE user_wallets SET balance_kobo = balance_kobo - $1, updated_at = NOW()
         WHERE id = $2 RETURNING *`,
        [amountKobo, walletId]
      );
      const balanceAfter = Number(walletRows[0].balance_kobo);

      // Ledger entry
      const { rows: txRows } = await client.query(
        `INSERT INTO wallet_transactions
           (wallet_id, user_id, type, direction, amount_kobo, balance_before, balance_after,
            status, description, metadata)
         VALUES ($1,$2,$3,'out',$4,$5,$6,'completed',$7,$8)
         RETURNING *`,
        [walletId, userId, type, amountKobo, balanceBefore, balanceAfter,
         description || null, metadata ? JSON.stringify(metadata) : null]
      );

      await client.query('COMMIT');
      return { wallet: format(walletRows[0]), transaction: txRows[0] };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

export default WalletModel;
