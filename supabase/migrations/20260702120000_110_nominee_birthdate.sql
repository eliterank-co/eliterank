-- 110_nominee_birthdate
--
-- Store date of birth. The entry flow now asks for a birthdate (users pick a
-- date, like normal platforms) instead of typing a bare age. Age is still
-- derived and stored for display/eligibility; birthdate is the source record
-- going forward.
--
-- Column-level access:
--   profiles.birthdate is intentionally NOT granted to anon — it inherits the
--   fail-closed posture from migration 103 (only the owner / authenticated
--   role reads it).
--   nominees.birthdate rides the existing (looser) nominee anon exposure that
--   the claim/login funnel relies on. The SECURITY DEFINER RPC hardening
--   tracked in 103's follow-ups (get_nomination_for_claim, etc.) should cover
--   this column when that work lands.

alter table public.nominees add column if not exists birthdate date;
alter table public.profiles add column if not exists birthdate date;
