-- Add "All Genders 21-39" demographic option
INSERT INTO public.demographics (label, slug, gender, age_min, age_max, active)
VALUES ('All Genders 21-39', 'all-genders-21-39', NULL, 21, 39, TRUE)
ON CONFLICT (slug) DO NOTHING;
