-- Migration 036: split itemsPerCycle into fitsPerCycle + itemsPerFit per plan
-- fitsPerCycle  = number of complete outfits a subscriber gets per billing cycle
-- itemsPerFit   = number of individual garment pieces that make up one outfit

UPDATE subscription_plans
SET features = features
  || jsonb_build_object('fitsPerCycle', 1,  'itemsPerFit', 2)
WHERE slug = 'the-starter-package';

UPDATE subscription_plans
SET features = features
  || jsonb_build_object('fitsPerCycle', 3,  'itemsPerFit', 3)
WHERE slug = 'the-exclusive-starter-package';

UPDATE subscription_plans
SET features = features
  || jsonb_build_object('fitsPerCycle', 4,  'itemsPerFit', 3)
WHERE slug = 'the-elevated-package';

UPDATE subscription_plans
SET features = features
  || jsonb_build_object('fitsPerCycle', 6,  'itemsPerFit', 4)
WHERE slug = 'the-luxe-package';

UPDATE subscription_plans
SET features = features
  || jsonb_build_object('fitsPerCycle', 10, 'itemsPerFit', 4)
WHERE slug = 'the-prestige-package';

UPDATE subscription_plans
SET features = features
  || jsonb_build_object('fitsPerCycle', 17, 'itemsPerFit', 5)
WHERE slug = 'the-executive-package';

UPDATE subscription_plans
SET features = features
  || jsonb_build_object('fitsPerCycle', 20, 'itemsPerFit', 5)
WHERE slug = 'the-elite-package';

-- Fallback: any plan not matched above gets sane defaults
UPDATE subscription_plans
SET features = features
  || jsonb_build_object('fitsPerCycle', COALESCE((features->>'itemsPerCycle')::int, 1), 'itemsPerFit', 2)
WHERE features->>'fitsPerCycle' IS NULL;
