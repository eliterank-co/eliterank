-- =============================================================================
-- Migration 119: allow 'host_upload' entry type
-- =============================================================================
-- entry_type previously allowed only 'nominations' | 'applications' |
-- 'appointments'. Some hosts run their field without a public nomination
-- period — they upload the roster of contestants themselves during setup.
-- The launch wizard's "How contestants get in" now offers that, so extend the
-- check to accept 'host_upload'.
--
-- NOTE: a host_upload competition has no nomination period. The timeline editor
-- should not require a saved nomination window before voting for these — the
-- roster is provided directly instead. Verify the host roster-upload path is in
-- place before launching such a competition.
-- =============================================================================

DO $$
DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint
  WHERE conrelid = 'competitions'::regclass AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%entry_type%';
  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE competitions DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;

ALTER TABLE competitions
  ADD CONSTRAINT competitions_entry_type_check
  CHECK (entry_type IN ('nominations', 'applications', 'appointments', 'host_upload'));
