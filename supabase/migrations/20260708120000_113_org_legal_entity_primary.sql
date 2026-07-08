-- =============================================================================
-- Migration 113: legal entity name is the entered/primary org field
-- =============================================================================
-- An organization now carries two names with distinct roles:
--   • legal_entity_name — the registered legal entity the host enters at
--     creation (e.g. "Creator Social LLC"). Shown as the organizer on a
--     competition's Official Rules.
--   • name (brand)      — the public-facing display name / DBA. Auto-populates
--     from the legal entity name at creation; the host can later change it to a
--     DBA in the branding editor. Drives the public "Presented by" brand and the
--     super-admin announcement author.
--
-- Recipient-facing email/push already send from the COMPETITION name, so neither
-- org name appears as the email sender.
--
-- Two changes:
--   1. Backfill legal_entity_name from name for existing orgs that never set it,
--      so the legal field is populated under the new model.
--   2. create_host_organization records the entered name as BOTH the legal
--      entity name and the initial brand name.
-- =============================================================================

-- 1. Backfill: existing orgs adopt their current name as the legal entity name.
--    Brand name (organizations.name) is left untouched — hosts can change it to
--    a DBA afterwards.
UPDATE organizations
  SET legal_entity_name = name
  WHERE legal_entity_name IS NULL OR length(trim(legal_entity_name)) = 0;

-- 2. Capture the entered value as the legal entity name at creation. The brand
--    name defaults to the same value; the host edits it later if they use a DBA.
--    Signature is unchanged from migration 092 (CREATE OR REPLACE, no DROP).
CREATE OR REPLACE FUNCTION create_host_organization(
  p_name TEXT,
  p_slug TEXT,
  p_type TEXT DEFAULT 'organization',
  p_logo_url TEXT DEFAULT NULL,
  p_website_url TEXT DEFAULT NULL,
  p_instagram TEXT DEFAULT NULL
)
RETURNS organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_org organizations;
  v_type TEXT := NULLIF(p_type, '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0
     OR p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RAISE EXCEPTION 'name and slug are required';
  END IF;
  IF v_type IS NOT NULL AND v_type NOT IN ('individual', 'company', 'non_profit', 'agency') THEN
    v_type := NULL;
  END IF;

  INSERT INTO organizations (name, slug, owner_id, org_type, logo_url, website_url, instagram, legal_entity_name)
  VALUES (
    trim(p_name), p_slug, v_uid, v_type,
    NULLIF(trim(coalesce(p_logo_url, '')), ''),
    NULLIF(trim(coalesce(p_website_url, '')), ''),
    NULLIF(trim(coalesce(p_instagram, '')), ''),
    trim(p_name)
  )
  RETURNING * INTO v_org;

  UPDATE profiles SET is_host = true WHERE id = v_uid;

  RETURN v_org;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'An organization with that name already exists. Try a different name.';
END;
$$;

GRANT EXECUTE ON FUNCTION create_host_organization(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
