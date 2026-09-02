-- Vote/payment authority. Depends on the scheduling foundation immediately
-- before this migration; host scheduling UI and activation are separate work.

-- `votes.vote_count` stores the credited total. The existing checkout limit
-- remains 1,000 raw votes and historical captured intents may carry up to a
-- 10x immutable multiplier, so 10,000 is the exact compatible upper bound.
ALTER TABLE public.votes DROP CONSTRAINT IF EXISTS chk_vote_count_range;
ALTER TABLE public.votes ADD CONSTRAINT chk_vote_count_range
  CHECK (vote_count BETWEEN 1 AND 10000);

CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.effective_vote_multiplier(
  p_competition_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT greatest(
    -- Compatibility double-days. These are LIVE IN PRODUCTION today and carry
    -- real rows. Before this migration nothing gated them, so putting the
    -- default-off switch in front of them would mean that merely APPLYING this
    -- migration stops crediting 2x on a real double-vote day for real paying
    -- voters. A rollback seam for new work must not switch off shipped work, so
    -- this half stays ungated and applying the migration is behaviour-preserving.
    CASE WHEN EXISTS (
      SELECT 1 FROM public.competition_double_days d
      WHERE d.competition_id = p_competition_id
        AND d.date = (p_now AT TIME ZONE COALESCE((
          SELECT c.timezone FROM public.competitions c WHERE c.id = p_competition_id
        ), 'UTC'))::date
    ) THEN 2 ELSE 1 END,
    -- Scheduled 2x/3x Vote Boosts are the NEW capability, so they are the half
    -- the kill switch governs: inert until vote_boost_evaluation is enabled.
    CASE WHEN COALESCE((
      SELECT (s.value->>'enabled')::boolean
      FROM public.app_settings s
      WHERE s.key = 'vote_boost_evaluation'
    ), false)
    THEN COALESCE((
      SELECT max(b.multiplier) FROM public.competition_vote_boosts b
      WHERE b.competition_id = p_competition_id
        AND b.cancelled_at IS NULL
        AND p_now >= b.starts_at AND p_now < b.ends_at
    ), 1)
    ELSE 1 END
  );
$$;

INSERT INTO public.app_settings (key, value)
VALUES ('vote_boost_evaluation', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

REVOKE ALL ON FUNCTION app_private.effective_vote_multiplier(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.effective_vote_multiplier(uuid, timestamptz)
  TO anon, authenticated, service_role;

-- PostgREST exposes only `public`; this invoker wrapper is the minimum
-- authenticated read API while row access remains in the private helper.
-- No DEFAULT on p_now: with one, a one-argument call matches both this
-- overload and the browser-facing (uuid) form below, and Postgres refuses to
-- choose ("function public.effective_vote_multiplier(uuid) is not unique") —
-- is_double_vote_day would fail at CREATE time and PostgREST would answer
-- every /rpc/effective_vote_multiplier call with PGRST203.
CREATE OR REPLACE FUNCTION public.effective_vote_multiplier(
  p_competition_id uuid,
  p_now timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.effective_vote_multiplier(p_competition_id, p_now);
$$;

-- The browser-facing overload takes no timestamp. The two-argument form wraps a
-- SECURITY DEFINER reader of competition_vote_boosts, whose RLS otherwise
-- restricts reads to the host and co-hosts; exposing a caller-supplied p_now to
-- anon lets anyone binary-search it and recover the entire unreleased boost
-- schedule — start, end and multiplier — for any competition id. The client
-- (src/lib/votes.js) only ever passes p_competition_id, so pinning the browser
-- overload to now() costs nothing and closes the oracle.
CREATE OR REPLACE FUNCTION public.effective_vote_multiplier(p_competition_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.effective_vote_multiplier(p_competition_id, pg_catalog.now());
$$;

CREATE OR REPLACE FUNCTION public.is_double_vote_day(p_competition_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.effective_vote_multiplier(p_competition_id) > 1;
$$;

REVOKE ALL ON FUNCTION public.effective_vote_multiplier(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.effective_vote_multiplier(uuid, timestamptz)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_vote_multiplier(uuid, timestamptz) TO service_role;
REVOKE ALL ON FUNCTION public.effective_vote_multiplier(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_vote_multiplier(uuid)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_double_vote_day(uuid) TO anon, authenticated, service_role;

-- The browser free-vote path remains guarded even if its client check is
-- bypassed. A 3x write is valid only when it equals the live authority.
CREATE OR REPLACE FUNCTION public.validate_free_vote_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_expected integer;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;
  -- One-argument overload: this trigger is SECURITY INVOKER and runs as the
  -- inserting browser role, which no longer holds EXECUTE on the two-argument
  -- form (see the grants above).
  v_expected := public.effective_vote_multiplier(NEW.competition_id);
  -- The guard exists to stop a client claiming MORE credit than the live
  -- authority allows. Requiring exact equality also rejects a client claiming
  -- LESS, which is not an exploit and is routine: a tab loaded before the boost
  -- opened, or a race between the client's effective_vote_multiplier read and
  -- this insert, submits 1 on a 2x day. Rejecting that loses the vote outright
  -- instead of counting it, so the ceiling is enforced and the floor is not.
  IF NEW.vote_count > v_expected OR NEW.vote_count NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'free vote count may not exceed the active 1x, 2x, or 3x multiplier'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
