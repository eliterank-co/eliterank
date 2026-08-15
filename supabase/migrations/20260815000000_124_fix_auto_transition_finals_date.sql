-- 124: Fix auto_transition_competition_status / auto_complete_competitions
--      referencing a column that does not exist (finale_date → finals_date)
--
-- The hourly pg_cron job `auto-transition-status` (jobid 3) calls
-- auto_transition_competition_status(), which references c.finale_date.
-- competitions has no finale_date column — the real column is finals_date —
-- so every hourly run aborts with:
--
--   ERROR: column c.finale_date does not exist
--   (24 identical failures per day in postgres_logs, verified 2026-08-14/15)
--
-- Because the error aborts the whole function, NO transition runs — including
-- the publish→live update that appears before the failing statement. Status
-- auto-transitions have therefore been entirely dead (issue #581's gap),
-- with page-load-time logic as the only thing moving competitions forward.
--
-- auto_complete_competitions() has the same bug; it is not scheduled by any
-- cron job today, but it is broken for any caller.
--
-- Neither function exists in supabase/migrations/ — they are database drift
-- (issue #611). The bodies below are copied verbatim from production
-- (pg_get_functiondef, 2026-08-15) with exactly one change each:
-- c.finale_date / finale_date → c.finals_date / finals_date.
--
-- Safety check before applying (verified 2026-08-15): no live competition has
-- finals_date <= now(), so applying this does not immediately complete any
-- running competition. Nearest: Most Eligible Bachelors, 2026-09-30.

CREATE OR REPLACE FUNCTION public.auto_transition_competition_status()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    transitioned_count INTEGER := 0;
BEGIN
    -- ==========================================================================
    -- TRANSITION 1: publish → live
    -- When first nomination_period.start_date has passed (or legacy nomination_start)
    -- ==========================================================================

    UPDATE competitions c
    SET
        status = 'live',
        updated_at = NOW()
    WHERE c.status = 'publish'
    AND (
        -- NEW SYSTEM: Check nomination_periods table
        EXISTS (
            SELECT 1
            FROM nomination_periods np
            WHERE np.competition_id = c.id
            AND np.start_date <= NOW()
        )
        OR
        -- LEGACY FALLBACK: Check flat nomination_start field
        (
            NOT EXISTS (
                SELECT 1
                FROM nomination_periods np
                WHERE np.competition_id = c.id
            )
            AND c.nomination_start IS NOT NULL
            AND c.nomination_start <= NOW()
        )
    );

    GET DIAGNOSTICS transitioned_count = ROW_COUNT;

    IF transitioned_count > 0 THEN
        RAISE NOTICE 'Transitioned % competition(s) from publish to live', transitioned_count;
    END IF;

    -- ==========================================================================
    -- TRANSITION 2: live → completed
    -- When finals_date has passed
    -- ==========================================================================

    UPDATE competitions c
    SET
        status = 'completed',
        updated_at = NOW()
    WHERE c.status = 'live'
    AND c.finals_date IS NOT NULL
    AND c.finals_date <= NOW();

    GET DIAGNOSTICS transitioned_count = ROW_COUNT;

    IF transitioned_count > 0 THEN
        RAISE NOTICE 'Transitioned % competition(s) from live to completed', transitioned_count;
    END IF;

    RETURN transitioned_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_complete_competitions()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE competitions
  SET status = 'completed', updated_at = NOW()
  WHERE status = 'live' AND finals_date IS NOT NULL AND finals_date <= NOW();
END;
$function$;
