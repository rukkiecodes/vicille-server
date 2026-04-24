/**
 * Uses GPT-4o mini vision to generate a better name, description,
 * category, and tags for a clothing item from its image + original title.
 *
 * Falls back to the original values if OpenAI is not configured or the call fails.
 */

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

const VALID_CATEGORIES = [
  'shirt', 'trousers', 'dress', 'suit', 'agbada',
  'ankara', 'skirt', 'jacket', 'shorts', 'accessories', 'other',
];

const PROMPT = `You are a professional fashion stylist and copywriter.
Look at this clothing image and the original search title provided.
Return a JSON object with exactly these fields:
- "name": a short, elegant product name (max 8 words)
- "description": a compelling 1–2 sentence style description (max 60 words)
- "category": one of [${VALID_CATEGORIES.join(', ')}]
- "tags": an array of 3–6 relevant lowercase fashion keywords

Respond with valid JSON only — no markdown, no extra text.`;

/**
 * @param {{ imageUrl: string, title: string, searchQuery?: string }} params
 * @returns {Promise<{ name: string, description: string, category: string, tags: string[] }>}
 */
export async function enrichStyle({ imageUrl, title, searchQuery }) {
  if (!OPENAI_API_KEY) return null;

  const userContent = [
    {
      type: 'text',
      text: `Original title: "${title}"\nSearch query: "${searchQuery || title}"\n\n${PROMPT}`,
    },
  ];

  // Include vision only when we have a usable image URL
  if (imageUrl && imageUrl.startsWith('http')) {
    userContent.unshift({ type: 'image_url', image_url: { url: imageUrl, detail: 'low' } });
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: userContent }],
        max_tokens: 300,
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.warn('[style-enricher] OpenAI error:', res.status, err.slice(0, 200));
      return null;
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : null;
    const tags = Array.isArray(parsed.tags)
      ? parsed.tags.map((t) => String(t).toLowerCase()).slice(0, 6)
      : [];

    return {
      name:        (parsed.name || title).slice(0, 120),
      description: (parsed.description || '').slice(0, 500),
      category,
      tags,
    };
  } catch (err) {
    console.warn('[style-enricher] failed:', err?.message ?? err);
    return null;
  }
}
