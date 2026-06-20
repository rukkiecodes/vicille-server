/**
 * Stitchd AI Fit Consultant (batch 07, spec §5.6 / §7.6) — Google Gemini.
 *
 * Text-only cut/style advisor for the Nigerian/African tailoring market. Tailor asks
 * "what cut suits a tall slim man?" and gets a concise, practical recommendation. Optional
 * customer/fabric photos are passed to Gemini as vision context (no image generation).
 *
 * Provider: Google Gemini via the REST `generateContent` endpoint with the global `fetch`
 * (no SDK dependency). Unlike GPT-4o, Gemini does not fetch image URLs itself, so we download
 * each photo server-side and inline it as base64 `inline_data` (capped at MAX_PHOTOS; a photo
 * that can't be fetched is skipped rather than failing the whole request).
 *
 * Pure transport: AI metering + tier-cap enforcement live in the resolver
 * (StitchdAiUsageModel) — the cap is checked BEFORE this call so cost is capped (spec §12).
 * Model selection is a per-tier config knob (plan risk: unit economics) and overridable by
 * env so model names can be tuned without a code change.
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const MAX_PHOTOS = 3;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // skip oversized images to bound token cost

/**
 * Gemini model per tier — the unit-economics knob (env-overridable). Defaults to the
 * validated GA `gemini-2.0-flash` for every tier; bump pro/enterprise to a stronger model
 * (e.g. gemini-2.5-pro) by setting GEMINI_MODEL_PRO once their quota supports it.
 */
const MODEL_BY_TIER = {
  starter: process.env.GEMINI_MODEL_STARTER || 'gemini-2.0-flash',
  pro: process.env.GEMINI_MODEL_PRO || 'gemini-2.0-flash',
  enterprise: process.env.GEMINI_MODEL_PRO || 'gemini-2.0-flash',
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

/** Download an image URL and return a Gemini `inline_data` part, or null on any failure. */
async function fetchImagePart(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const mime = res.headers.get('content-type') || 'image/jpeg';
    if (!mime.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
    return { inline_data: { mime_type: mime, data: buf.toString('base64') } };
  } catch {
    return null;
  }
}

/**
 * Ask the Fit Consultant. Returns the assistant's answer text.
 * @throws Error with .code 'AI_NOT_CONFIGURED' | 'BAD_INPUT' | 'AI_UPSTREAM'
 */
export async function askFitConsultant({ prompt, photoUrls = [], tier = 'starter' }) {
  if (!GEMINI_API_KEY) {
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

  const urls = (Array.isArray(photoUrls) ? photoUrls : [])
    .filter((u) => typeof u === 'string' && u.startsWith('http'))
    .slice(0, MAX_PHOTOS);
  const imageParts = (await Promise.all(urls.map(fetchImagePart))).filter(Boolean);

  const parts = [{ text }, ...imageParts];

  const model = modelForTier(tier);
  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Gemini error ${res.status}: ${detail.slice(0, 200)}`);
    err.code = 'AI_UPSTREAM';
    throw err;
  }

  const data = await res.json();
  const answer = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
  if (!answer) {
    const err = new Error('The AI returned an empty response.');
    err.code = 'AI_UPSTREAM';
    throw err;
  }
  return answer;
}

export default { askFitConsultant, modelForTier, MAX_PHOTOS };
