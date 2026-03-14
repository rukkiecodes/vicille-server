-- Global styling window overrides + queued style selections

CREATE TABLE IF NOT EXISTS styling_window_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  override_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  force_is_open BOOLEAN,
  override_open_at TIMESTAMPTZ,
  override_close_at TIMESTAMPTZ,
  notes TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO styling_window_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS style_selection_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  measurement_id UUID REFERENCES measurements(id) ON DELETE SET NULL,
  order_type TEXT NOT NULL DEFAULT 'special_request'
    CHECK (order_type IN ('subscription', 'special_request')),
  category TEXT,
  style_title TEXT NOT NULL,
  style_description TEXT,
  style_image_url TEXT,
  style_payload JSONB DEFAULT '{}'::jsonb,
  source TEXT,
  source_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'cancelled', 'escalated', 'processed')),
  linked_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  escalated_by UUID,
  cancelled_by UUID,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_style_queue_user ON style_selection_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_style_queue_status ON style_selection_queue(status);
CREATE INDEX IF NOT EXISTS idx_style_queue_created ON style_selection_queue(created_at DESC);

DROP TRIGGER IF EXISTS trg_style_queue_updated_at ON style_selection_queue;
CREATE TRIGGER trg_style_queue_updated_at
  BEFORE UPDATE ON style_selection_queue
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_styling_window_config_updated_at ON styling_window_config;
CREATE TRIGGER trg_styling_window_config_updated_at
  BEFORE UPDATE ON styling_window_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();