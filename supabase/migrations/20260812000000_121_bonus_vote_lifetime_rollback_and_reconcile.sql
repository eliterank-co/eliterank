-- =============================================================================
-- Bonus-vote lifetime counters: roll back on removal + reconcile drift
-- =============================================================================
-- Migration 054 added the never-reset lifetime counters and an AFTER INSERT
-- trigger on bonus_vote_completions that bumps lifetime_bonus_votes /
-- lifetime_votes whenever a completion is created. It never added the mirror
-- side: when a completion is DELETED (e.g. a host revokes a bonus task via
-- revokeHostManagedTask, which removes the completion row and decrements the
-- in-round contestants.votes) the lifetime counters were left untouched.
--
-- Because the INSERT trigger increments but nothing decrements, every
-- award→remove cycle leaves lifetime_bonus_votes (and the derived
-- lifetime_votes) permanently 1 award too high. That drift is what surfaces as
-- a contestant showing MORE lifetime votes than they actually hold — the
-- People tab, Overview tab, public profile modal and profile "competitions"
-- cards read lifetime_votes, while the public leaderboard reads the in-round
-- votes column, so the same contestant reads two different numbers.
--
-- This migration:
--   1. Adds AFTER DELETE and AFTER UPDATE OF votes_awarded triggers so the
--      lifetime counters stay symmetric with the completions ledger.
--   2. Reconciles every existing contestant's lifetime_bonus_votes /
--      lifetime_votes back to the source-of-truth ledgers (idempotent).

-- ---------------------------------------------------------------------------
-- 1a. Roll back the lifetime counters when a completion is removed.
--     Mirror of on_bonus_vote_lifetime_increment() (migration 054). Clamped at
--     0 so a counter can never go negative even if state is momentarily
--     inconsistent. Only the lifetime_* columns are touched here — the in-round
--     contestants.votes decrement stays owned by the revoke path
--     (increment_contestant_votes) exactly as the award side splits that work.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION on_bonus_vote_lifetime_decrement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE contestants
  SET lifetime_bonus_votes = GREATEST(0, lifetime_bonus_votes - COALESCE(OLD.votes_awarded, 0)),
      lifetime_votes       = GREATEST(0, lifetime_votes       - COALESCE(OLD.votes_awarded, 0))
  WHERE id = OLD.contestant_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_bonus_vote_lifetime_delete ON bonus_vote_completions;
CREATE TRIGGER trigger_bonus_vote_lifetime_delete
  AFTER DELETE ON bonus_vote_completions
  FOR EACH ROW
  EXECUTE FUNCTION on_bonus_vote_lifetime_decrement();

-- ---------------------------------------------------------------------------
-- 1b. Keep the lifetime counters in step if a completion's awarded amount is
--     ever edited (e.g. a task's votes_awarded is corrected after the fact).
--     Adjusts by the delta so it composes with the INSERT/DELETE triggers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION on_bonus_vote_lifetime_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delta INTEGER := COALESCE(NEW.votes_awarded, 0) - COALESCE(OLD.votes_awarded, 0);
BEGIN
  IF v_delta <> 0 THEN
    UPDATE contestants
    SET lifetime_bonus_votes = GREATEST(0, lifetime_bonus_votes + v_delta),
        lifetime_votes       = GREATEST(0, lifetime_votes       + v_delta)
    WHERE id = NEW.contestant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_bonus_vote_lifetime_update ON bonus_vote_completions;
CREATE TRIGGER trigger_bonus_vote_lifetime_update
  AFTER UPDATE OF votes_awarded ON bonus_vote_completions
  FOR EACH ROW
  EXECUTE FUNCTION on_bonus_vote_lifetime_update();

-- ---------------------------------------------------------------------------
-- 2. Reconcile existing drift from the source-of-truth ledgers.
--    Absolute SET recomputed from bonus_vote_completions + manual_votes, so it
--    is idempotent (re-running does not double-count). Mirrors migration 063's
--    backfill, but scoped to the bonus/total counters only — lifetime_paid_votes
--    and lifetime_free_votes are left to the votes-table trigger and are not
--    rewritten here, so any paid/free classification is preserved untouched.
--    Only rows whose stored bonus total actually diverges from the ledger are
--    written.
-- ---------------------------------------------------------------------------
UPDATE contestants c
SET lifetime_bonus_votes = sub.ledger_bonus,
    lifetime_votes       = c.lifetime_paid_votes + c.lifetime_free_votes + sub.ledger_bonus
FROM (
  SELECT
    c2.id,
    COALESCE(b.bonus, 0) + COALESCE(m.manual, 0) AS ledger_bonus
  FROM contestants c2
  LEFT JOIN (
    SELECT contestant_id, SUM(votes_awarded) AS bonus
    FROM bonus_vote_completions
    GROUP BY contestant_id
  ) b ON b.contestant_id = c2.id
  LEFT JOIN (
    SELECT contestant_id, SUM(vote_count) AS manual
    FROM manual_votes
    GROUP BY contestant_id
  ) m ON m.contestant_id = c2.id
) sub
WHERE c.id = sub.id
  AND c.lifetime_bonus_votes <> sub.ledger_bonus;
