-- =============================================================================
-- 120_finalize_last_round_crowning_and_gender_normalization.sql
--
-- Two fixes to finalize_voting_round(), both required by the single-decider
-- round model the current host timeline UI produces.
--
-- 1. CROWN THE LAST ROUND.
--    The timeline editor (TimelineSettings.jsx) crowns winners on the LAST
--    round (`const decides = isLastRound`) and keeps that round typed
--    'voting' — the judged decider "rides on" the final voting round via its
--    judge_weight. But finalize_voting_round only crowned when
--    round_type = 'finale', a separate trailing round the newer UI no longer
--    creates. Consequence: a live hybrid/judges competition whose last round
--    is 'voting' marks its top finishers as *advanced* to a non-existent next
--    round, never sets competitions.winners, and never marks the competition
--    completed — the winners are never crowned. All three currently-live
--    judged competitions are configured this way.
--
--    Fix: treat a round as the decider when it is round_type 'finale' OR simply
--    the last round (no higher round_order exists). This crowns correctly under
--    both the old two-round pattern (a trailing 'finale' round is still the
--    last round) and the new single-decider pattern.
--
-- 2. PER-GENDER NORMALIZATION.
--    When winners_split_by_gender is on, contestants are ranked within their
--    gender, but votes and judge scores were normalized against a single
--    competition-wide maximum. That lets the other gender's top vote-getter or
--    top-scored contestant compress a division's component and shift the
--    judges/votes balance within that division — changing who wins. Normalize
--    each component against the per-gender maximum when the split is on (global
--    maximum otherwise, which is unchanged behavior). Ranking already
--    partitions by gender.
--
-- The JS mirror of this scoring lives in src/lib/judgingScore.js
-- (blendedScores) and is covered by src/lib/judgingScore.test.js.
-- =============================================================================

CREATE OR REPLACE FUNCTION finalize_voting_round(p_round_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round              voting_rounds%ROWTYPE;
  v_next_round         voting_rounds%ROWTYPE;
  v_competition        competitions%ROWTYPE;
  v_advance_count      INTEGER;
  v_advance_per_gender INTEGER;
  v_split              BOOLEAN;
  v_is_final           BOOLEAN;
  v_total_active       INTEGER;
  v_snapshot           JSONB;
  v_winner_ids         UUID[];
  v_advanced_ids       UUID[];
  v_eliminated_ids     UUID[];
  v_jw                 INTEGER;
BEGIN
  SELECT * INTO v_round FROM voting_rounds WHERE id = p_round_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'voting_round % not found', p_round_id;
  END IF;

  IF v_round.finalized_at IS NOT NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'already_finalized');
  END IF;

  IF v_round.end_date IS NULL OR v_round.end_date > NOW() THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_yet_ended');
  END IF;

  SELECT * INTO v_competition FROM competitions WHERE id = v_round.competition_id;

  v_jw                 := COALESCE(v_round.judge_weight, 0);
  v_advance_count      := COALESCE(v_round.contestants_advance, 0);
  v_split              := COALESCE(v_competition.winners_split_by_gender, false);
  v_advance_per_gender := CEIL(v_advance_count / 2.0)::INTEGER;

  -- This round decides winners when it is an explicit finale round OR simply
  -- the last round of the competition (the single-decider model, where the
  -- judged final round stays typed 'voting').
  v_is_final := v_round.round_type = 'finale'
    OR NOT EXISTS (
      SELECT 1 FROM voting_rounds
      WHERE competition_id = v_round.competition_id
        AND round_order > v_round.round_order
    );

  WITH per_judge AS (
    SELECT
      js.contestant_id,
      js.judge_id,
      SUM(js.score * COALESCE(jc.weight, 1)) AS judge_total
    FROM judge_scores js
    JOIN judging_criteria jc ON jc.id = js.criterion_id
    WHERE js.voting_round_id = p_round_id
      AND js.submitted_at IS NOT NULL
    GROUP BY js.contestant_id, js.judge_id
  ),
  judge_avg AS (
    SELECT contestant_id, AVG(judge_total)::NUMERIC AS avg_total
    FROM per_judge
    GROUP BY contestant_id
  ),
  base AS (
    SELECT
      c.id,
      c.votes,
      c.gender,
      c.created_at,
      COALESCE(ja.avg_total, 0) AS judge_avg,
      -- Normalization bucket: per-gender when the split is on, one global
      -- bucket otherwise. NULL genders share a bucket but are eliminated by
      -- the status logic below regardless of their normalized score.
      CASE WHEN v_split THEN COALESCE(c.gender, '__none__') ELSE '__all__' END AS bucket
    FROM contestants c
    LEFT JOIN judge_avg ja ON ja.contestant_id = c.id
    WHERE c.competition_id = v_round.competition_id
      AND c.status = 'active'
  ),
  bucket_max AS (
    SELECT
      bucket,
      MAX(judge_avg) AS max_judge,
      MAX(votes)     AS max_votes
    FROM base
    GROUP BY bucket
  ),
  scored AS (
    SELECT
      b.id,
      b.votes,
      b.gender,
      b.created_at,
      b.judge_avg,
      CASE
        WHEN v_jw > 0 THEN
          (v_jw::NUMERIC / 100.0) *
            (CASE WHEN bm.max_judge > 0 THEN b.judge_avg / bm.max_judge ELSE 0 END)
          + ((100 - v_jw)::NUMERIC / 100.0) *
            (CASE WHEN bm.max_votes > 0 THEN b.votes::NUMERIC / bm.max_votes ELSE 0 END)
        ELSE b.votes::NUMERIC
      END AS final_score
    FROM base b
    JOIN bucket_max bm ON bm.bucket = b.bucket
  ),
  ranked AS (
    SELECT
      id, votes, judge_avg, final_score, gender,
      CASE
        WHEN v_split AND gender IS NOT NULL THEN
          ROW_NUMBER() OVER (
            PARTITION BY gender
            ORDER BY final_score DESC NULLS LAST, votes DESC NULLS LAST, created_at ASC
          )
        ELSE
          ROW_NUMBER() OVER (
            ORDER BY final_score DESC NULLS LAST, votes DESC NULLS LAST, created_at ASC
          )
      END AS rank
    FROM scored
  )
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'contestant_id', id,
        'votes', votes,
        'judge_avg', judge_avg,
        'final_score', final_score,
        'judge_weight', v_jw,
        'gender', gender,
        'rank', rank,
        'status', CASE
          WHEN v_is_final THEN
            CASE
              WHEN v_split AND gender IS NULL THEN 'runner_up'
              WHEN v_split AND rank <= v_advance_per_gender THEN 'winner'
              WHEN v_split THEN 'runner_up'
              WHEN rank <= v_advance_count THEN 'winner'
              ELSE 'runner_up'
            END
          ELSE
            CASE
              WHEN v_split AND gender IS NULL THEN 'eliminated'
              WHEN v_split AND rank <= v_advance_per_gender THEN 'advanced'
              WHEN v_split THEN 'eliminated'
              WHEN rank <= v_advance_count THEN 'advanced'
              ELSE 'eliminated'
            END
        END
      )
      ORDER BY rank
    ),
    COUNT(*)
  INTO v_snapshot, v_total_active
  FROM ranked;

  IF v_snapshot IS NULL THEN
    v_snapshot := '[]'::jsonb;
  END IF;

  IF v_is_final THEN
    SELECT array_agg((elem->>'contestant_id')::uuid)
    INTO v_winner_ids
    FROM jsonb_array_elements(v_snapshot) AS elem
    WHERE elem->>'status' = 'winner';

    IF v_winner_ids IS NOT NULL THEN
      UPDATE contestants
      SET status = 'winner',
          advancement_status = 'winner'
      WHERE id = ANY(v_winner_ids);

      UPDATE competitions
      SET winners = v_winner_ids,
          status = 'completed',
          updated_at = NOW()
      WHERE id = v_round.competition_id;
    END IF;
  ELSE
    SELECT array_agg((elem->>'contestant_id')::uuid)
    INTO v_advanced_ids
    FROM jsonb_array_elements(v_snapshot) AS elem
    WHERE elem->>'status' = 'advanced';

    SELECT array_agg((elem->>'contestant_id')::uuid)
    INTO v_eliminated_ids
    FROM jsonb_array_elements(v_snapshot) AS elem
    WHERE elem->>'status' = 'eliminated';

    IF v_advanced_ids IS NOT NULL THEN
      UPDATE contestants
      SET advancement_status = 'advanced',
          current_round = v_round.round_order + 1
      WHERE id = ANY(v_advanced_ids);
    END IF;

    IF v_eliminated_ids IS NOT NULL THEN
      UPDATE contestants
      SET status = 'eliminated',
          advancement_status = 'eliminated',
          eliminated_in_round = v_round.round_order
      WHERE id = ANY(v_eliminated_ids);
    END IF;

    SELECT * INTO v_next_round
    FROM voting_rounds
    WHERE competition_id = v_round.competition_id
      AND round_order = v_round.round_order + 1;

    IF FOUND AND v_next_round.votes_reset_at_start AND v_advanced_ids IS NOT NULL THEN
      UPDATE contestants c
      SET votes_at_round_start = c.votes_at_round_start
            || jsonb_build_object(v_next_round.id::text, c.votes),
          votes = COALESCE((
            SELECT SUM(bvc.votes_awarded)
            FROM bonus_vote_completions bvc
            WHERE bvc.contestant_id = c.id
          ), 0)
          + COALESCE((
            SELECT SUM(mv.vote_count)
            FROM manual_votes mv
            WHERE mv.contestant_id = c.id
          ), 0)
      WHERE c.id = ANY(v_advanced_ids);
    END IF;
  END IF;

  UPDATE voting_rounds
  SET finalized_at = NOW(),
      finalized_snapshot = v_snapshot
  WHERE id = p_round_id;

  RETURN jsonb_build_object(
    'finalized', true,
    'round_id', p_round_id,
    'round_type', v_round.round_type,
    'is_final', v_is_final,
    'judge_weight', v_jw,
    'split_by_gender', v_split,
    'total_active', v_total_active,
    'advanced_count', COALESCE(array_length(v_advanced_ids, 1), 0),
    'eliminated_count', COALESCE(array_length(v_eliminated_ids, 1), 0),
    'winner_count', COALESCE(array_length(v_winner_ids, 1), 0)
  );
END;
$$;

COMMENT ON FUNCTION finalize_voting_round IS
  'Idempotently finalize a voting round. Crowns winners when the round is a finale round OR the last round of the competition (single-decider model); otherwise advances/eliminates. Ranks active contestants by judge-weighted score; when winners_split_by_gender is true, ranks AND normalizes within each gender.';
