import { randomBytes } from 'crypto';
import { getClient, query } from '../../infrastructure/database/postgres.js';

function format(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    entityId: row.id,
    inviterUserId: row.inviter_user_id,
    invitedUserId: row.invited_user_id,
    invitedName: row.invited_name || null,
    invitedEmail: row.invited_email,
    inviteCode: row.invite_code,
    status: row.status,
    rewardAmount: Number(row.reward_amount || 0),
    rewardCurrency: row.reward_currency,
    acceptedAt: row.accepted_at,
    rewardedAt: row.rewarded_at,
    subscriptionId: row.subscription_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function makeInviteCode() {
  return randomBytes(5).toString('hex').toUpperCase();
}

const ReferralModel = {
  async createInvite({ inviterUserId, invitedName, invitedEmail }) {
    const normalizedName = invitedName?.trim() || null;
    const normalizedEmail = invitedEmail?.trim().toLowerCase() || null;

    for (let i = 0; i < 5; i += 1) {
      const inviteCode = makeInviteCode();
      try {
        const { rows } = await query(
          `INSERT INTO referral_invites (inviter_user_id, invited_name, invited_email, invite_code)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [inviterUserId, normalizedName, normalizedEmail, inviteCode]
        );
        return format(rows[0]);
      } catch (error) {
        if (error?.code !== '23505') {
          throw error;
        }
      }
    }

    throw new Error('Failed to generate unique invite code');
  },

  async findByCode(inviteCode) {
    const { rows } = await query(
      'SELECT * FROM referral_invites WHERE invite_code = $1 LIMIT 1',
      [inviteCode]
    );
    return format(rows[0] || null);
  },

  async findByInviter(inviterUserId) {
    const { rows } = await query(
      'SELECT * FROM referral_invites WHERE inviter_user_id = $1 ORDER BY created_at DESC',
      [inviterUserId]
    );
    return rows.map(format);
  },

  async claimInvite({ inviteCode, invitedUserId, invitedEmail }) {
    const normalizedEmail = invitedEmail?.trim().toLowerCase() || null;
    const client = await getClient();

    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        'SELECT * FROM referral_invites WHERE invite_code = $1 FOR UPDATE',
        [inviteCode]
      );

      const invite = rows[0];
      if (!invite) {
        throw new Error('Referral invite not found');
      }

      if (invite.inviter_user_id === invitedUserId) {
        throw new Error('You cannot claim your own referral invite');
      }

      if (invite.status === 'rewarded') {
        throw new Error('Referral invite already rewarded');
      }

      if (invite.invited_user_id && invite.invited_user_id !== invitedUserId) {
        throw new Error('Referral invite already claimed by another user');
      }

      if (invite.invited_email && normalizedEmail && invite.invited_email !== normalizedEmail) {
        throw new Error('Referral invite email does not match this account');
      }

      const { rows: updatedRows } = await client.query(
        `UPDATE referral_invites
           SET invited_user_id = $1,
               invited_email = COALESCE(invited_email, $2),
               status = 'accepted',
               accepted_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [invitedUserId, normalizedEmail, invite.id]
      );

      await client.query('COMMIT');
      return format(updatedRows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async rewardInviteForSubscription({ invitedUserId, subscriptionId }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT *
           FROM referral_invites
          WHERE invited_user_id = $1
            AND status = 'accepted'
            AND source_type = 'user'
          ORDER BY accepted_at ASC NULLS LAST, created_at ASC
          LIMIT 1
          FOR UPDATE`,
        [invitedUserId]
      );

      const invite = rows[0];
      if (!invite) {
        await client.query('ROLLBACK');
        return null;
      }

      // Fetch reward amount from the subscription's plan + get full plan pricing
      const { rows: planRows } = await client.query(
        `SELECT sp.referral_reward_ngn, sp.pricing
           FROM user_subscriptions us
           JOIN subscription_plans sp ON sp.id = us.plan_id
          WHERE us.id = $1`,
        [subscriptionId]
      );
      const amount = Number(planRows[0]?.referral_reward_ngn || 1000);
      const currency = 'NGN';
      const subscriptionPricing = planRows[0]?.pricing;

      const { rows: updatedInviteRows } = await client.query(
        `UPDATE referral_invites
            SET status = 'rewarded',
                rewarded_at = NOW(),
                reward_amount = $1,
                reward_currency = $2,
                subscription_id = $3
          WHERE id = $4
          RETURNING *`,
        [amount, currency, subscriptionId || null, invite.id]
      );

      await client.query(
        `UPDATE users
            SET referral_balance = COALESCE(referral_balance, 0) + $1,
                referral_total_earned = COALESCE(referral_total_earned, 0) + $1
          WHERE id = $2`,
        [amount, invite.inviter_user_id]
      );

      await client.query(
        `INSERT INTO referral_wallet_transactions
           (user_id, type, amount, currency, description, reference_id)
         VALUES ($1, 'credit', $2, $3, $4, $5)`,
        [
          invite.inviter_user_id,
          amount,
          currency,
          'Referral reward for subscription activation',
          invite.id,
        ]
      );

      // ── Credit referrer's user wallet with 10% of subscription amount ────────────
      // Get the referrer's wallet
      const { rows: walletRows } = await client.query(
        'SELECT * FROM user_wallets WHERE user_id = $1 FOR UPDATE',
        [invite.inviter_user_id]
      );
      const referrerWallet = walletRows[0];
      
      if (referrerWallet && subscriptionPricing) {
        // Calculate 10% of subscription amount in kobo
        const subscriptionAmountNgn = Number(subscriptionPricing.amount || 0);
        const rewardPercentage = subscriptionAmountNgn * 0.1; // 10%
        const rewardKobo = Math.round(rewardPercentage * 100); // convert to kobo

        if (rewardKobo > 0) {
          const balanceBefore = Number(referrerWallet.balance_kobo);
          
          // Credit wallet
          const { rows: updatedWalletRows } = await client.query(
            `UPDATE user_wallets SET balance_kobo = balance_kobo + $1, updated_at = NOW()
             WHERE id = $2 RETURNING *`,
            [rewardKobo, referrerWallet.id]
          );
          const balanceAfter = Number(updatedWalletRows[0].balance_kobo);

          // Create wallet transaction record
          await client.query(
            `INSERT INTO wallet_transactions
               (wallet_id, user_id, type, direction, amount_kobo, balance_before, balance_after,
                status, description, metadata)
             VALUES ($1,$2,'admin_credit','in',$3,$4,$5,'completed',$6,$7)`,
            [
              referrerWallet.id,
              invite.inviter_user_id,
              rewardKobo,
              balanceBefore,
              balanceAfter,
              `Referral reward (10% of ${subscriptionAmountNgn} NGN subscription)`,
              JSON.stringify({
                referralInviteId: invite.id,
                subscriptionId,
                rewardPercentage: 10,
                subscriptionAmountNgn,
              })
            ]
          );
        }
      }

      await client.query('COMMIT');
      return format(updatedInviteRows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },

  async getWalletTransactions(userId) {
    const { rows } = await query(
      `SELECT * FROM referral_wallet_transactions
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId]
    );
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      type: r.type,
      amount: Number(r.amount),
      currency: r.currency,
      description: r.description,
      referenceId: r.reference_id,
      createdAt: r.created_at,
    }));
  },

  async linkUserToReferralCode({ referralCode, newUserId, newUserEmail }) {
    // Find the referrer who owns this code
    const { rows } = await query(
      `SELECT id FROM users
        WHERE referral_code = $1
          AND id != $2
          AND is_deleted = FALSE
        LIMIT 1`,
      [referralCode.trim().toUpperCase(), newUserId]
    );
    const referrer = rows[0];
    if (!referrer) return null;

    // Check not already linked
    const { rows: existing } = await query(
      `SELECT id FROM referral_invites
        WHERE inviter_user_id = $1
          AND (invited_user_id = $2 OR invited_email = $3)
        LIMIT 1`,
      [referrer.id, newUserId, newUserEmail.trim().toLowerCase()]
    );
    if (existing.length > 0) return null;

    for (let i = 0; i < 5; i += 1) {
      const inviteCode = makeInviteCode();
      try {
        const { rows: inviteRows } = await query(
          `INSERT INTO referral_invites
             (inviter_user_id, invited_user_id, invited_email, invite_code, status, source_type)
           VALUES ($1, $2, $3, $4, 'accepted', 'user')
           RETURNING *`,
          [referrer.id, newUserId, newUserEmail.trim().toLowerCase(), inviteCode]
        );
        return { invite: format(inviteRows[0]), referrerId: referrer.id };
      } catch (err) {
        if (err?.code !== '23505') throw err;
      }
    }
    return null;
  },

  async createInviteFromReferralCode({ referralCode, invitedEmail }) {
    // Find the user who owns this referral code
    const { rows } = await query(
      'SELECT id FROM users WHERE referral_code = $1 AND is_deleted = FALSE LIMIT 1',
      [referralCode.trim().toUpperCase()]
    );
    const referrer = rows[0];
    if (!referrer) return null; // silently ignore unknown codes

    const normalizedEmail = invitedEmail.trim().toLowerCase();

    // Check if an invite for this email already exists from this referrer
    const { rows: existing } = await query(
      `SELECT id FROM referral_invites
        WHERE inviter_user_id = $1 AND invited_email = $2
        LIMIT 1`,
      [referrer.id, normalizedEmail]
    );
    if (existing.length > 0) return null; // already recorded

    for (let i = 0; i < 5; i += 1) {
      const inviteCode = makeInviteCode();
      try {
        const { rows: inviteRows } = await query(
          `INSERT INTO referral_invites
             (inviter_user_id, invited_email, invite_code, status, source_type)
           VALUES ($1, $2, $3, 'pending', 'user')
           RETURNING *`,
          [referrer.id, normalizedEmail, inviteCode]
        );
        return { invite: format(inviteRows[0]), referrerId: referrer.id };
      } catch (err) {
        if (err?.code !== '23505') throw err;
      }
    }
    return null;
  },

  async generateUserReferralCode(userId) {
    for (let i = 0; i < 10; i += 1) {
      const code = randomBytes(4).toString('hex').toUpperCase(); // e.g. "A3F2B1C9"
      try {
        const { rows } = await query(
          `UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL RETURNING referral_code`,
          [code, userId]
        );
        if (rows[0]) return rows[0].referral_code;
        // Already has one — return it
        const existing = await query(
          'SELECT referral_code FROM users WHERE id = $1',
          [userId]
        );
        return existing.rows[0]?.referral_code || null;
      } catch (error) {
        if (error?.code !== '23505') throw error;
        // Collision — retry with new code
      }
    }
    throw new Error('Failed to generate unique referral code');
  },

  async getUserReferralCode(userId) {
    const { rows } = await query(
      'SELECT referral_code FROM users WHERE id = $1',
      [userId]
    );
    return rows[0]?.referral_code ?? null;
  },

  async getSummaryByInviter(inviterUserId) {
    const { rows } = await query(
      `SELECT
         COUNT(*)::int AS total_invites,
         COUNT(*) FILTER (WHERE status IN ('accepted', 'rewarded'))::int AS accepted_invites,
         COUNT(*) FILTER (WHERE status = 'rewarded')::int AS rewarded_invites,
         COALESCE(SUM(reward_amount) FILTER (WHERE status = 'rewarded'), 0)::numeric AS total_reward_earned,
         COALESCE(SUM(reward_amount) FILTER (WHERE status = 'accepted'), 0)::numeric AS pending_reward_amount
       FROM referral_invites
       WHERE inviter_user_id = $1`,
      [inviterUserId]
    );

    return {
      totalInvites: rows[0]?.total_invites || 0,
      acceptedInvites: rows[0]?.accepted_invites || 0,
      rewardedInvites: rows[0]?.rewarded_invites || 0,
      totalRewardEarned: Number(rows[0]?.total_reward_earned || 0),
      pendingRewardAmount: Number(rows[0]?.pending_reward_amount || 0),
    };
  },
};

export default ReferralModel;