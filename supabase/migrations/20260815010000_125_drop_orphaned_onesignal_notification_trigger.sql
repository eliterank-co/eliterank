-- 125: Drop the orphaned per-insert OneSignal fan-out on notifications
--      (trigger on_notification_insert_onesignal + notify_via_onesignal())
--
-- Every INSERT into public.notifications fires notify_via_onesignal(),
-- which posts the row to the send-notification edge function via pg_net.
-- That call has failed on 100% of invocations for the entire observable
-- log window (~146 × HTTP 500/day, verified 2026-08-14/15): the deployed
-- function requires ONESIGNAL_REST_API_KEY, but the project's secret is
-- named ONESIGNAL_API_KEY (the name every in-repo function uses).
--
-- Why remove it instead of "fixing" it:
--
-- 1. Neither the trigger, the function, nor the send-notification edge
--    function exists anywhere in this repo — all three are database/deploy
--    drift (issue #611). The edge function's source was only recovered from
--    the unmerged reconcile commit d4af51e2.
--
-- 2. The architecture it implemented has been superseded. The flows that
--    produce ~90% of notifications rows today (send-vote-digest,
--    send-host-broadcast — 258 of 285 rows in the 48h ending 2026-08-15)
--    insert the in-app row AND call send-push-notification directly
--    themselves. Making the trigger path work would double-push those
--    users on every digest and host message.
--
-- 3. The remaining low-volume types (bonus_awarded, nominee_accepted,
--    nomination_approved) have never successfully sent through this path
--    in the observable window, so removing it changes no delivered
--    behavior — it only stops the doomed HTTP call and its error noise.
--
-- If a per-type push for bonus_awarded (etc.) is wanted later, add it the
-- way current flows do it: an explicit send-push-notification call at the
-- point of insert — not a table-wide trigger.

DROP TRIGGER IF EXISTS on_notification_insert_onesignal ON public.notifications;

DROP FUNCTION IF EXISTS public.notify_via_onesignal();
