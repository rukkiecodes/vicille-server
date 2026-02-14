import { Router } from 'express';
import crypto from 'crypto';
import config from '../config/index.js';
import logger from '../core/logger/index.js';

const router = Router();

/**
 * Verify Paystack webhook signature
 */
const verifyPaystackSignature = (req) => {
  const hash = crypto
    .createHmac('sha512', config.payment.paystack.webhookSecret || '')
    .update(JSON.stringify(req.body))
    .digest('hex');

  return hash === req.headers['x-paystack-signature'];
};

/**
 * Paystack webhook endpoint
 */
router.post('/paystack', async (req, res) => {
  try {
    // Verify signature
    if (!verifyPaystackSignature(req)) {
      logger.warn('Paystack webhook: Invalid signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event = req.body;
    logger.info(`Paystack webhook received: ${event.event}`, {
      reference: event.data?.reference,
    });

    // Handle different event types
    switch (event.event) {
      case 'charge.success':
        // TODO: Handle successful charge
        logger.info('Payment successful', { reference: event.data.reference });
        break;

      case 'charge.failed':
        // TODO: Handle failed charge
        logger.warn('Payment failed', { reference: event.data.reference });
        break;

      case 'transfer.success':
        // TODO: Handle successful transfer (payout)
        logger.info('Transfer successful', { reference: event.data.reference });
        break;

      case 'transfer.failed':
        // TODO: Handle failed transfer
        logger.warn('Transfer failed', { reference: event.data.reference });
        break;

      case 'subscription.create':
        // TODO: Handle subscription created
        logger.info('Subscription created', { code: event.data.subscription_code });
        break;

      case 'subscription.disable':
        // TODO: Handle subscription disabled
        logger.info('Subscription disabled', { code: event.data.subscription_code });
        break;

      case 'invoice.payment_failed':
        // TODO: Handle invoice payment failure
        logger.warn('Invoice payment failed', { reference: event.data.reference });
        break;

      default:
        logger.info(`Unhandled webhook event: ${event.event}`);
    }

    // Always respond with 200 to acknowledge receipt
    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Paystack webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
