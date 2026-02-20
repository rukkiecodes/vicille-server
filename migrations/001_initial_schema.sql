-- ============================================================
-- Vicelle — Full Supabase PostgreSQL Schema
-- Run this in your Supabase SQL editor (or via psql)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
-- SHARED TRIGGER: auto-update updated_at
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- 1. USERS (clients)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name                 TEXT NOT NULL,
  email                     TEXT UNIQUE NOT NULL,
  phone                     TEXT,
  -- Auth: 6-digit passcode (hashed), open-ended (no expiry)
  activation_code           TEXT,
  is_activated              BOOLEAN NOT NULL DEFAULT FALSE,
  activated_at              TIMESTAMPTZ,
  status                    TEXT NOT NULL DEFAULT 'inactive'
                            CHECK (status IN ('inactive','active','suspended','deleted')),
  -- Onboarding
  is_onboarded              BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step           INT DEFAULT 0,
  -- Profile
  date_of_birth             DATE,
  height                    NUMERIC,
  height_source             TEXT CHECK (height_source IN ('ai','user_entry','vicelle_staff')),
  gender                    TEXT,
  profile_photo_url         TEXT,
  -- Tracking
  birthday_package_eligible BOOLEAN DEFAULT FALSE,
  last_login_at             TIMESTAMPTZ,
  failed_login_attempts     INT DEFAULT 0,
  -- Audit
  created_by_admin_id       UUID,
  is_deleted                BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email   ON users(email);
CREATE INDEX idx_users_status  ON users(status);

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 2. USER PREFERENCES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clothing_styles TEXT[] DEFAULT '{}',
  colors          TEXT[] DEFAULT '{}',
  fabrics         TEXT[] DEFAULT '{}',
  lifestyle       JSONB  DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TRIGGER trg_user_prefs_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 3. USER DELIVERY DETAILS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_delivery_details (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  address          TEXT,
  phone            TEXT,
  landmark         TEXT,
  nearest_bus_stop TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE TRIGGER trg_delivery_updated_at
  BEFORE UPDATE ON user_delivery_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 4. USER PAYMENT METHODS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_payment_methods (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                        TEXT NOT NULL CHECK (type IN ('card','standing_order')),
  card_last4                  TEXT,
  card_brand                  TEXT,
  paystack_authorization_code TEXT,
  bank_name                   TEXT,
  account_number              TEXT,
  account_name                TEXT,
  is_default                  BOOLEAN DEFAULT FALSE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_methods_user ON user_payment_methods(user_id);

-- ─────────────────────────────────────────────────────────────
-- 5. TAILORS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE tailors (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name                 TEXT NOT NULL,
  email                     TEXT UNIQUE NOT NULL,
  password_hash             TEXT NOT NULL,
  phone                     TEXT,
  status                    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending','verified','active','suspended','terminated')),
  specialties               TEXT[] DEFAULT '{}',
  preferred_payment_method  TEXT,
  bank_name                 TEXT,
  account_number            TEXT,
  account_name              TEXT,
  kyc_docs                  TEXT[] DEFAULT '{}',
  profile_photo_url         TEXT,
  -- Capacity
  capacity_per_day          INT DEFAULT 2,
  capacity_per_week         INT DEFAULT 10,
  capacity_per_month        INT DEFAULT 40,
  -- Penalty state
  is_capacity_reduced       BOOLEAN DEFAULT FALSE,
  capacity_reduced_until    TIMESTAMPTZ,
  capacity_reduction_reason TEXT,
  -- Performance
  total_jobs_completed      INT DEFAULT 0,
  total_jobs_assigned       INT DEFAULT 0,
  missed_deadlines          INT DEFAULT 0,
  consecutive_miss_count    INT DEFAULT 0,
  consecutive_on_time_count INT DEFAULT 0,
  on_time_delivery_rate     NUMERIC DEFAULT 100,
  average_rating            NUMERIC DEFAULT 0,
  -- Probation (starts on probation; lifted after N successful jobs)
  is_on_probation           BOOLEAN DEFAULT TRUE,
  probation_jobs_completed  INT DEFAULT 0,
  advance_eligible          BOOLEAN DEFAULT FALSE,
  -- Auth
  last_login_at             TIMESTAMPTZ,
  reset_token               TEXT,
  reset_token_expires_at    TIMESTAMPTZ,
  -- Audit
  is_deleted                BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at                TIMESTAMPTZ,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tailors_email  ON tailors(email);
CREATE INDEX idx_tailors_status ON tailors(status);

CREATE TRIGGER trg_tailors_updated_at
  BEFORE UPDATE ON tailors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 6. ADMINS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE admins (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  phone           TEXT,
  role            TEXT NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('admin','super_admin','qc','warehouse','finance')),
  profile_photo_url TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_by      UUID,
  last_login_at   TIMESTAMPTZ,
  is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_admins_updated_at
  BEFORE UPDATE ON admins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 7. SUBSCRIPTION PLANS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE subscription_plans (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                         TEXT NOT NULL,
  description                  TEXT,
  price                        NUMERIC NOT NULL DEFAULT 0,
  billing_cycle                TEXT NOT NULL DEFAULT 'monthly'
                               CHECK (billing_cycle IN ('monthly','quarterly','annual')),
  max_garments_per_cycle       INT DEFAULT 0,
  includes_measurement_service BOOLEAN DEFAULT FALSE,
  features                     JSONB DEFAULT '[]',
  is_active                    BOOLEAN DEFAULT TRUE,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 8. USER SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE user_subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id),
  plan_id               UUID NOT NULL REFERENCES subscription_plans(id),
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','paused','cancelled','expired','payment_failed')),
  billing_type          TEXT NOT NULL CHECK (billing_type IN ('installment','full','recurring')),
  current_cycle_start   TIMESTAMPTZ,
  current_cycle_end     TIMESTAMPTZ,
  next_billing_date     TIMESTAMPTZ,
  total_paid            NUMERIC DEFAULT 0,
  outstanding_balance   NUMERIC DEFAULT 0,
  payment_failure_count INT DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user   ON user_subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON user_subscriptions(status);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 9. STYLING WINDOWS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE styling_windows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES user_subscriptions(id),
  opens_at        TIMESTAMPTZ NOT NULL,
  closes_at       TIMESTAMPTZ NOT NULL,
  is_locked       BOOLEAN DEFAULT FALSE,
  locked_at       TIMESTAMPTZ,
  locked_by_id    UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_styling_windows_sub ON styling_windows(subscription_id);

-- ─────────────────────────────────────────────────────────────
-- 10. ORDERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE orders (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number             TEXT UNIQUE NOT NULL,
  client_tag               TEXT UNIQUE NOT NULL,
  user_id                  UUID NOT NULL REFERENCES users(id),
  subscription_id          UUID REFERENCES user_subscriptions(id),
  styling_window_id        UUID REFERENCES styling_windows(id),
  order_type               TEXT NOT NULL DEFAULT 'subscription'
                           CHECK (order_type IN ('subscription','special_request')),
  status                   TEXT NOT NULL DEFAULT 'styling_in_progress'
                           CHECK (status IN (
                             'styling_in_progress',
                             'production_in_progress',
                             'package_ready_payment_required',
                             'package_ready_delivery_in_progress',
                             'delivered',
                             'cancelled'
                           )),
  -- Styling window flag
  styling_window_open      BOOLEAN DEFAULT TRUE,
  styling_window_locked_at TIMESTAMPTZ,
  -- Production
  production_started_at    TIMESTAMPTZ,
  production_started_by    UUID,
  -- Delivery
  estimated_delivery_date  TIMESTAMPTZ,
  delivery_method          TEXT DEFAULT 'standard',
  tracking_number          TEXT,
  dispatched_at            TIMESTAMPTZ,
  delivered_at             TIMESTAMPTZ,
  delivered_by             UUID,
  delivery_proof_url       TEXT,
  -- Financials
  total_amount             NUMERIC DEFAULT 0,
  amount_paid              NUMERIC DEFAULT 0,
  outstanding_balance      NUMERIC DEFAULT 0,
  payment_status           TEXT DEFAULT 'pending',
  -- Cancellation
  cancelled_at             TIMESTAMPTZ,
  cancellation_reason      TEXT,
  cancelled_by             UUID,
  -- Notes
  notes                    TEXT,
  internal_notes           TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_user   ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_tag    ON orders(client_tag);

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 11. ORDER STATUS HISTORY
-- ─────────────────────────────────────────────────────────────
CREATE TABLE order_status_history (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status      TEXT,
  to_status        TEXT NOT NULL,
  changed_by_id    UUID NOT NULL,
  changed_by_role  TEXT NOT NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_history_order ON order_status_history(order_id);

-- ─────────────────────────────────────────────────────────────
-- 12. COLLECTIONS & COLLECTION ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE collections (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  season      TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE collection_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES collections(id),
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT,
  style_tags    TEXT[] DEFAULT '{}',
  image_urls    TEXT[] DEFAULT '{}',
  is_available  BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_collection_items ON collection_items(collection_id);

-- ─────────────────────────────────────────────────────────────
-- 13. ORDER ITEMS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE order_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  collection_item_id UUID REFERENCES collection_items(id),
  style_name         TEXT NOT NULL,
  description        TEXT,
  fabric             TEXT,
  color              TEXT,
  quantity           INT DEFAULT 1,
  customizations     JSONB DEFAULT '{}',
  status             TEXT DEFAULT 'pending',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ─────────────────────────────────────────────────────────────
-- 14. MEASUREMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE measurements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL REFERENCES users(id),
  order_id               UUID REFERENCES orders(id),
  captured_by            TEXT NOT NULL CHECK (captured_by IN ('user','tailor','vicelle_staff')),
  captured_by_id         UUID,
  -- Body (cm)
  neck                   NUMERIC,
  chest                  NUMERIC,
  waist                  NUMERIC,
  hips                   NUMERIC,
  shoulder_width         NUMERIC,
  sleeve_length          NUMERIC,
  inseam                 NUMERIC,
  thigh                  NUMERIC,
  calf                   NUMERIC,
  wrist                  NUMERIC,
  back_length            NUMERIC,
  weight                 NUMERIC,
  notes                  TEXT,
  -- Queued for next cycle when production is in progress
  pending_for_next_cycle BOOLEAN DEFAULT FALSE,
  is_active              BOOLEAN DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_measurements_user ON measurements(user_id);

CREATE TRIGGER trg_measurements_updated_at
  BEFORE UPDATE ON measurements
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 15. INVENTORY (Materials)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE inventory (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  category            TEXT,
  description         TEXT,
  quantity            NUMERIC NOT NULL DEFAULT 0,
  unit                TEXT DEFAULT 'meters',
  low_stock_threshold NUMERIC DEFAULT 5,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_inventory_updated_at
  BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE inventory_issuances (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_id       UUID NOT NULL REFERENCES inventory(id),
  job_id             UUID,
  order_id           UUID REFERENCES orders(id),
  client_tag         TEXT,
  quantity_issued    NUMERIC NOT NULL,
  issued_by_id       UUID NOT NULL,
  acknowledged_at    TIMESTAMPTZ,
  acknowledged_by_id UUID,
  returned_quantity  NUMERIC DEFAULT 0,
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issuances_inventory ON inventory_issuances(inventory_id);

-- ─────────────────────────────────────────────────────────────
-- 16. JOBS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_number           TEXT UNIQUE NOT NULL,
  order_id             UUID NOT NULL REFERENCES orders(id),
  order_item_id        UUID REFERENCES order_items(id),
  tailor_id            UUID REFERENCES tailors(id),
  status               TEXT NOT NULL DEFAULT 'unassigned'
                       CHECK (status IN (
                         'unassigned','assigned','materials_pending',
                         'materials_received','in_progress','completed',
                         'qc_rejected','qc_approved','reassigned'
                       )),
  assigned_at          TIMESTAMPTZ,
  assigned_by_id       UUID,
  due_date             TIMESTAMPTZ,
  materials_received_at TIMESTAMPTZ,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  proof_photo_url      TEXT,
  tailor_notes         TEXT,
  -- QC
  qc_status            TEXT CHECK (qc_status IN ('pending','approved','rejected')),
  qc_reviewed_at       TIMESTAMPTZ,
  qc_reviewed_by_id    UUID,
  qc_notes             TEXT,
  -- Reassignment
  previous_tailor_id   UUID REFERENCES tailors(id),
  reassignment_reason  TEXT,
  -- Commission
  commission_amount    NUMERIC DEFAULT 0,
  commission_paid      BOOLEAN DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_order  ON jobs(order_id);
CREATE INDEX idx_jobs_tailor ON jobs(tailor_id);
CREATE INDEX idx_jobs_status ON jobs(status);

CREATE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- FK on inventory_issuances.job_id (deferred to avoid ordering issue)
ALTER TABLE inventory_issuances
  ADD CONSTRAINT fk_issuances_job FOREIGN KEY (job_id) REFERENCES jobs(id);

-- ─────────────────────────────────────────────────────────────
-- 17. PAYMENTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id),
  subscription_id    UUID REFERENCES user_subscriptions(id),
  order_id           UUID REFERENCES orders(id),
  special_request_id UUID,
  amount             NUMERIC NOT NULL,
  currency           TEXT DEFAULT 'NGN',
  type               TEXT NOT NULL CHECK (type IN (
                       'subscription','special_request_deposit',
                       'final_payment','accessory','refund'
                     )),
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','completed','failed','refunded')),
  paystack_reference TEXT UNIQUE,
  paystack_data      JSONB DEFAULT '{}',
  payment_method_id  UUID REFERENCES user_payment_methods(id),
  failure_reason     TEXT,
  retry_count        INT DEFAULT 0,
  next_retry_at      TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payments_user   ON payments(user_id);
CREATE INDEX idx_payments_status ON payments(status);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE payment_attempts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id     UUID NOT NULL REFERENCES payments(id),
  attempt_number INT NOT NULL,
  method_type    TEXT CHECK (method_type IN ('card','standing_order')),
  status         TEXT NOT NULL CHECK (status IN ('success','failed')),
  failure_reason TEXT,
  attempted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_attempts ON payment_attempts(payment_id);

-- ─────────────────────────────────────────────────────────────
-- 18. SPECIAL REQUESTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE special_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number     TEXT UNIQUE NOT NULL,
  user_id            UUID NOT NULL REFERENCES users(id),
  collection_item_id UUID REFERENCES collection_items(id),
  inspiration_images TEXT[] DEFAULT '{}',
  inspiration_link   TEXT,
  event_occasion     TEXT,
  urgency            TEXT NOT NULL DEFAULT 'standard'
                     CHECK (urgency IN ('standard','express','urgent')),
  description        TEXT,
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','quoted','deposit_paid','in_production','completed','cancelled')),
  material_cost      NUMERIC DEFAULT 0,
  urgency_surcharge  NUMERIC DEFAULT 0,
  delivery_fee       NUMERIC DEFAULT 0,
  service_fee        NUMERIC DEFAULT 0,
  total_quote        NUMERIC DEFAULT 0,
  deposit_amount     NUMERIC DEFAULT 0,
  deposit_paid_at    TIMESTAMPTZ,
  admin_notes        TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_special_requests_updated_at
  BEFORE UPDATE ON special_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- 19. ACCESSORIES
-- ─────────────────────────────────────────────────────────────
CREATE TABLE accessories (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  category     TEXT,
  description  TEXT,
  price        NUMERIC NOT NULL DEFAULT 0,
  image_url    TEXT,
  is_available BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accessory_orders (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  order_id     UUID NOT NULL REFERENCES orders(id),
  accessory_id UUID NOT NULL REFERENCES accessories(id),
  quantity     INT DEFAULT 1,
  price        NUMERIC NOT NULL,
  status       TEXT DEFAULT 'pending'
               CHECK (status IN ('pending','confirmed','cancelled','delivered')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_accessory_orders ON accessory_orders(order_id);

-- ─────────────────────────────────────────────────────────────
-- 20. STYLES (manual uploads + web search imports)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE styles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  category       TEXT,
  description    TEXT,
  tags           TEXT[] DEFAULT '{}',
  image_urls     TEXT[] DEFAULT '{}',
  source         TEXT NOT NULL CHECK (source IN ('manual','web_search')),
  search_keyword TEXT,
  external_url   TEXT,
  uploaded_by_id UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_styles_tags     ON styles USING gin(tags);
CREATE INDEX idx_styles_category ON styles(category);

-- ─────────────────────────────────────────────────────────────
-- 21. NOTIFICATIONS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id),
  tailor_id  UUID REFERENCES tailors(id),
  admin_id   UUID REFERENCES admins(id),
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  type       TEXT NOT NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  data       JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifs_user   ON notifications(user_id);
CREATE INDEX idx_notifs_tailor ON notifications(tailor_id);

-- ─────────────────────────────────────────────────────────────
-- 22. RATINGS (internal — not visible to tailors)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE ratings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id),
  tailor_id   UUID NOT NULL REFERENCES tailors(id),
  rated_by_id UUID NOT NULL,
  score       INT NOT NULL CHECK (score BETWEEN 1 AND 5),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 23. PAYOUTS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE payouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_number  TEXT UNIQUE NOT NULL,
  tailor_id      UUID NOT NULL REFERENCES tailors(id),
  period_start   TIMESTAMPTZ NOT NULL,
  period_end     TIMESTAMPTZ NOT NULL,
  total_amount   NUMERIC NOT NULL DEFAULT 0,
  job_count      INT DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','paid','failed')),
  bank_name      TEXT,
  account_number TEXT,
  account_name   TEXT,
  paid_at        TIMESTAMPTZ,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payouts_tailor ON payouts(tailor_id);

CREATE TABLE payout_jobs (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES payouts(id),
  job_id    UUID NOT NULL REFERENCES jobs(id),
  amount    NUMERIC NOT NULL
);

-- ─────────────────────────────────────────────────────────────
-- 24. QUALITY CONTROL
-- ─────────────────────────────────────────────────────────────
CREATE TABLE qc_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES jobs(id),
  reviewed_by_id  UUID NOT NULL,
  decision        TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  notes           TEXT,
  rejection_reason TEXT,
  reviewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qc_reviews_job ON qc_reviews(job_id);

-- ─────────────────────────────────────────────────────────────
-- 25. AUDIT LOGS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type       TEXT NOT NULL,
  entity_id         UUID,
  action            TEXT NOT NULL,
  performed_by_id   UUID,
  performed_by_role TEXT,
  before_data       JSONB,
  after_data        JSONB,
  ip_address        TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity    ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_performer ON audit_logs(performed_by_id);

-- ─────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY (defense in depth)
-- Server uses service-role equivalent (pg pool with full access).
-- RLS still applies for any direct Supabase JS client usage.
-- ─────────────────────────────────────────────────────────────
ALTER TABLE users                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE tailors               ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins                ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;

-- Service-role bypass policies (server-side has full access)
CREATE POLICY "service_role_all_users"         ON users         USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_tailors"       ON tailors       USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_admins"        ON admins        USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_orders"        ON orders        USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_payments"      ON payments      USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_notifications" ON notifications USING (true) WITH CHECK (true);
