-- =============================================================================
-- Migration 116: eligibility backfill + "Men 21-45" demographic
-- =============================================================================
-- The `eligibility_gender / eligibility_age_min / eligibility_age_max` columns
-- (migration 089) are the source of truth for the public "Who can enter" recap,
-- the auto-generated rules, and entry eligibility. The super-admin create/edit
-- flow only ever persisted `demographic_id`, so competitions configured there
-- kept NULL eligibility columns and rendered as "All genders" regardless of the
-- selected bucket (e.g. "Most Eligible Bachelors", set to Men 21-39, still
-- showed "All genders").
--
-- This migration (a) adds a Men 21-45 bucket, (b) backfills eligibility from the
-- demographic bucket wherever it drifted, and (c) widens "Most Eligible
-- Bachelors" to men 21-45 per the host's request. The matching code fix keeps
-- the admin create/edit flow in sync going forward.
-- =============================================================================

-- 1. New demographic bucket: Men 21-45.
INSERT INTO demographics (label, slug, gender, age_min, age_max, active)
VALUES ('Men 21-45', 'men-21-45', 'male', 21, 45, TRUE)
ON CONFLICT (slug) DO NOTHING;

-- 2. Backfill: competitions that have a demographic bucket but no explicit
--    eligibility (the drift) inherit gender + age range from the bucket.
--    A NULL bucket gender ("Open (All)") maps to 'all'.
UPDATE competitions c
SET eligibility_gender  = COALESCE(d.gender, 'all'),
    eligibility_age_min = d.age_min,
    eligibility_age_max = d.age_max
FROM demographics d
WHERE c.demographic_id = d.id
  AND c.eligibility_gender IS NULL;

-- 3. "Most Eligible Bachelors": men, ages 21-45 (widened from 21-39). Point the
--    bucket at the new Men 21-45 row and set the source-of-truth columns
--    explicitly so the recap, public rules, and entry gate all agree.
UPDATE competitions
SET demographic_id      = (SELECT id FROM demographics WHERE slug = 'men-21-45'),
    eligibility_gender  = 'male',
    eligibility_age_min = 21,
    eligibility_age_max = 45
WHERE name ILIKE '%Most Eligible Bachelors%';
