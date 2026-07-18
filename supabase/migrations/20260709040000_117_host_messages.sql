-- =============================================================================
-- Host broadcasts — ledger + weekly rate limit
-- =============================================================================
-- Records every host → audience broadcast (see send-host-broadcast). Two jobs:
--   1. Enforce the once-per-week limit: the edge function refuses to send if a
--      row already exists for the competition within the last 7 days.
--   2. Give hosts a history of what they've sent (surfaced in the dashboard).
--
-- Rows are written only by the edge function (service role); RLS just governs
-- who can READ the history.
-- =============================================================================

CREATE TABLE IF NOT EXISTS host_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  audience TEXT NOT NULL CHECK (audience IN ('contestants', 'nominees', 'everyone')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_host_messages_competition
  ON host_messages(competition_id, created_at DESC);

ALTER TABLE host_messages ENABLE ROW LEVEL SECURITY;

-- The competition's primary host can read its broadcast history.
DROP POLICY IF EXISTS "host_messages_host_select" ON host_messages;
CREATE POLICY "host_messages_host_select" ON host_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM competitions c
    WHERE c.id = host_messages.competition_id AND c.host_id = auth.uid()
  ));

-- Co-hosts can read it too.
DROP POLICY IF EXISTS "host_messages_cohost_select" ON host_messages;
CREATE POLICY "host_messages_cohost_select" ON host_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM competition_co_hosts cch
    WHERE cch.competition_id = host_messages.competition_id AND cch.user_id = auth.uid()
  ));

-- Super admins can read/manage everything.
DROP POLICY IF EXISTS "host_messages_super_admin_all" ON host_messages;
CREATE POLICY "host_messages_super_admin_all" ON host_messages FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_super_admin = true
  ));
