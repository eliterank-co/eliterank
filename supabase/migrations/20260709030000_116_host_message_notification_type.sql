-- =============================================================================
-- Host → contestant direct messages
-- =============================================================================
-- Adds the `host_message` notification type so a host (or co-host) can send an
-- in-app message to their contestants. The message body is delivered in-app via
-- the notifications bell and previewed to the contestant by email
-- (send-contestant-message edge function).
--
-- Also folds in `judge_invite`, which send-judge-invite already inserts but was
-- never added to the CHECK constraint (its inserts were silently rejected). This
-- keeps the constraint an accurate superset of every type the app emits.
-- =============================================================================

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS valid_notification_type;
ALTER TABLE notifications ADD CONSTRAINT valid_notification_type CHECK (type = ANY (ARRAY[
  'nominated', 'nomination_approved', 'nominee_accepted', 'nominee_declined',
  'new_reward', 'prize_package', 'rank_change', 'vote_received',
  'event_posted', 'system_announcement', 'new_fan',
  'video_prompt', 'video_response',
  'vote_digest', 'bonus_awarded', 'bonus_rejected',
  'judge_invite', 'host_message'
]));
