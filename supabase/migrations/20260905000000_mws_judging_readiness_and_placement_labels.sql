-- =============================================================================
-- 20260905000000_mws_judging_readiness_and_placement_labels.sql
--
-- 1. Add optional generic winner_placement_labels TEXT[] to competitions
--    with coherent validation: non-null, non-empty, trimmed strings, with
--    cardinality <= number_of_winners.
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
-- 3. Fail-closed & exactly-idempotent configuration of Miss Woman Summer
--    (id: 16276ff8-be5b-47c5-8178-2d463fb7dcc3):
--      - Asserts exact unfinalized, uncompleted, 100%-judged baseline; rolls
--        back on any drift
--      - Clean 1st run inserts exact 10 bilingual criteria with weight 1.00
--      - Re-run only no-ops on exact match of criteria, labels, and advance count
--      - Partial, extra, or relabeled criteria raise as drift
-- =============================================================================

-- ──────────────────────────────────────────────────────────────────────────
-- 1. competitions.winner_placement_labels validation & column
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.validate_placement_labels(p_labels TEXT[], p_max INTEGER)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_label TEXT;
  v_seen TEXT[] := '{}';
BEGIN
  IF p_labels IS NULL THEN
    RETURN TRUE;
  END IF;

  IF array_ndims(p_labels) != 1 THEN
    RETURN FALSE;
  END IF;

  IF cardinality(p_labels) < 1 OR cardinality(p_labels) > COALESCE(p_max, 1) THEN
    RETURN FALSE;
  END IF;

  FOREACH v_label IN ARRAY p_labels LOOP
    IF v_label IS NULL OR trim(v_label) = '' THEN
      RETURN FALSE;
    END IF;
    IF trim(v_label) = ANY(v_seen) THEN
      RETURN FALSE;
    END IF;
    v_seen := array_append(v_seen, trim(v_label));
  END LOOP;

  RETURN TRUE;
END;
$$;

COMMENT ON FUNCTION public.validate_placement_labels IS
  'Validates that winner_placement_labels is a 1D array of non-empty strings with cardinality not exceeding number_of_winners.';

ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS winner_placement_labels TEXT[];

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'competitions_winner_placement_labels_check'
  ) THEN
    ALTER TABLE public.competitions
      ADD CONSTRAINT competitions_winner_placement_labels_check
      CHECK (public.validate_placement_labels(winner_placement_labels, number_of_winners));
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

  -- 4. Active contestants check:
  -- When finalize_voting_round runs, it mutates contestant status before updating voting_rounds.
  -- Derive active contestants from NEW.finalized_snapshot, falling back to contestants table.
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
-- 3. Fail-Closed & Exactly-Idempotent Configuration of Miss Woman Summer
-- ──────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_mws_comp_id  CONSTANT UUID := '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
  v_mws_round_id CONSTANT UUID := '85373939-f51b-48df-86ca-cbdaeca51663';
  v_comp         public.competitions%ROWTYPE;
  v_round        public.voting_rounds%ROWTYPE;
  v_crit_count   INTEGER;
  v_exact_match  BOOLEAN;
BEGIN
  -- If MWS does not exist at all in this database (e.g. standalone test environment
  -- where MWS has not been seeded), skip configuration cleanly.
  IF NOT EXISTS (SELECT 1 FROM public.competitions WHERE id = v_mws_comp_id) THEN
    RETURN;
  END IF;

  -- 1. Assert exact competition baseline preconditions:
  SELECT * INTO v_comp
  FROM public.competitions
  WHERE id = v_mws_comp_id;

  IF v_comp.status = 'completed' THEN
    RAISE EXCEPTION 'Miss Woman Summer baseline drift: competition % is already completed',
      v_mws_comp_id USING ERRCODE = 'data_exception', HINT = 'mws_already_completed';
  END IF;

  IF v_comp.winners IS NOT NULL AND cardinality(v_comp.winners) > 0 THEN
    RAISE EXCEPTION 'Miss Woman Summer baseline drift: competition % already has crowned winners %',
      v_mws_comp_id, v_comp.winners USING ERRCODE = 'data_exception', HINT = 'mws_winners_already_crowned';
  END IF;

  -- 2. Assert exact round baseline preconditions:
  SELECT * INTO v_round
  FROM public.voting_rounds
  WHERE id = v_mws_round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Miss Woman Summer baseline drift: expected final round % not found',
      v_mws_round_id USING ERRCODE = 'data_exception', HINT = 'mws_round_missing';
  END IF;

  IF v_round.competition_id != v_mws_comp_id THEN
    RAISE EXCEPTION 'Miss Woman Summer baseline drift: round % belongs to competition %, expected %',
      v_mws_round_id, v_round.competition_id, v_mws_comp_id USING ERRCODE = 'data_exception', HINT = 'mws_round_competition_mismatch';
  END IF;

  IF v_round.finalized_at IS NOT NULL THEN
    RAISE EXCEPTION 'Miss Woman Summer baseline drift: round % is already finalized at %',
      v_mws_round_id, v_round.finalized_at USING ERRCODE = 'data_exception', HINT = 'mws_round_already_finalized';
  END IF;

  IF COALESCE(v_round.judge_weight, 0) != 100 THEN
    RAISE EXCEPTION 'Miss Woman Summer baseline drift: round % has judge_weight %, expected 100',
      v_mws_round_id, v_round.judge_weight USING ERRCODE = 'data_exception', HINT = 'mws_round_not_100_percent_judged';
  END IF;

  -- Check existing criteria count for MWS
  SELECT COUNT(*) INTO v_crit_count
  FROM public.judging_criteria
  WHERE competition_id = v_mws_comp_id;

  -- 3. Case A: Re-run idempotency check.
  -- A rerun may no-op ONLY if the full criteria set, labels, winner count,
  -- and round advancement already match the target exactly.
  IF v_crit_count = 10 THEN
    -- Check if all 10 criteria match sort_order, label, and weight exactly
    SELECT (
      COUNT(*) = 10
      AND COUNT(*) FILTER (
        WHERE jc.label = target.label
          AND jc.weight = target.weight
          AND jc.sort_order = target.sort_order
      ) = 10
    ) INTO v_exact_match
    FROM public.judging_criteria jc
    JOIN (
      VALUES
        (1, 'Confidence and Stage Presence / Seguridad y presencia escénica', 1.00::NUMERIC(4,2)),
        (2, 'Presentation and Elegance / Presentación y elegancia', 1.00::NUMERIC(4,2)),
        (3, 'Personality and Charisma / Personalidad y carisma', 1.00::NUMERIC(4,2)),
        (4, 'Creativity and Adaptability / Creatividad y adaptabilidad', 1.00::NUMERIC(4,2)),
        (5, 'Activity Attendance and Participation / Asistencia y participación', 1.00::NUMERIC(4,2)),
        (6, 'Sisterhood and Relationships with the other candidates / Compañerismo y relación con las demás candidatas', 1.00::NUMERIC(4,2)),
        (7, 'Overall Representation / Representación general', 1.00::NUMERIC(4,2)),
        (8, 'Creative Swimwear / Traje de baño creativo', 1.00::NUMERIC(4,2)),
        (9, 'Gala / Vestido de gala', 1.00::NUMERIC(4,2)),
        (10, 'Sponsor Swimwear / Traje de baño del patrocinador', 1.00::NUMERIC(4,2))
    ) AS target(sort_order, label, weight)
      ON jc.sort_order = target.sort_order
    WHERE jc.competition_id = v_mws_comp_id;

    IF v_exact_match
       AND v_comp.number_of_winners = 3
       AND v_comp.winner_placement_labels = ARRAY['Reina', 'Virreina', 'Princesa']::TEXT[]
       AND v_round.contestants_advance = 3 THEN
      -- Exact rerun idempotency: already in desired state, clean no-op
      RETURN;
    ELSE
      RAISE EXCEPTION 'Miss Woman Summer criteria drift: 10 criteria exist but do not match exact target configuration'
        USING ERRCODE = 'data_exception', HINT = 'mws_criteria_drift';
    END IF;
  ELSIF v_crit_count > 0 THEN
    -- Partial, extra, or unexpected criteria present (baseline was verified 0 criteria)
    RAISE EXCEPTION 'Miss Woman Summer criteria drift: found % unexpected judging criteria for competition % (verified baseline is 0)',
      v_crit_count, v_mws_comp_id USING ERRCODE = 'data_exception', HINT = 'mws_criteria_drift';
  END IF;

  -- 4. Case B: Clean first application from verified 0-criteria baseline.
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
  WHERE id = v_mws_round_id;

  -- Insert the ten exact rows
  INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
  VALUES
    (v_mws_comp_id, 'Confidence and Stage Presence / Seguridad y presencia escénica', 1.00, 1),
    (v_mws_comp_id, 'Presentation and Elegance / Presentación y elegancia', 1.00, 2),
    (v_mws_comp_id, 'Personality and Charisma / Personalidad y carisma', 1.00, 3),
    (v_mws_comp_id, 'Creativity and Adaptability / Creatividad y adaptabilidad', 1.00, 4),
    (v_mws_comp_id, 'Activity Attendance and Participation / Asistencia y participación', 1.00, 5),
    (v_mws_comp_id, 'Sisterhood and Relationships with the other candidates / Compañerismo y relación con las demás candidatas', 1.00, 6),
    (v_mws_comp_id, 'Overall Representation / Representación general', 1.00, 7),
    (v_mws_comp_id, 'Creative Swimwear / Traje de baño creativo', 1.00, 8),
    (v_mws_comp_id, 'Gala / Vestido de gala', 1.00, 9),
    (v_mws_comp_id, 'Sponsor Swimwear / Traje de baño del patrocinador', 1.00, 10);
END;
$$;
