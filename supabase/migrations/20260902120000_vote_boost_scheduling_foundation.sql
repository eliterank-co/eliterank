-- Numeric Vote Boost scheduling foundation. Existing calendar-day double days
-- remain a 2x compatibility input; new promotions are competition-scoped UTC
-- instants recorded with the IANA timezone used to resolve host input.
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.competition_vote_boosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  timezone text NOT NULL,
  multiplier integer NOT NULL CHECK (multiplier IN (2, 3)),
  label text,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competition_vote_boosts_positive_duration CHECK (ends_at > starts_at),
  CONSTRAINT competition_vote_boosts_four_hour_cap CHECK (ends_at <= starts_at + interval '4 hours')
);

CREATE INDEX IF NOT EXISTS competition_vote_boosts_active_lookup_idx
  ON public.competition_vote_boosts (competition_id, starts_at, ends_at)
  WHERE cancelled_at IS NULL;

ALTER TABLE public.competition_vote_boosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_vote_boosts FORCE ROW LEVEL SECURITY;

INSERT INTO public.app_settings (key, value)
VALUES ('vote_boost_scheduling', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION app_private.vote_boost_scheduling_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT (s.value->>'enabled')::boolean
    FROM public.app_settings AS s
    WHERE s.key = 'vote_boost_scheduling'
  ), false);
$$;

CREATE OR REPLACE FUNCTION app_private.enforce_vote_boost_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_timezone text;
BEGIN
  SELECT COALESCE(c.timezone, 'UTC')
  INTO v_timezone
  FROM public.competitions AS c
  WHERE c.id = NEW.competition_id;

  IF v_timezone IS NULL OR NEW.timezone <> v_timezone THEN
    RAISE EXCEPTION 'vote boost timezone must match the competition IANA timezone'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.timezone
  ) THEN
    RAISE EXCEPTION 'invalid IANA timezone: %', NEW.timezone
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF ROW(
      NEW.competition_id, NEW.starts_at, NEW.ends_at, NEW.timezone,
      NEW.multiplier, NEW.label, NEW.created_at, NEW.created_by
    ) IS DISTINCT FROM ROW(
      OLD.competition_id, OLD.starts_at, OLD.ends_at, OLD.timezone,
      OLD.multiplier, OLD.label, OLD.created_at, OLD.created_by
    ) THEN
      RAISE EXCEPTION 'vote boost schedule history is immutable; cancel it instead'
        USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.cancelled_at IS NOT NULL
       AND ROW(NEW.cancelled_at, NEW.cancelled_by)
         IS DISTINCT FROM ROW(OLD.cancelled_at, OLD.cancelled_by) THEN
      RAISE EXCEPTION 'vote boost cancellation history is immutable'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF (NEW.cancelled_at IS NULL) <> (NEW.cancelled_by IS NULL) THEN
    RAISE EXCEPTION 'vote boost cancellation requires both timestamp and actor'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS competition_vote_boosts_history_guard
  ON public.competition_vote_boosts;
CREATE TRIGGER competition_vote_boosts_history_guard
  BEFORE INSERT OR UPDATE ON public.competition_vote_boosts
  FOR EACH ROW EXECUTE FUNCTION app_private.enforce_vote_boost_history();

REVOKE ALL ON TABLE public.competition_vote_boosts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.competition_vote_boosts TO authenticated;
GRANT ALL ON TABLE public.competition_vote_boosts TO service_role;
REVOKE ALL ON FUNCTION app_private.vote_boost_scheduling_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.vote_boost_scheduling_enabled() TO authenticated, service_role;
REVOKE ALL ON FUNCTION app_private.enforce_vote_boost_history() FROM PUBLIC;

DROP POLICY IF EXISTS "Hosts manage their competition vote boosts" ON public.competition_vote_boosts;
DROP POLICY IF EXISTS "Hosts read their competition vote boosts" ON public.competition_vote_boosts;
DROP POLICY IF EXISTS "Hosts schedule their competition vote boosts" ON public.competition_vote_boosts;
DROP POLICY IF EXISTS "Hosts cancel their competition vote boosts" ON public.competition_vote_boosts;

CREATE POLICY "Hosts read their competition vote boosts"
  ON public.competition_vote_boosts FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = competition_vote_boosts.competition_id
      AND (c.host_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.competition_co_hosts cch
        WHERE cch.competition_id = c.id AND cch.user_id = auth.uid()
      ))
  ));

CREATE POLICY "Hosts schedule their competition vote boosts"
  ON public.competition_vote_boosts FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = competition_vote_boosts.competition_id
      AND (c.host_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.competition_co_hosts cch
        WHERE cch.competition_id = c.id AND cch.user_id = auth.uid()
      ))
  ) AND app_private.vote_boost_scheduling_enabled());

CREATE POLICY "Hosts cancel their competition vote boosts"
  ON public.competition_vote_boosts FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = competition_vote_boosts.competition_id
      AND (c.host_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.competition_co_hosts cch
        WHERE cch.competition_id = c.id AND cch.user_id = auth.uid()
      ))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.competitions c
    WHERE c.id = competition_vote_boosts.competition_id
      AND (c.host_id = auth.uid() OR EXISTS (
        SELECT 1 FROM public.competition_co_hosts cch
        WHERE cch.competition_id = c.id AND cch.user_id = auth.uid()
      ))
  ));
