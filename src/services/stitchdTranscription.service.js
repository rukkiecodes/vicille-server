/**
 * Stitchd voice-to-measurement transcription (batch 03, spec §9) — Google Gemini.
 *
 * Takes a short dictation clip ("neck 14, shoulder 17, chest 38…"), transcribes it with
 * Gemini (audio understanding via `generateContent` inline_data), and parses the transcript
 * into `BodyMeasurements`-keyed candidates the tailor can correct by hand. Called with the
 * global `fetch` — no SDK dependency.
 *
 * AI metering + tier-cap enforcement live in the resolver (StitchdAiUsageModel); this
 * service is pure transport + parsing.
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL_STARTER || 'gemini-2.0-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
 * Map a client-supplied audio mime to one Gemini accepts. expo-audio commonly produces m4a
 * (AAC in an MP4 container) on Android and caf/m4a on iOS; Gemini reads these as audio/mp4.
 */
function geminiAudioMime(mimeType = '') {
  const m = mimeType.toLowerCase();
  if (m.includes('m4a') || m.includes('mp4') || m.includes('aac')) return 'audio/mp4';
  if (m.includes('wav')) return 'audio/wav';
  if (m.includes('mp3') || m.includes('mpeg')) return 'audio/mp3';
  if (m.includes('ogg')) return 'audio/ogg';
  if (m.includes('flac')) return 'audio/flac';
  return 'audio/mp4';
}

/**
 * Transcribe a base64 audio clip with Gemini. Returns the raw transcript string.
 * Throws if Gemini is unconfigured or the call fails (resolver maps to a GraphQL error).
 */
export async function transcribeAudio({ base64, mimeType = 'audio/m4a' }) {
  if (!GEMINI_API_KEY) {
    const err = new Error('Transcription is not configured on the server.');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  if (!base64) {
    const err = new Error('No audio provided.');
    err.code = 'BAD_AUDIO';
    throw err;
  }

  const res = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'Transcribe this audio of a tailor dictating body measurements in inches or ' +
                'centimeters (e.g. "neck 14, shoulder 17, chest 38"). Return ONLY the spoken ' +
                'words as plain text, including the numbers. Do not add commentary.',
            },
            { inline_data: { mime_type: geminiAudioMime(mimeType), data: base64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Gemini error ${res.status}: ${detail.slice(0, 200)}`);
    err.code = 'AI_UPSTREAM';
    throw err;
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim() || '';
}

export default { transcribeAudio, parseMeasurements };
