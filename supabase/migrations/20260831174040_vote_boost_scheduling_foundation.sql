-- Numeric Vote Boost scheduling foundation. Existing calendar-day double days
-- remain a 2x compatibility input; new promotions are competition-scoped UTC
-- instants recorded with the IANA timezone used to resolve host input.
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
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT competition_vote_boosts_positive_duration CHECK (ends_at > starts_at),
  CONSTRAINT competition_vote_boosts_four_hour_cap CHECK (ends_at <= starts_at + interval '4 hours')
);

CREATE INDEX IF NOT EXISTS competition_vote_boosts_active_lookup_idx
  ON public.competition_vote_boosts (competition_id, starts_at, ends_at)
  WHERE cancelled_at IS NULL;

ALTER TABLE public.competition_vote_boosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hosts manage their competition vote boosts" ON public.competition_vote_boosts;
CREATE POLICY "Hosts manage their competition vote boosts"
  ON public.competition_vote_boosts FOR ALL
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

INSERT INTO public.app_settings (key, value)
VALUES ('vote_boost_scheduling', '{"enabled": false}'::jsonb)
ON CONFLICT (key) DO NOTHING;
