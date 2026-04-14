/**
 * Internal event endpoint — receives subscription and wallet lifecycle events from the payments service.
 * Protected by the shared x-service-key header.
 */
import { Router } from 'express';
import SubscriptionModel from '../modules/subscriptions/subscription.model.js';
import SubscriptionPlanModel from '../modules/subscriptions/subscriptionPlan.model.js';
import UserModel from '../modules/users/user.model.js';
import WalletModel from '../modules/wallet/wallet.model.js';
import WalletTransactionModel from '../modules/wallet/walletTransaction.model.js';
import SavedCardModel from '../modules/wallet/savedCard.model.js';
import ReferralModel from '../modules/referrals/referral.model.js';
import AffiliateModel from '../modules/affiliates/affiliate.model.js';
import { query } from '../infrastructure/database/postgres.js';
import emailService from '../services/email.service.js';
import logger from '../core/logger/index.js';

const router = Router();

// ── Service-key guard ─────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const key = String(req.headers['x-service-key'] || '').trim();
  const expected = String(process.env.INTERNAL_SERVICE_KEY || '').trim();
  if (!key || !expected || key !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function nextBillingDate() {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
}

async function rewardReferrals(userId, subscriptionId) {
  try {
    const reward = await ReferralModel.rewardInviteForSubscription({ invitedUserId: userId, subscriptionId });
    if (reward) {
      logger.info('[internal] referral reward credited', {
        inviterUserId: reward.inviterUserId,
        invitedUserId: userId,
        rewardAmount:  reward.rewardAmount,
      });
    }
  } catch (err) {
    logger.error('[internal] referral reward error:', err.message);
  }

  try {
    const { rows } = await query(
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
    const invite = rows[0];
    if (invite) {
      const amount = Number(invite.referral_reward_ngn || 1000);
      await query(
        `UPDATE referral_invites
            SET status = 'rewarded', rewarded_at = NOW(),
                reward_amount = $1, reward_currency = 'NGN', subscription_id = $2
          WHERE id = $3`,
        [amount, subscriptionId, invite.id]
      );
      await AffiliateModel.rewardForSubscription({
        affiliateId: invite.affiliate_id,
        amount,
        currency:    'NGN',
        referenceId: invite.id,
      });
      logger.info('[internal] affiliate reward credited', {
        affiliateId: invite.affiliate_id,
        invitedUserId: userId,
        rewardAmount:  amount,
      });
    }
  } catch (err) {
    logger.error('[internal] affiliate reward error:', err.message);
  }
}

async function sendSubscriptionActivatedEmail({ user, planName }) {
  if (!user?.email) return;

  await emailService.sendEmail(
    user.email,
    'Your Vicelle subscription is active',
    `
      <div style="font-family:Segoe UI,Arial,sans-serif;background:#f7f0e7;padding:32px;color:#1f1a17;">
        <div style="max-width:640px;margin:0 auto;background:#fff9f2;border-radius:24px;padding:32px;border:1px solid rgba(154,108,55,0.16);">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#9a6c37;">Vicelle subscription</p>
          <h1 style="margin:0 0 16px;font-size:30px;line-height:1.1;">Your subscription is now active</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hi ${user.fullName || 'there'}, your ${planName || 'Vicelle'} subscription has been activated successfully.</p>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#5d554d;">You can return to the app and continue with your account as normal.</p>
        </div>
      </div>
    `,
    `Hi ${user.fullName || 'there'},\n\nYour ${planName || 'Vicelle'} subscription is now active. You can return to the app and continue as normal.`
  );
}

async function sendSubscriptionFailedEmail({ user, planName, reason }) {
  if (!user?.email) return;

  await emailService.sendEmail(
    user.email,
    'Vicelle subscription update',
    `
      <div style="font-family:Segoe UI,Arial,sans-serif;background:#f7f0e7;padding:32px;color:#1f1a17;">
        <div style="max-width:640px;margin:0 auto;background:#fff9f2;border-radius:24px;padding:32px;border:1px solid rgba(159,63,53,0.16);">
          <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#9a6c37;">Vicelle subscription</p>
          <h1 style="margin:0 0 16px;font-size:30px;line-height:1.1;color:#9f3f35;">Subscription could not be completed</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:1.7;">Hi ${user.fullName || 'there'}, we could not complete activation for ${planName || 'your selected plan'}.</p>
          <p style="margin:0;font-size:15px;line-height:1.7;color:#5d554d;"><strong>Reason:</strong> ${reason || 'The authorization was not completed.'}</p>
        </div>
      </div>
    `,
    `Hi ${user.fullName || 'there'},\n\nWe could not complete activation for ${planName || 'your selected plan'}.\nReason: ${reason || 'The authorization was not completed.'}`
  );
}

// ── POST /internal/subscription-event ────────────────────────────────────────
router.post('/subscription-event', async (req, res) => {
  const { type } = req.body;
  logger.info(`[internal] subscription-event: ${type}`);

  try {
    switch (type) {

      // ── Fired by the /authorization/callback after Paystack redirects the user ──
      // Activates the subscription. May or may not have paystackSubscriptionCode yet;
      // subscription.create webhook fires separately with those fields.
      case 'SUBSCRIPTION_ACTIVATED': {
        const {
          userId,
          subscriptionId,
          customerEmail,
          authorizationCode,
          paystackSubscriptionCode,
          paystackEmailToken,
          planName,
        } = req.body;

        let resolvedUserId = userId || null;
        let resolvedSubscriptionId = subscriptionId || null;

        // If metadata has a subscriptionId, verify it is still activatable.
        // It may reference a cancelled subscription from a previous attempt
        // (e.g. user retried and a new pending_payment sub was created).
        if (resolvedSubscriptionId) {
          const metaSub = await SubscriptionModel.findById(resolvedSubscriptionId);
          if (!metaSub || metaSub.status === 'cancelled' || metaSub.status === 'payment_failed') {
            logger.warn('[internal] SUBSCRIPTION_ACTIVATED — metadata sub is not activatable, will resolve by email', {
              subscriptionId: resolvedSubscriptionId,
              status: metaSub?.status,
            });
            resolvedSubscriptionId = null; // force email-based fallback below
          }
        }

        // Fallback: resolve by email when IDs are missing or the metadata sub was stale.
        if ((!resolvedUserId || !resolvedSubscriptionId) && customerEmail) {
          const user = await UserModel.findByEmail(customerEmail);
          if (user) {
            resolvedUserId = resolvedUserId || user.id;
            const subs = await SubscriptionModel.findByUser(user.id);
            const targetSub =
              subs.find((s) => s.status === 'pending_payment') ||
              subs.find((s) => s.status === 'active' && !s.paystackSubscriptionCode) ||
              null;
            if (targetSub) {
              resolvedSubscriptionId = targetSub.id;
            }
          }
        }

        if (!resolvedSubscriptionId || !resolvedUserId) {
          logger.warn('[internal] SUBSCRIPTION_ACTIVATED missing target subscription/user', {
            userId,
            subscriptionId,
            customerEmail,
          });
          break;
        }

        const billingDate = nextBillingDate();
        const updates = {
          status:        'active',
          paymentStatus: 'paid',
          billing:       { nextBillingDate: billingDate.toISOString() },
        };
        if (authorizationCode)        updates.authorizationCode        = authorizationCode;
        if (paystackSubscriptionCode) updates.paystackSubscriptionCode = paystackSubscriptionCode;
        if (paystackEmailToken)       updates.paystackEmailToken       = paystackEmailToken;

        await SubscriptionModel.findByIdAndUpdate(resolvedSubscriptionId, updates);
        await UserModel.findByIdAndUpdate(resolvedUserId, {
          subscriptionStatus:  'active',
          currentSubscription: resolvedSubscriptionId,
        });
        const user = await UserModel.findById(resolvedUserId);
        await rewardReferrals(resolvedUserId, resolvedSubscriptionId);
        await sendSubscriptionActivatedEmail({ user, planName }).catch((err) => {
          logger.error('[internal] subscription activation email error:', err.message);
        });
        logger.info('[internal] subscription activated', {
          subscriptionId: resolvedSubscriptionId,
          userId: resolvedUserId,
          resolvedFromEmail: Boolean(!subscriptionId || !userId),
        });
        break;
      }

      // ── Fired by the subscription.create webhook (after first payment on a plan) ──
      // Authoritative source for paystackSubscriptionCode + paystackEmailToken.
      // May arrive before or after SUBSCRIPTION_ACTIVATED (race with callback).
      case 'SUBSCRIPTION_CREATED': {
        const { customerEmail, subscriptionCode, emailToken, planCode, authorizationCode } = req.body;
        if (!subscriptionCode || !customerEmail) break;

        const user = await UserModel.findByEmail(customerEmail);
        if (!user) {
          logger.warn('[internal] SUBSCRIPTION_CREATED — user not found for email:', customerEmail);
          break;
        }

        // Find the subscription this event belongs to.
        // Prefer: pending subscription (callback hasn't fired yet)
        // Fallback: active subscription without paystackSubscriptionCode (callback fired first)
        const subs = await SubscriptionModel.findByUser(user.id);
        const sub  = subs.find(s => s.status === 'pending_payment')
                  || subs.find(s => s.status === 'active' && !s.paystackSubscriptionCode);

        if (!sub) {
          logger.warn('[internal] SUBSCRIPTION_CREATED — no matching subscription for user:', user.id);
          break;
        }

        const isActivating = sub.status === 'pending_payment';
        const billingDate  = nextBillingDate();
        const updates = {
          paystackSubscriptionCode: subscriptionCode,
          paystackEmailToken:       emailToken,
        };
        if (authorizationCode) updates.authorizationCode = authorizationCode;

        // If the subscription was still pending (callback didn't fire yet), activate it now.
        if (isActivating) {
          updates.status        = 'active';
          updates.paymentStatus = 'paid';
          updates.billing       = { nextBillingDate: billingDate.toISOString() };
        }

        await SubscriptionModel.findByIdAndUpdate(sub.id, updates);

        if (isActivating) {
          const plan = sub.plan ? await SubscriptionPlanModel.findById(sub.plan) : null;
          await UserModel.findByIdAndUpdate(user.id, {
            subscriptionStatus:  'active',
            currentSubscription: sub.id,
          });
          await rewardReferrals(user.id, sub.id);
          await sendSubscriptionActivatedEmail({ user, planName: plan?.name || req.body.planName }).catch((err) => {
            logger.error('[internal] subscription activation email error:', err.message);
          });
          logger.info('[internal] subscription activated via SUBSCRIPTION_CREATED', { subId: sub.id });
        } else {
          logger.info('[internal] paystackSubscriptionCode stored on already-active sub', { subId: sub.id });
        }
        break;
      }

      // ── Fired by browser callback when the initial card authorization fails ──
      case 'SUBSCRIPTION_ACTIVATION_FAILED': {
        const { userId, subscriptionId, customerEmail, reason, planName } = req.body;

        let user = userId ? await UserModel.findById(userId) : null;
        if (!user && customerEmail) {
          user = await UserModel.findByEmail(customerEmail);
        }

        if (subscriptionId) {
          await SubscriptionModel.findByIdAndUpdate(subscriptionId, {
            status: 'payment_failed',
            paymentStatus: 'failed',
          });
        }

        await sendSubscriptionFailedEmail({ user, planName, reason }).catch((err) => {
          logger.error('[internal] subscription failure email error:', err.message);
        });

        logger.warn('[internal] subscription activation failed', { subscriptionId, userId, customerEmail });
        break;
      }

      // ── Fired by charge.success webhook on subscription renewal ──────────────
      case 'SUBSCRIPTION_RENEWED': {
        const { subscriptionCode, reference, amountKobo } = req.body;
        if (!subscriptionCode) break;

        const sub = await SubscriptionModel.findByPaystackCode(subscriptionCode);
        if (!sub) {
          logger.warn('[internal] SUBSCRIPTION_RENEWED — subscription not found:', subscriptionCode);
          break;
        }

        const billingDate = nextBillingDate();
        await SubscriptionModel.findByIdAndUpdate(sub.id, {
          paymentStatus: 'paid',
          billing: {
            nextBillingDate:  billingDate.toISOString(),
            lastBillingDate:  new Date().toISOString(),
            failedAttempts:   0,
          },
        });
        logger.info('[internal] subscription renewed', { subId: sub.id, reference, amountKobo });
        break;
      }

      // ── Fired by subscription.not_renew webhook (user cancelled via manage link) ──
      case 'SUBSCRIPTION_NOT_RENEW': {
        const { subscriptionCode } = req.body;
        if (!subscriptionCode) break;

        const sub = await SubscriptionModel.findByPaystackCode(subscriptionCode);
        if (!sub) {
          logger.warn('[internal] SUBSCRIPTION_NOT_RENEW — subscription not found:', subscriptionCode);
          break;
        }

        await SubscriptionModel.findByIdAndUpdate(sub.id, { renewalEnabled: false });
        logger.info('[internal] subscription set to not renew', { subId: sub.id });
        break;
      }

      // ── Fired by invoice.payment_failed ──────────────────────────────────────
      case 'SUBSCRIPTION_PAYMENT_FAILED': {
        const { userId, subscriptionId } = req.body;
        if (!subscriptionId || !userId) break;
        const sub = await SubscriptionModel.findById(subscriptionId);
        const plan = sub?.plan ? await SubscriptionPlanModel.findById(sub.plan) : null;
        await SubscriptionModel.findByIdAndUpdate(subscriptionId, {
          status:        'payment_failed',
          paymentStatus: 'failed',
        });
        await UserModel.findByIdAndUpdate(userId, { subscriptionStatus: 'payment_failed' });
        const user = await UserModel.findById(userId);
        await sendSubscriptionFailedEmail({
          user,
          planName: plan?.name || 'your subscription',
          reason: 'We could not collect the scheduled subscription payment.',
        }).catch((err) => {
          logger.error('[internal] subscription payment failure email error:', err.message);
        });
        logger.warn('[internal] subscription payment failed', { subscriptionId });
        break;
      }

      // ── Fired by subscription.disable webhook ────────────────────────────────
      case 'SUBSCRIPTION_CANCELLED': {
        const { userId, subscriptionId, subscriptionCode } = req.body;

        let sub = subscriptionId ? await SubscriptionModel.findById(subscriptionId) : null;
        if (!sub && subscriptionCode) sub = await SubscriptionModel.findByPaystackCode(subscriptionCode);
        if (!sub) {
          logger.warn('[internal] SUBSCRIPTION_CANCELLED — subscription not found');
          break;
        }

        await SubscriptionModel.findByIdAndUpdate(sub.id, { status: 'cancelled' });

        const uid = userId || sub.userId;
        if (uid) {
          await UserModel.findByIdAndUpdate(uid, {
            subscriptionStatus:  'cancelled',
            currentSubscription: null,
          });
        }
        logger.info('[internal] subscription cancelled', { subId: sub.id });
        break;
      }

      case 'PAYMENT_RETRY_SCHEDULED': {
        logger.info('[internal] payment retry scheduled', req.body);
        break;
      }

      // ── Wallet: bank-transfer top-up ─────────────────────────────────────────
      // Fired by charge.success webhook when channel === 'dedicated_nuban'
      case 'WALLET_TOPUP_BANK': {
        const { userId, customerEmail, reference, amountKobo } = req.body;
        if (!reference || !amountKobo) break;

        const user = userId
          ? await UserModel.findById(userId)
          : customerEmail ? await UserModel.findByEmail(customerEmail) : null;

        if (!user) {
          logger.warn('[internal] WALLET_TOPUP_BANK — user not found', { userId, customerEmail });
          break;
        }

        const wallet = await WalletModel.findByUserId(user.id);
        if (!wallet) {
          logger.warn('[internal] WALLET_TOPUP_BANK — wallet not found for user:', user.id);
          break;
        }

        // Dedup: skip if this reference was already credited
        const already = await WalletTransactionModel.existsByReference(reference);
        if (already) {
          logger.info('[internal] WALLET_TOPUP_BANK — duplicate reference, skipping:', reference);
          break;
        }

        await WalletModel.creditWithLedger({
          userId:           user.id,
          walletId:         wallet.id,
          amountKobo:       Number(amountKobo),
          type:             'topup',
          paystackReference: reference,
          paystackChannel:  'bank_transfer',
          description:      'Wallet funded via bank transfer',
        });
        logger.info('[internal] wallet credited (bank transfer)', { userId: user.id, amountKobo, reference });
        break;
      }

      // ── Wallet: card top-up ───────────────────────────────────────────────────
      // Fired by charge.success webhook when metadata.purpose === 'wallet_topup'
      case 'WALLET_TOPUP_CARD': {
        const {
          userId, reference, amountKobo,
          authorizationCode, cardSignature, last4, bin,
          expMonth, expYear, cardType, bank, brand, channel,
        } = req.body;

        if (!userId || !reference || !amountKobo) break;

        const wallet = await WalletModel.findByUserId(userId);
        if (!wallet) {
          logger.warn('[internal] WALLET_TOPUP_CARD — wallet not found for user:', userId);
          break;
        }

        const already = await WalletTransactionModel.existsByReference(reference);
        if (already) {
          logger.info('[internal] WALLET_TOPUP_CARD — duplicate reference, skipping:', reference);
          break;
        }

        await WalletModel.creditWithLedger({
          userId,
          walletId:          wallet.id,
          amountKobo:        Number(amountKobo),
          type:              'topup',
          paystackReference: reference,
          paystackChannel:   channel || 'card',
          description:       'Wallet funded via card',
        });

        // Save card for future use (idempotent — deduped by signature)
        if (authorizationCode) {
          try {
            await SavedCardModel.upsertBySignature({
              userId, authorizationCode,
              last4, bin, expMonth, expYear, cardType, bank, brand,
              channel: channel || 'card',
              signature: cardSignature || null,
            });
          } catch (cardErr) {
            logger.error('[internal] WALLET_TOPUP_CARD — failed to save card:', cardErr.message);
          }
        }

        logger.info('[internal] wallet credited (card)', { userId, amountKobo, reference });
        break;
      }

      // ── Wallet: DVA assigned ──────────────────────────────────────────────────
      // Fired by dedicatedaccount.assign.success webhook
      case 'WALLET_DVA_ASSIGNED': {
        const { customerEmail, accountNumber, accountName, bankName, bankSlug, paystackId } = req.body;
        if (!customerEmail || !accountNumber) break;

        const user = await UserModel.findByEmail(customerEmail);
        if (!user) {
          logger.warn('[internal] WALLET_DVA_ASSIGNED — user not found for email:', customerEmail);
          break;
        }

        await WalletModel.updateDva({
          userId:        user.id,
          accountNumber,
          accountName,
          bankName,
          bankSlug,
          paystackId:    paystackId || null,
        });
        logger.info('[internal] DVA assigned to wallet', { userId: user.id, accountNumber });
        break;
      }

      default:
        logger.warn('[internal] unknown event type:', type);
    }
  } catch (err) {
    logger.error(`[internal] error handling ${type}:`, err);
  }

  // Respond only after processing completes so Vercel does not terminate
  // the function before the database writes finish.
  res.status(200).json({ received: true });
});

export default router;
