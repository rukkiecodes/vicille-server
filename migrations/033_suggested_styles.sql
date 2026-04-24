-- 033: suggested_styles
-- Stores Google search results enriched by AI.
-- These are NOT in the main styles table — they exist only to capture
-- the user's inspiration so a tailor can research and fulfil the order.

CREATE TABLE IF NOT EXISTS suggested_styles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  image_url     TEXT NOT NULL,
  thumbnail_url TEXT,
  source_url    TEXT,          -- link to the original web page (for tailor research)
  search_query  TEXT,
  tags          TEXT[]    DEFAULT '{}',
  user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS suggested_styles_user_id_idx ON suggested_styles(user_id);
CREATE INDEX IF NOT EXISTS suggested_styles_created_at_idx ON suggested_styles(created_at DESC);
