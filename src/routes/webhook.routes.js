/**
 * Public webhook endpoints (batch 21). Currently the WhatsApp Business API delivery-status
 * callback. Mounted at /webhooks (raw→JSON body parsing handled in app.js).
 */
import { Router } from 'express';
import StitchdWaModel from '../modules/stitchd/stitchdWa.model.js';
import { verifyWebhookSignature } from '../services/whatsapp.service.js';
import logger from '../core/logger/index.js';

const router = Router();

// Meta webhook verification handshake.
router.get('/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === (process.env.WHATSAPP_VERIFY_TOKEN || '')) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Delivery-status events → update stitchd_wa_messages.
router.post('/whatsapp', async (req, res) => {
  // Reject forged callbacks: HMAC-SHA256 of the raw body must match Meta's signature header
  // (enforced once WHATSAPP_APP_SECRET is set; a no-op until WhatsApp is onboarded).
  if (!verifyWebhookSignature(req.rawBody, req.headers['x-hub-signature-256'])) {
    logger.warn('[webhook] whatsapp: invalid signature — rejected');
    return res.sendStatus(401);
  }
  try { await StitchdWaModel.ingestWebhook(req.body); } catch (e) { logger.error('[webhook] whatsapp:', e.message); }
  return res.sendStatus(200); // ack valid events so Meta doesn't retry-storm
});

export default router;
