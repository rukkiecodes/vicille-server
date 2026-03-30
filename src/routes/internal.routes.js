/**
 * Internal event endpoint — receives subscription lifecycle events from the payments service.
 * Protected by the shared x-service-key header.
 */
import { Router } from 'express';
import SubscriptionModel from '../modules/subscriptions/subscription.model.js';
import UserModel from '../modules/users/user.model.js';
import ReferralModel from '../modules/referrals/referral.model.js';
import AffiliateModel from '../modules/affiliates/affiliate.model.js';
import { query } from '../infrastructure/database/postgres.js';
import logger from '../core/logger/index.js';

const router = Router();

// ── Service-key guard ─────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const key = req.headers['x-service-key'];
  if (!key || key !== process.env.INTERNAL_SERVICE_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── POST /internal/subscription-event ────────────────────────────────────────
router.post('/subscription-event', async (req, res) => {
  // Always respond immediately so the payment service doesn't time out
  res.status(200).json({ received: true });

  const { type, userId, subscriptionId, retryAt } = req.body;
  logger.info(`[internal] subscription-event: ${type}`, { userId, subscriptionId });

  try {
    switch (type) {

      case 'SUBSCRIPTION_ACTIVATED': {
        if (!subscriptionId || !userId) {
          break;
        }
        const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await SubscriptionModel.findByIdAndUpdate(subscriptionId, {
          status:          'active',
          billing:         { nextBillingDate: nextBillingDate.toISOString() },
          nextBillingDate,
          paymentStatus:   'paid',
        });
        await UserModel.findByIdAndUpdate(userId, {
          subscriptionStatus:  'active',
          currentSubscription: subscriptionId,
        });

        const reward = await ReferralModel.rewardInviteForSubscription({
          invitedUserId: userId,
          subscriptionId,
        });

        if (reward) {
          logger.info('[internal] user referral reward credited', {
            inviterUserId: reward.inviterUserId,
            invitedUserId: userId,
            rewardAmount:  reward.rewardAmount,
            rewardCurrency: reward.rewardCurrency,
          });
        }

        // Credit affiliate if this user was referred via an affiliate link
        const { rows: affiliateInviteRows } = await query(
          `SELECT ri.*, sp.referral_reward_ngn
             FROM referral_invites ri
             JOIN user_subscriptions us ON us.id = $2
             JOIN subscription_plans sp ON sp.id = us.plan_id
            WHERE ri.invited_user_id = $1
              AND ri.status = 'accepted'
              AND ri.source_type = 'affiliate'
            ORDER BY ri.accepted_at ASC NULLS LAST, ri.created_at ASC
            LIMIT 1`,
          [userId, subscriptionId]
        );
        const affiliateInvite = affiliateInviteRows[0];
        if (affiliateInvite) {
          const affiliateReward = Number(affiliateInvite.referral_reward_ngn || 1000);

          await query(
            `UPDATE referral_invites
                SET status = 'rewarded',
                    rewarded_at = NOW(),
                    reward_amount = $1,
                    reward_currency = 'NGN',
                    subscription_id = $2
              WHERE id = $3`,
            [affiliateReward, subscriptionId, affiliateInvite.id]
          );

          await AffiliateModel.rewardForSubscription({
            affiliateId: affiliateInvite.affiliate_id,
            amount:      affiliateReward,
            currency:    'NGN',
            referenceId: affiliateInvite.id,
          });

          logger.info('[internal] affiliate referral reward credited', {
            affiliateId:  affiliateInvite.affiliate_id,
            invitedUserId: userId,
            rewardAmount:  affiliateReward,
          });
        }

        logger.info('[internal] subscription activated', { subscriptionId });
        break;
      }

      case 'PAYMENT_SUCCESS': {
        if (!subscriptionId) {
          break;
        }
        const nextBillingDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await SubscriptionModel.findByIdAndUpdate(subscriptionId, {
          billing:       { nextBillingDate: nextBillingDate.toISOString() },
          nextBillingDate,
          paymentStatus: 'paid',
        });
        logger.info('[internal] subscription renewed', { subscriptionId });
        break;
      }

      case 'SUBSCRIPTION_PAYMENT_FAILED': {
        if (!subscriptionId || !userId) {
          break;
        }
        await SubscriptionModel.findByIdAndUpdate(subscriptionId, {
          status:        'payment_failed',
          paymentStatus: 'failed',
        });
        await UserModel.findByIdAndUpdate(userId, {
          subscriptionStatus: 'payment_failed',
        });
        logger.warn('[internal] subscription payment failed', { subscriptionId });
        break;
      }

      case 'PAYMENT_RETRY_SCHEDULED': {
        logger.info('[internal] payment retry scheduled', { subscriptionId, retryAt });
        // Future: send push notification / email to user
        break;
      }

      default:
        logger.warn('[internal] unknown event type:', type);
    }
  } catch (err) {
    logger.error(`[internal] error handling ${type}:`, err);
  }
});

export default router;
