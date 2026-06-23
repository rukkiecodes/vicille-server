/**
 * WhatsApp Business API client (batch 21) — Meta Cloud API. Env-gated: when WHATSAPP_TOKEN /
 * WHATSAPP_PHONE_ID are unset the client reports not-configured so callers fall back to SMS
 * (batch 18) or a manual wa.me deep link (batch 06). Per-template approval + onboarding are
 * operational (per the plan); keep the deep-link fallback always available.
 */
const TOKEN = process.env.WHATSAPP_TOKEN || '';
const PHONE_ID = process.env.WHATSAPP_PHONE_ID || '';
const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export function isConfigured() {
  return Boolean(TOKEN && PHONE_ID);
}

/** Normalize to E.164 digits (no '+'). */
function toWa(phone) {
  const d = String(phone || '').replace(/[^\d]/g, '');
  if (!d) return null;
  if (d.startsWith('0')) return `234${d.slice(1)}`;
  return d;
}

/**
 * Send an approved template message. `params` is the ordered list of body variable values.
 * Returns { providerRef }. Throws { code: 'WA_NOT_CONFIGURED' | 'WA_UPSTREAM' } on failure.
 */
export async function sendTemplate({ to, templateName, languageCode = 'en', params = [] }) {
  if (!isConfigured()) {
    const err = new Error('WhatsApp API is not configured.');
    err.code = 'WA_NOT_CONFIGURED';
    throw err;
  }
  const num = toWa(to);
  if (!num) {
    const err = new Error('Invalid phone number.');
    err.code = 'WA_BAD_INPUT';
    throw err;
  }
  const body = {
    messaging_product: 'whatsapp',
    to: num,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(params.length
        ? { components: [{ type: 'body', parameters: params.map((t) => ({ type: 'text', text: String(t) })) }] }
        : {}),
    },
  };
  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`WhatsApp error ${res.status}: ${detail.slice(0, 200)}`);
    err.code = 'WA_UPSTREAM';
    throw err;
  }
  const data = await res.json();
  return { providerRef: data?.messages?.[0]?.id || null };
}

export default { isConfigured, sendTemplate };
