-- =============================================================================
-- 121_org_contact_email_and_address.sql
--
-- Adds organizer contact fields so the auto-generated Official Rules can name a
-- real contact for the Host. Previously the Contact section said the Host "can
-- be reached through the competition page" — but there is no on-platform message
-- channel, so that was inaccurate. These fields let the rules state the Host's
-- email and registered business address (which also satisfies the "request the
-- Official Rules / winners list" mechanism a contest is expected to provide).
--
-- Both columns are surfaced in ORG_PUBLIC_COLS (src/constants/safeColumns.js)
-- because they are meant to appear publicly in the Official Rules, alongside the
-- already-public legal_entity_name (organizer identity).
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS legal_address text;

COMMENT ON COLUMN organizations.contact_email IS
  'Public organizer contact email shown in the Official Rules Contact section.';
COMMENT ON COLUMN organizations.legal_address IS
  'Public organizer registered business address shown in the Official Rules Contact section.';
