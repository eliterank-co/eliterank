-- =============================================================================
-- Migration: per-competition fan digest schedule ledger
-- =============================================================================
-- The weekly fan digest used to be a single platform-wide send: one GitHub
-- Actions cron at 10 AM America/Chicago, every competition at once, regardless
-- of where its audience actually lives. This ledger is what lets each
-- competition send at 10 AM in ITS OWN timezone instead.
--
-- Because competitions now become due at different UTC hours, the workflow has
-- to run hourly and ask "who is due right now?". That makes exactly-once
-- delivery the ledger's job, not the cron's: one row per (competition, local
-- send week). A competition is skipped once its row is completed, so an extra
-- hourly tick, a re-run, or a delayed run cannot double-send a fan.
--
-- next_offset also makes a partial send resumable: an interrupted run records
-- how far into that competition's recipient queue it got, and the next
-- invocation picks up there rather than re-emailing everyone from the top.
-- =============================================================================

CREATE TABLE IF NOT EXISTS fan_digest_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,

  -- The competition-LOCAL Friday this send belongs to. Local, not UTC: it is
  -- what makes "one digest per competition per week" mean the same thing for a
  -- competition in Vancouver and one in Toronto.
  week_start DATE NOT NULL,

  -- Resolved IANA zone used for this send, recorded so a later timezone change
  -- (or a city correction) does not make past rows unexplainable.
  timezone TEXT NOT NULL,

  -- Cursor into that competition's recipient queue; resume point after an
  -- interrupted run.
  next_offset INTEGER NOT NULL DEFAULT 0,

  recipients INTEGER,
  sent INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,

  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,

  -- The exactly-once guarantee.
  CONSTRAINT fan_digest_sends_competition_week_key UNIQUE (competition_id, week_start)
);

-- "Which competitions still owe a digest this week?" — the hourly hot path.
CREATE INDEX IF NOT EXISTS idx_fan_digest_sends_pending
  ON fan_digest_sends(week_start, competition_id)
  WHERE completed_at IS NULL;

ALTER TABLE fan_digest_sends ENABLE ROW LEVEL SECURITY;

-- Writes are service-role only (the edge function). No policy grants INSERT or
-- UPDATE to anon/authenticated, so the ledger cannot be tampered with from a
-- browser — a forged "completed" row would silently suppress a competition's
-- entire weekly send.

-- Hosts and co-hosts can read their own competition's send history, so the
-- dashboard can show when the last digest went out. Mirrors email_logs.
DROP POLICY IF EXISTS "fan_digest_sends_host_select" ON fan_digest_sends;
CREATE POLICY "fan_digest_sends_host_select" ON fan_digest_sends FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM competitions
      WHERE competitions.id = fan_digest_sends.competition_id
        AND competitions.host_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM competition_co_hosts cch
      WHERE cch.competition_id = fan_digest_sends.competition_id
        AND cch.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.is_super_admin = true
    )
  );

COMMENT ON TABLE fan_digest_sends IS
  'One row per competition per local send-week. Guarantees the weekly fan digest is delivered exactly once per competition even though the dispatcher now runs hourly to honour per-competition timezones.';
