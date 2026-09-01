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
CREATE OR REPLACE FUNCTION public.effective_vote_multiplier(
  p_competition_id uuid,
  p_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT app_private.effective_vote_multiplier(p_competition_id, p_now);
$$;

CREATE OR REPLACE FUNCTION public.is_double_vote_day(p_competition_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.effective_vote_multiplier(p_competition_id, now()) > 1;
$$;

REVOKE ALL ON FUNCTION public.effective_vote_multiplier(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_vote_multiplier(uuid, timestamptz)
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
  v_expected := public.effective_vote_multiplier(NEW.competition_id, now());
  IF NEW.vote_count <> v_expected OR NEW.vote_count NOT IN (1, 2, 3) THEN
    RAISE EXCEPTION 'free vote count must equal the active 1x, 2x, or 3x multiplier'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
