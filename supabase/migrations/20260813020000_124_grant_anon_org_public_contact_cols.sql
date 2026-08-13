-- 124_grant_anon_org_public_contact_cols
--
-- BUGFIX: logged-out visitors got "Competition Not Found" on every competition
-- page. The public competition fetch selects ORG_PUBLIC_COLS
-- (src/constants/safeColumns.js), which was extended to include the host's
-- public contact-disclosure columns:
--     legal_entity_name, contact_email, legal_address
-- These are shown on the auto-generated Official Rules / Contest Terms as the
-- legally-required host contact + registered-address disclosure (Canadian
-- contests especially), so they are intentionally PUBLIC.
--
-- However the matching column-level GRANT to `anon` was never added:
--   * migration 103 (restrict_anon_pii_columns) set up column-level SELECT
--     grants for anon and intentionally EXCLUDED legal_entity_name (it was
--     sensitive at the time);
--   * migration 121 ADDED contact_email + legal_address columns but did not
--     grant them to anon.
-- Result: an anon SELECT of these three columns fails with
--   42501 "permission denied for table organizations"  (HTTP 401),
-- which the front-end surfaces as "Something went wrong loading this
-- competition." Logged-in (authenticated) users were unaffected because the
-- `authenticated` role already has SELECT on all three.
--
-- This closes the front-end/DB drift exactly as migration 103's comment
-- prescribes: "add new SAFE display columns to the GRANTs ... when you add
-- them." `authenticated` and `service_role` are untouched (they already read
-- these). Idempotent: re-granting an existing privilege is a no-op.

begin;

grant select (
  legal_entity_name,
  contact_email,
  legal_address
) on public.organizations to anon;

commit;
