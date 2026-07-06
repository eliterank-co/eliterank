-- Migration 111: token-scoped "does this nominee already have an account?" check
--
-- Powers the "Welcome back" greet on the third-party claim flow: when a nominee
-- opens their invite link and their email already owns an EliteRank account,
-- the flow offers log-in (which pre-fills their card from their profile and
-- skips the create-password step) instead of forcing a second account.
--
-- The previous client-side check probed `profiles` by email as the anon key,
-- which is now (a) blocked by the anon PII lockdown (migration 103) and (b) an
-- email-enumeration oracle (anyone could ask "does <x> have an account?"). This
-- RPC answers only for the specific invite token the caller already holds (a
-- uuid from their link) and returns a bare boolean — no email is exposed and
-- arbitrary emails can't be probed. Mirrors the existing get_judge_invite
-- token-scoped pattern.

CREATE OR REPLACE FUNCTION public.nominee_invite_has_account(p_token uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.nominees n
    JOIN public.profiles p ON lower(p.email) = lower(n.email)
    WHERE n.invite_token = p_token
      AND n.email IS NOT NULL
  );
$$;

-- Definer function: don't leave EXECUTE open to PUBLIC (matches the
-- harden_definer_fns convention); grant only the roles that call it.
REVOKE ALL ON FUNCTION public.nominee_invite_has_account(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.nominee_invite_has_account(uuid) TO anon, authenticated;
