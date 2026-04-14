-- Migration 025: Saved tailors for user quick access

CREATE TABLE IF NOT EXISTS user_saved_tailors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tailor_id UUID NOT NULL REFERENCES tailors(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, tailor_id)
);

CREATE INDEX IF NOT EXISTS idx_user_saved_tailors_user ON user_saved_tailors(user_id);
CREATE INDEX IF NOT EXISTS idx_user_saved_tailors_tailor ON user_saved_tailors(tailor_id);
