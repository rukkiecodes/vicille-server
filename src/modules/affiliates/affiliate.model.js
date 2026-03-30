import { randomBytes } from 'crypto';
import { query, getClient } from '../../infrastructure/database/postgres.js';
import { hashPassword, comparePassword } from '../../core/utils/crypto.js';

function format(row) {
  if (!row) return null;
  return {
    id:           row.id,
    fullName:     row.full_name,
    email:        row.email,
    phone:        row.phone,
    status:       row.status,
    referralCode: row.referral_code,
    passwordHash: row.password_hash,
    createdAt:    row.created_at,
    updatedAt:    row.updated_at,
  };
}

function formatWallet(row) {
  if (!row) return null;
  return {
    id:          row.id,
    affiliateId: row.affiliate_id,
    balance:     Number(row.balance),
    totalEarned: Number(row.total_earned),
    currency:    row.currency,
    createdAt:   row.created_at,
    updatedAt:   row.updated_at,
  };
}

function formatTransaction(row) {
  if (!row) return null;
  return {
    id:          row.id,
    affiliateId: row.affiliate_id,
    type:        row.type,
    amount:      Number(row.amount),
    currency:    row.currency,
    description: row.description,
    referenceId: row.reference_id,
    createdAt:   row.created_at,
  };
}

function makeReferralCode() {
  return randomBytes(6).toString('hex').toUpperCase(); // 12 hex chars
}

const AffiliateModel = {
  async create({ fullName, email, phone, password }) {
    const passwordHash = await hashPassword(password);

    for (let i = 0; i < 5; i += 1) {
      const referralCode = makeReferralCode();
      const client = await getClient();
      try {
        await client.query('BEGIN');

        const { rows } = await client.query(
          `INSERT INTO affiliates (full_name, email, phone, password_hash, referral_code)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [fullName, email.toLowerCase(), phone || null, passwordHash, referralCode]
        );

        // Create wallet immediately on registration
        await client.query(
          'INSERT INTO affiliate_wallets (affiliate_id) VALUES ($1)',
          [rows[0].id]
        );

        await client.query('COMMIT');
        return format(rows[0]);
      } catch (err) {
        await client.query('ROLLBACK');
        // 23505 = unique_violation — referral_code collision, retry
        if (err?.code !== '23505') throw err;
      } finally {
        client.release();
      }
    }

    throw new Error('Failed to generate unique referral code');
  },

  async findById(id) {
    const { rows } = await query('SELECT * FROM affiliates WHERE id = $1', [id]);
    return format(rows[0] || null);
  },

  async findByEmail(email) {
    const { rows } = await query(
      'SELECT * FROM affiliates WHERE email = $1',
      [email.toLowerCase()]
    );
    return format(rows[0] || null);
  },

  async findByReferralCode(code) {
    const { rows } = await query(
      'SELECT * FROM affiliates WHERE referral_code = $1',
      [code.toUpperCase()]
    );
    return format(rows[0] || null);
  },

  async getWallet(affiliateId) {
    const { rows } = await query(
      'SELECT * FROM affiliate_wallets WHERE affiliate_id = $1',
      [affiliateId]
    );
    return formatWallet(rows[0] || null);
  },

  async getTransactions(affiliateId) {
    const { rows } = await query(
      `SELECT * FROM affiliate_wallet_transactions
        WHERE affiliate_id = $1
        ORDER BY created_at DESC`,
      [affiliateId]
    );
    return rows.map(formatTransaction);
  },

  async getReferrals(affiliateId) {
    const { rows } = await query(
      `SELECT * FROM referral_invites
        WHERE affiliate_id = $1
        ORDER BY created_at DESC`,
      [affiliateId]
    );
    return rows.map((r) => ({
      id:            r.id,
      invitedUserId: r.invited_user_id,
      invitedEmail:  r.invited_email,
      status:        r.status,
      rewardAmount:  Number(r.reward_amount || 0),
      rewardCurrency: r.reward_currency,
      createdAt:     r.created_at,
    }));
  },

  /**
   * Called when a user who was referred by this affiliate activates a subscription.
   * Credits the affiliate wallet and writes a transaction row.
   */
  async rewardForSubscription({ affiliateId, amount, currency = 'NGN', referenceId }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE affiliate_wallets
            SET balance     = balance     + $1,
                total_earned = total_earned + $1
          WHERE affiliate_id = $2`,
        [amount, affiliateId]
      );

      await client.query(
        `INSERT INTO affiliate_wallet_transactions
           (affiliate_id, type, amount, currency, description, reference_id)
         VALUES ($1, 'credit', $2, $3, $4, $5)`,
        [
          affiliateId,
          amount,
          currency,
          'Referral reward for subscription activation',
          referenceId || null,
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async comparePassword(affiliate, candidatePassword) {
    if (!affiliate.passwordHash) return false;
    return comparePassword(candidatePassword, affiliate.passwordHash);
  },
};

export default AffiliateModel;
