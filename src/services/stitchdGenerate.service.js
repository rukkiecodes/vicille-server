/**
 * Generic Gemini text generation for the advanced-AI features (batch 19): measurement validator
 * AI pass, customer auto-tag, and social-post generation. Same REST `generateContent` pattern as
 * the fit consultant (no SDK); model tier-tuned via env. Metering/caps are enforced by the
 * caller (doc 01 §7) BEFORE this runs.
 */
import { modelForTier } from './stitchdFitConsultant.service.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Generate text from a prompt. If `json` is true, requests a JSON response and parses it
 * (returns null on parse failure so callers can fall back gracefully).
 */
export async function generateText({ system, prompt, tier = 'starter', json = false, maxTokens = 600, temperature = 0.7 }) {
  if (!GEMINI_API_KEY) {
    const err = new Error('AI is not configured.');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const model = modelForTier(tier);
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  if (system) body.system_instruction = { parts: [{ text: system }] };

  const res = await fetch(`${API_BASE}/${model}:generateContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Gemini error ${res.status}: ${detail.slice(0, 200)}`);
    err.code = 'AI_UPSTREAM';
    throw err;
  }
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim() || '';
  if (json) {
    try { return JSON.parse(text); } catch { return null; }
  }
  return text;
}

export default { generateText };
