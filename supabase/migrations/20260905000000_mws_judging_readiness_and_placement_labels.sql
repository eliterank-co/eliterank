-- =============================================================================
-- 20260905000000_mws_judging_readiness_and_placement_labels.sql
--
-- 1. Add optional generic winner_placement_labels TEXT[] to competitions.
-- 2. Add an atomic judging-readiness barrier (BEFORE UPDATE OF finalized_at on
--    voting_rounds) that prevents any round with judge_weight > 0 from
--    finalizing unless:
--      - At least one judging criterion exists
--      - At least one non-hidden judge exists
--      - Every non-hidden judge is claimed (claimed_at and user_id are NOT NULL)
--      - At least one active contestant exists
--      - Every non-hidden judge has submitted exactly one score for every active
--        contestant and every criterion
--      - No required score row is an unsubmitted draft
--    Hidden preview judges do not participate in readiness. Pure-vote rounds
--    (judge_weight = 0) are completely unaffected.
-- 3. Idempotently configure the live Miss Woman Summer competition record
--    (id: 16276ff8-be5b-47c5-8178-2d463fb7dcc3):
--      - number_of_winners = 3
--      - winner_placement_labels = ['Reina', 'Virreina', 'Princesa']
--      - final round contestants_advance = 3
--      - 10 official bilingual criteria with equal weight 1.00 (order 1-10)
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. competitions.winner_placement_labels
-- ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS winner_placement_labels TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'competitions_winner_placement_labels_check'
  ) THEN
    ALTER TABLE public.competitions
      ADD CONSTRAINT competitions_winner_placement_labels_check
      CHECK (
        winner_placement_labels IS NULL OR (
          array_ndims(winner_placement_labels) = 1
          AND array_position(winner_placement_labels, NULL) IS NULL
          AND cardinality(winner_placement_labels) <= 50
        )
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.competitions.winner_placement_labels IS
  'Optional ordered array of custom placement titles (e.g. ["Reina", "Virreina", "Princesa"]) displayed on the multi-winner results podium in place of ordinal ranks.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. Atomic judging-readiness barrier trigger on voting_rounds
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.check_judging_round_readiness()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_criteria_count INTEGER;
  v_non_hidden_judges INTEGER;
  v_unclaimed_judges INTEGER;
  v_active_contestants INTEGER;
  v_missing_scores INTEGER;
  v_draft_scores INTEGER;
BEGIN
  -- Only enforce when transitioning from unfinalized to finalized
  IF NEW.finalized_at IS NULL OR OLD.finalized_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Pure voting rounds (judge_weight = 0 or NULL) are untouched
  IF COALESCE(NEW.judge_weight, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- 1. At least one judging criterion must exist
  SELECT COUNT(*) INTO v_criteria_count
  FROM public.judging_criteria
  WHERE competition_id = NEW.competition_id;

  IF v_criteria_count = 0 THEN
    RAISE EXCEPTION 'Judging readiness barrier: competition % has no judging criteria configured (round % has judge_weight %)',
      NEW.competition_id, NEW.id, NEW.judge_weight
      USING ERRCODE = 'check_violation', HINT = 'judging_criteria_missing';
  END IF;

  -- 2. At least one non-hidden judge must exist
  SELECT COUNT(*) INTO v_non_hidden_judges
  FROM public.judges
  WHERE competition_id = NEW.competition_id
    AND hidden = false;

  IF v_non_hidden_judges = 0 THEN
    RAISE EXCEPTION 'Judging readiness barrier: competition % has no active (non-hidden) judges (round % has judge_weight %)',
      NEW.competition_id, NEW.id, NEW.judge_weight
      USING ERRCODE = 'check_violation', HINT = 'judges_missing';
  END IF;

  -- 3. Every non-hidden judge must be claimed (claimed_at IS NOT NULL and user_id IS NOT NULL)
  SELECT COUNT(*) INTO v_unclaimed_judges
  FROM public.judges
  WHERE competition_id = NEW.competition_id
    AND hidden = false
    AND (claimed_at IS NULL OR user_id IS NULL);

  IF v_unclaimed_judges > 0 THEN
    RAISE EXCEPTION 'Judging readiness barrier: competition % has % unclaimed active judge(s)',
      NEW.competition_id, v_unclaimed_judges
      USING ERRCODE = 'check_violation', HINT = 'unclaimed_judges';
  END IF;

  -- 4. Active contestants check
  WITH active_contestants AS (
    SELECT DISTINCT (elem->>'contestant_id')::UUID AS id
    FROM jsonb_array_elements(NEW.finalized_snapshot) AS elem
    WHERE NEW.finalized_snapshot IS NOT NULL AND jsonb_typeof(NEW.finalized_snapshot) = 'array'
    UNION
    SELECT c.id
    FROM public.contestants c
    WHERE c.competition_id = NEW.competition_id
      AND (
        c.status = 'active'
        OR (c.status = 'winner' AND NOT EXISTS (
          SELECT 1 FROM public.voting_rounds vr
          WHERE vr.competition_id = NEW.competition_id AND vr.round_order > NEW.round_order
        ))
        OR c.eliminated_in_round = NEW.round_order
      )
      AND (NEW.finalized_snapshot IS NULL OR jsonb_typeof(NEW.finalized_snapshot) != 'array' OR jsonb_array_length(NEW.finalized_snapshot) = 0)
  )
  SELECT COUNT(*) INTO v_active_contestants FROM active_contestants;

  IF v_active_contestants = 0 THEN
    RAISE EXCEPTION 'Judging readiness barrier: competition % has no active contestants to score',
      NEW.competition_id
      USING ERRCODE = 'check_violation', HINT = 'no_active_contestants';
  END IF;

  -- 5. Scoring matrix completeness and draft check:
  -- Every non-hidden judge must have submitted exactly one score for every active contestant and criterion.
  -- No required score may be missing or an unsubmitted draft.
  WITH active_contestants AS (
    SELECT DISTINCT (elem->>'contestant_id')::UUID AS id
    FROM jsonb_array_elements(NEW.finalized_snapshot) AS elem
    WHERE NEW.finalized_snapshot IS NOT NULL AND jsonb_typeof(NEW.finalized_snapshot) = 'array'
    UNION
    SELECT c.id
    FROM public.contestants c
    WHERE c.competition_id = NEW.competition_id
      AND (
        c.status = 'active'
        OR (c.status = 'winner' AND NOT EXISTS (
          SELECT 1 FROM public.voting_rounds vr
          WHERE vr.competition_id = NEW.competition_id AND vr.round_order > NEW.round_order
        ))
        OR c.eliminated_in_round = NEW.round_order
      )
      AND (NEW.finalized_snapshot IS NULL OR jsonb_typeof(NEW.finalized_snapshot) != 'array' OR jsonb_array_length(NEW.finalized_snapshot) = 0)
  ),
  required_matrix AS (
    SELECT
      j.id AS judge_id,
      ac.id AS contestant_id,
      jc.id AS criterion_id
    FROM public.judges j
    CROSS JOIN active_contestants ac
    CROSS JOIN public.judging_criteria jc
    WHERE j.competition_id = NEW.competition_id
      AND j.hidden = false
      AND jc.competition_id = NEW.competition_id
  )
  SELECT
    COUNT(*) FILTER (WHERE js.id IS NULL),
    COUNT(*) FILTER (WHERE js.id IS NOT NULL AND js.submitted_at IS NULL)
  INTO v_missing_scores, v_draft_scores
  FROM required_matrix rm
  LEFT JOIN public.judge_scores js
    ON js.voting_round_id = NEW.id
   AND js.judge_id = rm.judge_id
   AND js.contestant_id = rm.contestant_id
   AND js.criterion_id = rm.criterion_id;

  IF v_missing_scores > 0 THEN
    RAISE EXCEPTION 'Judging readiness barrier: round % is missing % required score(s) across active judges, contestants, and criteria',
      NEW.id, v_missing_scores
      USING ERRCODE = 'check_violation', HINT = 'incomplete_score_matrix';
  END IF;

  IF v_draft_scores > 0 THEN
    RAISE EXCEPTION 'Judging readiness barrier: round % has % unsubmitted draft score(s)',
      NEW.id, v_draft_scores
      USING ERRCODE = 'check_violation', HINT = 'unsubmitted_draft_scores';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_judging_round_readiness ON public.voting_rounds;
CREATE TRIGGER trg_check_judging_round_readiness
BEFORE UPDATE OF finalized_at ON public.voting_rounds
FOR EACH ROW
EXECUTE FUNCTION public.check_judging_round_readiness();

COMMENT ON FUNCTION public.check_judging_round_readiness IS
  'Atomic judging readiness barrier: prevents finalization of rounds with judge_weight > 0 unless judging criteria exist, active judges are claimed, and every active judge has submitted all scores for all active contestants across all criteria.';

-- ──────────────────────────────────────────────────────────────────────────
-- 3. Idempotent configuration of Miss Woman Summer
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_mws_comp_id CONSTANT UUID := '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
  v_mws_round_id CONSTANT UUID := '85373939-f51b-48df-86ca-cbdaeca51663';
BEGIN
  IF EXISTS (SELECT 1 FROM public.competitions WHERE id = v_mws_comp_id) THEN
    -- Update competition winner count and placement labels
    UPDATE public.competitions
    SET
      number_of_winners = 3,
      winner_placement_labels = ARRAY['Reina', 'Virreina', 'Princesa']::TEXT[],
      updated_at = NOW()
    WHERE id = v_mws_comp_id;

    -- Update final voting round contestants_advance
    UPDATE public.voting_rounds
    SET
      contestants_advance = 3
    WHERE id = v_mws_round_id
      AND competition_id = v_mws_comp_id;

    -- Idempotently insert the 10 official criteria
    INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
    SELECT v_mws_comp_id, c.label, c.weight, c.sort_order
    FROM (
      VALUES
        ('Confidence and Stage Presence / Seguridad y presencia escénica', 1.00, 1),
        ('Presentation and Elegance / Presentación y elegancia', 1.00, 2),
        ('Personality and Charisma / Personalidad y carisma', 1.00, 3),
        ('Creativity and Adaptability / Creatividad y adaptabilidad', 1.00, 4),
        ('Activity Attendance and Participation / Asistencia y participación', 1.00, 5),
        ('Sisterhood and Relationships with the other candidates / Compañerismo y relación con las demás candidatas', 1.00, 6),
        ('Overall Representation / Representación general', 1.00, 7),
        ('Creative Swimwear / Traje de baño creativo', 1.00, 8),
        ('Gala / Vestido de gala', 1.00, 9),
        ('Sponsor Swimwear / Traje de baño del patrocinador', 1.00, 10)
    ) AS c(label, weight, sort_order)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.judging_criteria jc
      WHERE jc.competition_id = v_mws_comp_id
        AND jc.label = c.label
    );
  END IF;
END;
$$;
