/**
 * Internal event endpoint — receives subscription lifecycle events from vicelle-pay.
 * Protected by the shared x-service-key header.
 */
import { Router } from 'express';
import SubscriptionModel from '../modules/subscriptions/subscription.model.js';
import UserModel from '../modules/users/user.model.js';
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
  // Always respond immediately so vicelle-pay doesn't time out
  res.status(200).json({ received: true });

  const { type, userId, subscriptionId, retryAt, amount } = req.body;
  logger.info(`[internal] subscription-event: ${type}`, { userId, subscriptionId });

  try {
    switch (type) {

      case 'SUBSCRIPTION_ACTIVATED': {
        if (!subscriptionId || !userId) break;
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
        logger.info('[internal] subscription activated', { subscriptionId });
        break;
      }

      case 'PAYMENT_SUCCESS': {
        if (!subscriptionId) break;
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
        if (!subscriptionId || !userId) break;
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
