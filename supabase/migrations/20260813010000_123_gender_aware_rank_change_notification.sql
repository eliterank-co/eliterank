-- =============================================================================
-- 123_gender_aware_rank_change_notification.sql
--
-- Make the in-app "rank_change" notification honor winners_split_by_gender.
--
-- The rank_change notification ("You moved from #X to #Y") is emitted by the
-- on_rank_change_notification() trigger, which fires AFTER UPDATE OF rank on
-- contestants. The only writer of contestants.rank is the host roster reorder
-- (PeopleTab), which renumbers the roster 1..N GLOBALLY. In a gender-split
-- competition a global, cross-gender "#N" is the wrong number to show a
-- contestant — their standing is within their own gender (see
-- finalize_voting_round in migration 120 and the public leaderboard, which
-- both rank within gender).
--
-- Fix: when the competition splits winners by gender, translate the global
-- reorder position into the contestant's WITHIN-GENDER position — the count of
-- same-gender contestants at or above them in the global order — for both the
-- old and new values, and suppress the notification when the within-gender
-- position did not actually change (e.g. the contestant was only reordered
-- past someone of the other gender). Non-split competitions keep the original
-- global behavior unchanged.
--
-- A host "move up/down" changes contestants.rank only for the swapped pair
-- (every other row's renumbered rank equals its existing value, so the trigger
-- does not fire for them), so the same-gender counts below are computed against
-- an otherwise-stable roster.
-- =============================================================================

CREATE OR REPLACE FUNCTION on_rank_change_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_split    BOOLEAN;
  v_old_rank INTEGER;
  v_new_rank INTEGER;
BEGIN
  IF OLD.rank IS DISTINCT FROM NEW.rank AND NEW.user_id IS NOT NULL AND OLD.rank IS NOT NULL THEN
    SELECT COALESCE(winners_split_by_gender, false) INTO v_split
    FROM competitions WHERE id = NEW.competition_id;

    IF v_split AND NEW.gender IS NOT NULL THEN
      -- Within-gender position = number of same-gender contestants at or above
      -- this row in the global reorder order.
      SELECT COUNT(*) INTO v_new_rank
      FROM contestants
      WHERE competition_id = NEW.competition_id
        AND gender = NEW.gender
        AND rank IS NOT NULL
        AND rank <= NEW.rank;

      SELECT COUNT(*) INTO v_old_rank
      FROM contestants
      WHERE competition_id = NEW.competition_id
        AND gender = NEW.gender
        AND rank IS NOT NULL
        AND rank <= OLD.rank;

      -- Only reordered past someone of the other gender → within-gender
      -- standing unchanged → no notification.
      IF v_old_rank IS NULL OR v_new_rank IS NULL OR v_old_rank = v_new_rank THEN
        RETURN NEW;
      END IF;
    ELSE
      v_old_rank := OLD.rank;
      v_new_rank := NEW.rank;
    END IF;

    INSERT INTO notifications (user_id, type, title, body, competition_id, contestant_id, metadata)
    VALUES (
      NEW.user_id,
      'rank_change',
      CASE WHEN v_new_rank < v_old_rank THEN 'You moved up!' ELSE 'Ranking update' END,
      'You moved from #' || v_old_rank || ' to #' || v_new_rank,
      NEW.competition_id,
      NEW.id,
      jsonb_build_object(
        'old_rank', v_old_rank,
        'new_rank', v_new_rank,
        'direction', CASE WHEN v_new_rank < v_old_rank THEN 'up' ELSE 'down' END
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION on_rank_change_notification IS
  'Emits a rank_change notification when contestants.rank changes (host roster reorder). For competitions with winners_split_by_gender, the #N shown is the contestant''s within-gender position, and cross-gender-only moves emit nothing.';
