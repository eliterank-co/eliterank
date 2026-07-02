-- Migration 112: fix "permission denied for table profiles" on anon nominee writes
--
-- Symptom: anonymous self-entry and third-party claim flows failed at submit
-- with `permission denied for table profiles` (e.g. on the bio step's
-- `UPDATE nominees`).
--
-- Cause: migration 103 (anon PII lockdown) revoked anon's SELECT on
-- `profiles.is_super_admin`. Two things on `nominees` still read that column
-- while evaluating RLS for an anonymous writer:
--   1. `is_super_admin()` — used by the `nominees_manage` policy — was a plain
--      (non-DEFINER) SQL function that does `SELECT ... FROM profiles`, so it
--      ran as the anon caller and hit the revoked privilege.
--   2. The legacy inline policies "Super admins can manage all nominees" and
--      "Super admins can view all nominees" embed `EXISTS (SELECT 1 FROM
--      profiles ... is_super_admin)` directly.
--
-- Fix:
--   1. Make `is_super_admin()` SECURITY DEFINER so it can read `profiles` on
--      behalf of any caller. Logic is unchanged — it still only reports whether
--      the *caller's own* row has is_super_admin = true. This is the standard
--      Supabase pattern for RLS helper functions and fixes every policy that
--      uses it (not just nominees). search_path is pinned to public.
--   2. Drop the two redundant inline policies on `nominees`. Super-admin
--      management is already covered by `nominees_manage`
--      (is_competition_host() OR is_super_admin()); viewing is already covered
--      by the permissive read policies (nominees_select / "Anyone can view").

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE PARALLEL SAFE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid()) AND is_super_admin = true
  )
$function$;

DROP POLICY IF EXISTS "Super admins can manage all nominees" ON public.nominees;
DROP POLICY IF EXISTS "Super admins can view all nominees" ON public.nominees;
