/**
 * Stitchd AI Fit Consultant (batch 07, spec §5.6 / §7.6).
 *
 * Text-only cut/style advisor for the Nigerian/African tailoring market. Tailor asks
 * "what cut suits a tall slim man?" and gets a concise, practical recommendation. Optional
 * customer/fabric photo URLs are passed to GPT-4o as vision context (no image generation).
 *
 * Pure transport: AI metering + tier-cap enforcement live in the resolver
 * (StitchdAiUsageModel) — the cap is checked BEFORE this call so cost is capped (spec §12).
 * We call OpenAI with the global `fetch` (same approach as stitchdTranscription.service.js)
 * — no SDK dependency.
 *
 * Model selection is a per-tier config knob (plan risk: unit economics): starter uses the
 * cheaper gpt-4o-mini, pro/enterprise get gpt-4o. Vision context is allowed on every tier
 * but capped per query (MAX_PHOTOS) so token cost stays bounded.
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const CHAT_URL = 'https://api.openai.com/v1/chat/completions';

const MAX_PHOTOS = 3;

/** GPT model per tier — the unit-economics knob. */
const MODEL_BY_TIER = {
  starter: 'gpt-4o-mini',
  pro: 'gpt-4o',
  enterprise: 'gpt-4o',
};

const SYSTEM_PROMPT = [
  'You are a master tailor and fashion consultant advising professional tailors and fashion',
  'houses in Nigeria and across Africa. Give concise, practical cut and style guidance.',
  '',
  'Guidelines:',
  '- Speak the trade: agbada, senator, kaftan, ankara, aso-oke, dashiki, buba, iro, gele,',
  '  English suit, etc. Know what flatters different body types (tall/slim, short/stout,',
  '  broad-shouldered, plus-size).',
  '- Be specific and actionable: recommend cuts, silhouettes, fabrics, colours, and',
  '  finishing details a tailor can execute. Mention measurements/ease where relevant.',
  '- Keep answers tight (a few short paragraphs or a bullet list). No filler, no disclaimers.',
  '- If a photo is provided, factor in the visible body type, fabric, or existing garment.',
  '- If the question is outside tailoring/fashion, gently steer back.',
].join('\n');

export function modelForTier(tier) {
  return MODEL_BY_TIER[tier] || MODEL_BY_TIER.starter;
}

/**
 * Ask the Fit Consultant. Returns the assistant's answer text.
 * @throws Error with .code 'AI_NOT_CONFIGURED' | 'BAD_INPUT' | 'AI_UPSTREAM'
 */
export async function askFitConsultant({ prompt, photoUrls = [], tier = 'starter' }) {
  if (!OPENAI_API_KEY) {
    const err = new Error('The AI Fit Consultant is not configured on the server.');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const text = String(prompt || '').trim();
  if (!text) {
    const err = new Error('Ask a question first.');
    err.code = 'BAD_INPUT';
    throw err;
  }

  const photos = (Array.isArray(photoUrls) ? photoUrls : [])
    .filter((u) => typeof u === 'string' && u.startsWith('http'))
    .slice(0, MAX_PHOTOS);

  // GPT-4o vision message: text plus any image_url parts.
  const userContent = [
    { type: 'text', text },
    ...photos.map((url) => ({ type: 'image_url', image_url: { url } })),
  ];

  const res = await fetch(CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelForTier(tier),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      max_tokens: 700,
      temperature: 0.7,
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`OpenAI error ${res.status}: ${detail.slice(0, 200)}`);
    err.code = 'AI_UPSTREAM';
    throw err;
  }

  const data = await res.json();
  const answer = data?.choices?.[0]?.message?.content?.trim();
  if (!answer) {
    const err = new Error('The AI returned an empty response.');
    err.code = 'AI_UPSTREAM';
    throw err;
  }
  return answer;
}

export default { askFitConsultant, modelForTier, MAX_PHOTOS };
