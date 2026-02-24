-- ============================================================
-- 003 — Subscription Plans: schema update + seed data
-- Adds missing columns (slug, pricing, styling_window,
-- display_order) that the SubscriptionPlanModel relies on,
-- then seeds the 8 Vicelle subscription plans.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Add missing columns
-- ─────────────────────────────────────────────────────────────
ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS slug           TEXT,
  ADD COLUMN IF NOT EXISTS pricing        JSONB,
  ADD COLUMN IF NOT EXISTS styling_window JSONB DEFAULT '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
  ADD COLUMN IF NOT EXISTS display_order  INT  NOT NULL DEFAULT 0;

-- Unique index on slug (partial — allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_plans_slug
  ON subscription_plans(slug) WHERE slug IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- 2. Seed the 8 plans
--    (ON CONFLICT on slug so re-running is safe)
-- ─────────────────────────────────────────────────────────────
INSERT INTO subscription_plans
  (name, slug, description, pricing, features, styling_window, is_active, display_order)
VALUES

  -- 1. The Starter Package
  (
    'The Starter Package',
    'starter-package',
    'Bronze Membership — 1 fitting for all styles, 2 fittings for casual styles.',
    '{"amount":35000,"currency":"NGN","billingCycle":"monthly"}'::jsonb,
    '{
      "itemsPerCycle": 1,
      "fabricOptions": [
        "Simple & modest styles for Men and Women",
        "Good material quality, custom fitted",
        "1 fitting (2 fittings for casual styles)",
        "Free Birthday Outfit after 8 months",
        "Delivery 2 weeks after full payment"
      ],
      "styleConsultation": false,
      "prioritySupport": false,
      "freeAlterations": true,
      "accessoryDiscount": 0
    }'::jsonb,
    '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
    TRUE,
    1
  ),

  -- 2. The Exclusive Starter
  (
    'The Exclusive Starter',
    'exclusive-starter',
    'Bronze Membership — 3 exclusive fittings per cycle.',
    '{"amount":70000,"currency":"NGN","billingCycle":"monthly"}'::jsonb,
    '{
      "itemsPerCycle": 3,
      "fabricOptions": [
        "Exclusive styles for Men and Women",
        "Higher-quality materials, custom fitted",
        "3 exclusive fittings",
        "Access to exclusive & streetwear collections",
        "Free Birthday Outfit after 8 months",
        "Flexible 1-month payment plan available"
      ],
      "styleConsultation": false,
      "prioritySupport": false,
      "freeAlterations": true,
      "accessoryDiscount": 0
    }'::jsonb,
    '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
    TRUE,
    2
  ),

  -- 3. Elevated Style
  (
    'Elevated Style',
    'elevated-style',
    'Silver Membership — 4 exclusive fittings, access to 3 collections.',
    '{"amount":120000,"currency":"NGN","billingCycle":"monthly"}'::jsonb,
    '{
      "itemsPerCycle": 4,
      "fabricOptions": [
        "Exclusive styles for Men and Women",
        "Access to 3 exclusive collections",
        "4 exclusive fittings, custom fitted",
        "Free Birthday Outfit after 6 months",
        "Flexible 1–2 month payment plan"
      ],
      "styleConsultation": true,
      "prioritySupport": false,
      "freeAlterations": true,
      "accessoryDiscount": 5
    }'::jsonb,
    '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
    TRUE,
    3
  ),

  -- 4. Luxe Wardrobe Refresh
  (
    'Luxe Wardrobe Refresh',
    'luxe-wardrobe-refresh',
    'Silver Membership — 6 exclusive fittings, priority consultation, premium packaging.',
    '{"amount":200000,"currency":"NGN","billingCycle":"monthly"}'::jsonb,
    '{
      "itemsPerCycle": 6,
      "fabricOptions": [
        "Exclusive styles for Men and Women",
        "Access to 4 exclusive collections",
        "6 exclusive fittings, custom-tailored fit",
        "Priority styling consultation",
        "Delivered in premium packaging",
        "Free Birthday Outfit after 6 months",
        "Optional styling tips included"
      ],
      "styleConsultation": true,
      "prioritySupport": true,
      "freeAlterations": true,
      "accessoryDiscount": 10
    }'::jsonb,
    '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
    TRUE,
    4
  ),

  -- 5. STYLE-U Prestige Wardrobe
  (
    'STYLE-U Prestige Wardrobe',
    'styleu-prestige',
    'Gold Membership — 10 exclusive fittings, personalized or Vicelle-designed wardrobe.',
    '{"amount":400000,"currency":"NGN","billingCycle":"monthly"}'::jsonb,
    '{
      "itemsPerCycle": 10,
      "fabricOptions": [
        "Personalized style or full Vicelle-designed wardrobe",
        "Access to select exclusive collections",
        "10 exclusive fittings",
        "Delivered in luxury packaging",
        "Flexible payment options",
        "Free Birthday Masterpiece after 4 months",
        "Styling guidance for mix-and-match outfits"
      ],
      "styleConsultation": true,
      "prioritySupport": true,
      "freeAlterations": true,
      "accessoryDiscount": 15
    }'::jsonb,
    '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
    TRUE,
    5
  ),

  -- 6. STYLE-U Executive Wardrobe
  (
    'STYLE-U Executive Wardrobe',
    'styleu-executive',
    'Gold Membership — 17 exclusive fittings, luxury packaging, flexible payments.',
    '{"amount":850000,"currency":"NGN","billingCycle":"monthly"}'::jsonb,
    '{
      "itemsPerCycle": 17,
      "fabricOptions": [
        "Personalized style or full Vicelle-designed wardrobe",
        "Access to select exclusive collections",
        "17 exclusive fittings",
        "Delivered in luxury packaging",
        "Flexible payment options",
        "Free Birthday Masterpiece after 4 months",
        "Styling guidance for mix-and-match outfits"
      ],
      "styleConsultation": true,
      "prioritySupport": true,
      "freeAlterations": true,
      "accessoryDiscount": 20
    }'::jsonb,
    '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
    TRUE,
    6
  ),

  -- 7. STYLE-U Elite Wardrobe
  (
    'STYLE-U Elite Wardrobe',
    'styleu-elite',
    'Gold Membership — Complete custom exclusive wardrobe with personal styling session.',
    '{"amount":1500000,"currency":"NGN","billingCycle":"monthly"}'::jsonb,
    '{
      "itemsPerCycle": 0,
      "fabricOptions": [
        "Personal styling session to design your unique collection",
        "Access to all exclusive collections",
        "Bi-monthly measurement updates for perfect fit",
        "Premium packaging with styling guide",
        "Limited-edition pieces exclusive to you",
        "Free Birthday Masterpiece after 4 months",
        "Flexible payment plans available"
      ],
      "styleConsultation": true,
      "prioritySupport": true,
      "freeAlterations": true,
      "accessoryDiscount": 25
    }'::jsonb,
    '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
    TRUE,
    7
  ),

  -- 8. Custom Package
  (
    'Custom Package',
    'custom-package',
    'Gold Membership — Fully personalized collection. Price determined by customization.',
    '{"amount":0,"currency":"NGN","billingCycle":"monthly"}'::jsonb,
    '{
      "itemsPerCycle": 0,
      "fabricOptions": [
        "Fully personalized pieces exclusive to you",
        "Option to monetize your collection",
        "Access to premium fabrics & limited materials",
        "Limited-edition pieces unavailable elsewhere",
        "Styling consultation calls or digital guides",
        "Priority delivery",
        "Free Birthday Masterpiece after 4 months",
        "Collection grows over time"
      ],
      "styleConsultation": true,
      "prioritySupport": true,
      "freeAlterations": true,
      "accessoryDiscount": 25
    }'::jsonb,
    '{"daysBeforeProduction":7,"reminderDays":[7,3,1]}'::jsonb,
    TRUE,
    8
  )

ON CONFLICT (slug) DO NOTHING;
