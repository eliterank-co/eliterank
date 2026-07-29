-- =============================================================================
-- MIGRATION 119: Prevent competition re-entry by the same account
-- =============================================================================
-- The only guard against re-entering a competition was the case-insensitive
-- unique index on (competition_id, LOWER(email)) from migration 036. That keys
-- off the *email*, not the account — so a logged-in user who already entered
-- could re-enter by editing their email slightly on the entry form (their
-- user_id stayed the same, but the new email dodged the email index and a
-- second nominee row was inserted).
--
-- This migration makes identity the guard: at most one *active* self-entry per
-- (competition_id, user_id). "Active" excludes rejected entries — a rejected
-- entry is void and shouldn't block the person from entering again.
--
-- The RLS insert policy on nominees is WITH CHECK (true), so the client can
-- insert arbitrary rows; a database-level unique index is the only authoritative
-- backstop. The client flow (useEntryFlow) also blocks re-entry up front and
-- locks the email field for logged-in users, but this index is what makes a
-- duplicate impossible regardless of code path.
-- =============================================================================

-- ── Clean up two pre-existing duplicates that this bug already produced ───────
-- Both are stale, unpromoted (not contestants) and have no reward_assignments,
-- so removing them is a clean delete. Guarded by id + state so the statement is
-- a no-op on any database where these specific rows don't exist.
--
-- 1) "Elite Rank": info@eliterank.co (kept) vs info@eliterank.c (stray, never
--    completed — stuck at the details stage, unclaimed).
DELETE FROM nominees
WHERE id = 'a8800596-f4f2-4d61-842f-bc86b762c3d4'
  AND nominated_by = 'self'
  AND claimed_at IS NULL;

-- 2) "Evan Handler": ameerakashe@gmail.com (kept, earlier) vs
--    evan.handler@gmail.com (later duplicate of the same account).
DELETE FROM nominees
WHERE id = '400f5984-c98a-4c04-8e00-f2744d6a9175'
  AND nominated_by = 'self';

-- NOTE: A third duplicate ("Jeff Samuel") is intentionally left untouched — both
-- of that account's rows were promoted to contestants, so choosing the canonical
-- one is a manual, data-sensitive decision. The partial index below tolerates it
-- because one of the two rows is already `rejected` (and thus excluded).

-- ── Authoritative backstop: one active self-entry per account per competition ─
CREATE UNIQUE INDEX IF NOT EXISTS idx_nominees_one_self_entry_per_user
  ON nominees (competition_id, user_id)
  WHERE user_id IS NOT NULL
    AND nominated_by = 'self'
    AND status <> 'rejected';

COMMENT ON INDEX idx_nominees_one_self_entry_per_user IS
  'Enforces at most one active (non-rejected) self-entry per (competition, user). Prevents re-entry via an edited email. Added in migration 119.';
