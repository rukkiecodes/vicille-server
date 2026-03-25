-- Migration 020: Add style_id to style_selection_queue for direct style table lookup
-- style_id is extracted from stylePayload.styleId saved by the user app when placing orders

ALTER TABLE style_selection_queue ADD COLUMN IF NOT EXISTS style_id UUID REFERENCES styles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_style_selection_queue_style_id ON style_selection_queue(style_id);

-- Backfill style_id from existing style_payload JSONB where styleId is present
UPDATE style_selection_queue
SET style_id = (style_payload->>'styleId')::UUID
WHERE style_id IS NULL
  AND style_payload->>'styleId' IS NOT NULL
  AND EXISTS (SELECT 1 FROM styles WHERE id = (style_payload->>'styleId')::UUID);
