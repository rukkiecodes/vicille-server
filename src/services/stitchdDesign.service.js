/**
 * Stitchd AI Design Generator (batch 12, spec §5.6 / §7.6) — Gemini Imagen → Cloudinary.
 *
 * Turns a text description + style modifiers + colour into 4–6 reference images (a mood
 * board). Images are generated with Google Imagen (via the Gemini API) and HOSTED on
 * Cloudinary so they have public URLs the tailor can save to a customer/order and share over
 * WhatsApp. Pure transport; metering + tier caps live in the resolver.
 *
 * Prompt is prefixed for the African tailoring market so generic models render native styles
 * better (plan risk: image relevance) — tune via STITCHD_DESIGN_PROMPT_PREFIX.
 */
import { uploadBase64Image } from './cloudinary.service.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'imagen-3.0-generate-002';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:predict`;

const PROMPT_PREFIX = process.env.STITCHD_DESIGN_PROMPT_PREFIX
  || 'Professional fashion reference photo of an African/Nigerian tailoring garment, studio lighting, full outfit, high detail. ';

const DEFAULT_COUNT = 4;
const MAX_COUNT = 6;

function buildPrompt({ description, styleModifiers = [], color }) {
  const parts = [PROMPT_PREFIX, String(description || '').trim()];
  if (color) parts.push(`Primary colour: ${color}.`);
  if (styleModifiers.length) parts.push(`Style: ${styleModifiers.join(', ')}.`);
  return parts.filter(Boolean).join(' ');
}

/**
 * Generate `count` reference images and upload them to Cloudinary.
 * Returns { prompt, imageUrls }. @throws Error with .code 'AI_NOT_CONFIGURED'|'BAD_INPUT'|'AI_UPSTREAM'
 */
export async function generateDesign({ description, styleModifiers = [], color, count = DEFAULT_COUNT, tailorId }) {
  if (!GEMINI_API_KEY) {
    const err = new Error('The AI Design Generator is not configured on the server.');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  if (!String(description || '').trim()) {
    const err = new Error('Describe the design first.');
    err.code = 'BAD_INPUT';
    throw err;
  }
  const sampleCount = Math.min(MAX_COUNT, Math.max(1, Number(count) || DEFAULT_COUNT));
  const prompt = buildPrompt({ description, styleModifiers, color });

  const res = await fetch(`${URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount, aspectRatio: '3:4' },
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Imagen error ${res.status}: ${detail.slice(0, 200)}`);
    err.code = 'AI_UPSTREAM';
    throw err;
  }

  const data = await res.json();
  const preds = data?.predictions || [];
  const base64s = preds
    .map((p) => p.bytesBase64Encoded || p.image?.bytesBase64Encoded)
    .filter(Boolean);
  if (!base64s.length) {
    const err = new Error('The AI did not return any images.');
    err.code = 'AI_UPSTREAM';
    throw err;
  }

  // Host each image on Cloudinary; skip any that fail to upload.
  const uploads = await Promise.all(
    base64s.map(async (b64, i) => {
      try {
        const result = await uploadBase64Image(`data:image/png;base64,${b64}`, {
          folder: `stitchd/ai-designs/${tailorId || 'unknown'}`,
        });
        return result?.secure_url || null;
      } catch { return null; }
    })
  );
  const imageUrls = uploads.filter(Boolean);
  if (!imageUrls.length) {
    const err = new Error('Could not save the generated images. Please try again.');
    err.code = 'AI_UPSTREAM';
    throw err;
  }
  return { prompt, imageUrls, model: IMAGE_MODEL };
}

export default { generateDesign };
