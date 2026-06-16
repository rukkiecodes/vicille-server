/**
 * Stitchd voice-to-measurement transcription (batch 03, spec §9).
 *
 * Takes a short dictation clip ("neck 14, shoulder 17, chest 38…"), runs it through
 * OpenAI Whisper, and parses the transcript into `BodyMeasurements`-keyed candidates the
 * tailor can correct by hand. We call OpenAI with the global `fetch` (same approach as
 * core/utils/style-enricher.js) — no SDK dependency.
 *
 * AI metering + tier-cap enforcement live in the resolver (StitchdAiUsageModel); this
 * service is pure transport + parsing.
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';

/**
 * Spoken-term → canonical BodyMeasurements key. Multi-word aliases are listed and matched
 * longest-first so "sleeve length" beats "sleeve" → "length". Keep aligned with the
 * `BodyMeasurements` vocabulary in measurement.typeDefs.js (doc 01 §2).
 */
const ALIASES = [
  ['sleeveLength', ['sleeve length', 'sleeve']],
  ['trouserLength', ['trouser length', 'trousers length', 'trouser', 'trousers']],
  ['topLength', ['top length', 'shirt length']],
  ['gownLength', ['gown length', 'dress length']],
  ['highWaist', ['high waist']],
  ['underbust', ['under bust', 'underbust']],
  ['aroundArm', ['around arm', 'arm round', 'armhole', 'bicep', 'arm']],
  ['neck', ['neck']],
  ['shoulder', ['shoulder', 'shoulders']],
  ['chest', ['chest']],
  ['bust', ['bust']],
  ['stomach', ['stomach', 'belly', 'tummy']],
  ['waist', ['waist']],
  ['hips', ['hips', 'hip']],
  ['thigh', ['thigh', 'thighs']],
  ['knee', ['knee', 'knees']],
  ['ankle', ['ankle', 'ankles']],
  ['wrist', ['wrist']],
  ['crotch', ['crotch', 'rise']],
  ['height', ['height']],
  ['weight', ['weight']],
];

/** Escape a string for use inside a RegExp. */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse a transcript into { field: number } candidates. Numbers may be decimals
 * ("14.5") or "<n> and a half" / "<n> point five". Each canonical key takes its first
 * match; longer aliases are tried before shorter ones so they win.
 */
export function parseMeasurements(transcript) {
  const text = ` ${String(transcript || '').toLowerCase().replace(/[,]/g, ' ')} `;
  const fields = {};

  for (const [key, aliases] of ALIASES) {
    if (key in fields) continue;
    for (const alias of aliases) {
      // alias, then up to a few non-digit chars, then a number, optional half-suffix.
      const re = new RegExp(
        `${escapeRe(alias)}[^0-9]{0,5}(\\d{1,3}(?:\\.\\d{1,2})?)\\s*(and a half|point five|½)?`,
        'i'
      );
      const m = text.match(re);
      if (m) {
        let value = parseFloat(m[1]);
        if (m[2]) value += 0.5;
        if (!Number.isNaN(value)) {
          fields[key] = value;
          break;
        }
      }
    }
  }

  return fields;
}

/**
 * Run a base64 audio clip through Whisper. Returns the raw transcript string.
 * Throws if OpenAI is unconfigured or the call fails (resolver maps to a GraphQL error).
 */
export async function transcribeAudio({ base64, mimeType = 'audio/m4a', filename = 'audio.m4a' }) {
  if (!OPENAI_API_KEY) {
    const err = new Error('Transcription is not configured on the server.');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  if (!base64) {
    const err = new Error('No audio provided.');
    err.code = 'BAD_AUDIO';
    throw err;
  }

  const buffer = Buffer.from(base64, 'base64');
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('model', 'whisper-1');
  // Bias toward our domain so digits + body terms transcribe cleanly.
  form.append(
    'prompt',
    'Tailoring measurements dictated in inches or centimeters: neck, shoulder, chest, bust, waist, hips, sleeve, thigh, knee, ankle.'
  );

  const res = await fetch(WHISPER_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: form,
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Whisper error ${res.status}: ${detail.slice(0, 200)}`);
    err.code = 'AI_UPSTREAM';
    throw err;
  }

  const data = await res.json();
  return data.text || '';
}

export default { transcribeAudio, parseMeasurements };
