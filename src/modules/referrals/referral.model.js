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
  async createInvite({ inviterUserId, invitedEmail }) {
    const normalizedEmail = invitedEmail?.trim().toLowerCase() || null;

    for (let i = 0; i < 5; i += 1) {
      const inviteCode = makeInviteCode();
      try {
        const { rows } = await query(
          `INSERT INTO referral_invites (inviter_user_id, invited_email, invite_code)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [inviterUserId, normalizedEmail, inviteCode]
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

  async rewardInviteForSubscription({ invitedUserId, subscriptionId, rewardAmount, rewardCurrency }) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT *
           FROM referral_invites
          WHERE invited_user_id = $1
            AND status = 'accepted'
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

      const amount = Number(rewardAmount || 0);

      const { rows: updatedInviteRows } = await client.query(
        `UPDATE referral_invites
            SET status = 'rewarded',
                rewarded_at = NOW(),
                reward_amount = $1,
                reward_currency = $2,
                subscription_id = $3
          WHERE id = $4
          RETURNING *`,
        [amount, rewardCurrency || 'NGN', subscriptionId || null, invite.id]
      );

      await client.query(
        `UPDATE users
            SET referral_balance = COALESCE(referral_balance, 0) + $1,
                referral_total_earned = COALESCE(referral_total_earned, 0) + $1
          WHERE id = $2`,
        [amount, invite.inviter_user_id]
      );

      await client.query('COMMIT');
      return format(updatedInviteRows[0]);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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