-- Migration 037: Tailor type split — Vicelle vs Style-U
-- vicelle = assigned Vicelle client orders, no access to other client details
-- styleu  = manages their own personal clients independently

ALTER TABLE tailors
  ADD COLUMN IF NOT EXISTS tailor_type TEXT NOT NULL DEFAULT 'vicelle'
    CHECK (tailor_type IN ('vicelle', 'styleu'));
