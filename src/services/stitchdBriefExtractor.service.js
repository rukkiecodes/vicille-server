/**
 * Stitchd AI Brief Extractor (batch 12, spec §5.6) — Google Gemini.
 *
 * Turns a customer's rambling text (or a transcribed voice note) into a clean structured
 * order brief: garment type, fabric, colours, deadline, special instructions, and any
 * measurements mentioned. Voice → text reuses the shared Gemini transcription helper
 * (batch 03). Pure transport; metering + tier caps live in the resolver.
 */
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL_STARTER || 'gemini-2.0-flash';
const URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const SYSTEM_PROMPT = [
  'You extract structured tailoring order briefs from a customer message for a Nigerian/African',
  'tailor. Understand trade terms (agbada, senator, kaftan, ankara, aso-oke, gown, etc.) and',
  'pidgin/mixed English. Return ONLY JSON matching this shape (use null/empty when unknown):',
  '{',
  '  "garmentType": string|null,',
  '  "fabric": string|null,',
  '  "colors": string[],',
  '  "deadline": string|null,            // natural-language date if mentioned',
  '  "instructions": string|null,        // styling/fit notes, occasion',
  '  "measurementsMentioned": string|null,',
  '  "summary": string                   // one-line plain-English summary',
  '}',
].join('\n');

/**
 * Extract a structured brief from text. Returns the parsed object.
 * @throws Error with .code 'AI_NOT_CONFIGURED' | 'BAD_INPUT' | 'AI_UPSTREAM'
 */
export async function extractBrief(text) {
  if (!GEMINI_API_KEY) {
    const err = new Error('The AI Brief Extractor is not configured on the server.');
    err.code = 'AI_NOT_CONFIGURED';
    throw err;
  }
  const input = String(text || '').trim();
  if (!input) {
    const err = new Error('Paste a message or record a voice note first.');
    err.code = 'BAD_INPUT';
    throw err;
  }

  const res = await fetch(`${URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: input }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2, maxOutputTokens: 600 },
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
  const raw = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
  if (!raw) {
    const err = new Error('The AI returned an empty response.');
    err.code = 'AI_UPSTREAM';
    throw err;
  }
  try {
    return JSON.parse(raw);
  } catch {
    // Model occasionally wraps JSON in prose — salvage the first {...} block.
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    const err = new Error('Could not read the brief. Try rephrasing the message.');
    err.code = 'AI_UPSTREAM';
    throw err;
  }
}

export default { extractBrief };
