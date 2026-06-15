/**
 * Termii SMS service (Stitchd phone-OTP delivery).
 *
 * Sends transactional SMS via Termii's "send" endpoint. Used by the Stitchd
 * phone-OTP signup flow to deliver one-time codes.
 *
 * Env vars (read lazily so tests/other flows are unaffected when unset):
 *   TERMII_API_KEY    — required to actually send. When UNSET we DO NOT throw:
 *                       we log the message and return { delivered:false, dev:true }
 *                       so the OTP flow is fully testable without a provider.
 *   TERMII_SENDER_ID  — the registered sender id / "from" (default 'Stitchd').
 *   TERMII_BASE_URL   — override the API base (default 'https://api.ng.termii.com').
 *   TERMII_CHANNEL    — Termii channel: 'generic' | 'dnd' | 'whatsapp' (default 'generic').
 */
import logger from '../core/logger/index.js';

const DEFAULT_BASE_URL = 'https://api.ng.termii.com';

/**
 * Send an SMS via Termii.
 *
 * @param {object} args
 * @param {string} args.to       - destination phone in international format (e.g. 2348012345678).
 * @param {string} args.message  - the SMS body.
 * @returns {Promise<{delivered:boolean, dev?:boolean, error?:string, messageId?:string, raw?:any}>}
 *   Never throws — always resolves with a result object so callers can degrade gracefully.
 */
export const sendSms = async ({ to, message }) => {
  const apiKey = process.env.TERMII_API_KEY;
  const senderId = process.env.TERMII_SENDER_ID || 'Stitchd';
  const baseUrl = (process.env.TERMII_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const channel = process.env.TERMII_CHANNEL || 'generic';

  // Dev fallback: no provider configured — log and report non-delivery (do NOT throw).
  if (!apiKey) {
    logger.info(`[termii:dev] SMS to ${to} (not sent — TERMII_API_KEY unset): ${message}`);
    return { delivered: false, dev: true };
  }

  const url = `${baseUrl}/api/sms/send`;
  const payload = {
    to,
    from: senderId,
    sms: message,
    type: 'plain',
    channel,
    api_key: apiKey,
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON response body — leave body null
    }

    if (!res.ok) {
      const errMsg = body?.message || `Termii responded with HTTP ${res.status}`;
      logger.error(`Termii send failed (${res.status}): ${errMsg}`);
      return { delivered: false, error: errMsg, raw: body };
    }

    logger.info(`Termii SMS dispatched to ${to} (message_id=${body?.message_id || 'n/a'})`);
    return { delivered: true, messageId: body?.message_id, raw: body };
  } catch (error) {
    // Network / DNS / timeout errors — never bubble up to the caller.
    logger.error('Termii send network error:', error.message);
    return { delivered: false, error: error.message };
  }
};

export default { sendSms };
