-- The 3x vote-boost wave (20260902120001) revoked PUBLIC EXECUTE on the vote
-- multiplier helpers and granted only anon/authenticated/service_role. The
-- Supabase Management API read-only channel runs as supabase_read_only_user,
-- which is not an app role, so read-only verification queries could no longer
-- evaluate the multiplier. Grant that role the same read access a browser has.
-- Idempotent; skipped on databases without the role (local/CI stacks).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_read_only_user') THEN
    GRANT USAGE ON SCHEMA app_private TO supabase_read_only_user;
    GRANT EXECUTE ON FUNCTION app_private.effective_vote_multiplier(uuid, timestamptz)
      TO supabase_read_only_user;
    GRANT EXECUTE ON FUNCTION public.effective_vote_multiplier(uuid)
      TO supabase_read_only_user;
    GRANT EXECUTE ON FUNCTION public.is_double_vote_day(uuid)
      TO supabase_read_only_user;
  END IF;
END
$$;
