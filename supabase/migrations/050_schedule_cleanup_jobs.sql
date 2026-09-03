-- =============================================================================
-- Migration 050: Schedule existing cleanup functions via pg_cron
--
-- The cleanup functions below have existed since migrations 003 and 041 but
-- were never scheduled. The result: competition_activity, notifications, and
-- anonymous_vote_rate_limits would have grown unbounded if left unattended.
--
-- Functions being scheduled (already verified to exist in production):
--   * archive_old_activity()                (003_scale_prep.sql:146)
--       Deletes competition_activity rows older than 30 days.
--   * cleanup_old_notifications()           (003_scale_prep.sql:170)
--       Deletes notifications with read_at IS NOT NULL AND created_at
--       older than 90 days.
--   * cleanup_anonymous_vote_rate_limits()  (041_anonymous_vote_rate_limits.sql:25)
--       Deletes anonymous_vote_rate_limits rows older than 48 hours.
--
-- All three are pure DELETE statements with strict time bounds — they cannot
-- touch live/recent data. Safe to run during an active competition.
--
-- Pre-flight verification (completed before authoring this migration):
--   - pg_cron 1.6.4 + pg_net 0.19.5 enabled
--   - All three cleanup functions present, function bodies match expected logic
--   - No existing cron jobs collide with these names
--   - First-run impact measured: ~88 rows in competition_activity, 0 in
--     notifications, 383 in anon rate limits. Sub-second per job.
--
-- Schedules (UTC):
--   03:00 daily   -> archive_old_activity            (~9pm/10pm CST/CDT)
--   04:00 daily   -> cleanup_old_notifications       (~10pm/11pm CST/CDT)
--   every 6 hours -> cleanup_anonymous_vote_rate_limits (00,06,12,18 UTC)
--
-- The DO block guards on pg_cron availability — if the extension is not
-- enabled (e.g. during a future env restore), this migration emits a NOTICE
-- and exits cleanly. It will NOT fail.
--
-- Idempotent: jobs with these names are unscheduled before being re-created,
-- so this migration is safe to re-run.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE '';
    RAISE NOTICE '*** pg_cron extension is not enabled ***';
    RAISE NOTICE 'Enable it in Supabase Dashboard -> Database -> Extensions,';
    RAISE NOTICE 'then re-run this migration. Skipping cron scheduling for now.';
    RAISE NOTICE '';
    RETURN;
  END IF;

  -- Unschedule existing jobs with the same names (idempotent re-runs).
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN (
    'cleanup-activity',
    'cleanup-notifications',
    'cleanup-anon-rate-limits'
  );

  -- Archive competition_activity older than 30 days (daily 03:00 UTC)
  PERFORM cron.schedule(
    'cleanup-activity',
    '0 3 * * *',
    $cmd$SELECT archive_old_activity()$cmd$
  );

  -- Delete read notifications older than 90 days (daily 04:00 UTC)
  PERFORM cron.schedule(
    'cleanup-notifications',
    '0 4 * * *',
    $cmd$SELECT cleanup_old_notifications()$cmd$
  );

  -- Prune anonymous vote rate-limit rows older than 48 hours (every 6h)
  PERFORM cron.schedule(
    'cleanup-anon-rate-limits',
    '0 */6 * * *',
    $cmd$SELECT cleanup_anonymous_vote_rate_limits()$cmd$
  );

  RAISE NOTICE 'Scheduled cleanup jobs: cleanup-activity, cleanup-notifications, cleanup-anon-rate-limits';
END $$;
