-- Move gender-specific prize targeting from sponsors → competition_prizes so a
-- single sponsor can offer a men-only prize AND a women-only prize (per-prize
-- rather than per-sponsor). Only meaningful in competitions that crown winners
-- split by gender (competitions.winners_split_by_gender). 'all' (the default)
-- means no restriction, so every existing prize is unaffected.
--
-- Expand phase of an expand/contract migration: the per-prize column is added
-- here; sponsors.recipient_gender (migration 113) is intentionally left in place
-- for now — it is vestigial (always 'all') once the per-prize code ships, and is
-- dropped in a later cleanup migration so no still-live code writes to a column
-- that has been removed mid-deploy.

ALTER TABLE competition_prizes
  ADD COLUMN IF NOT EXISTS recipient_gender VARCHAR(20) NOT NULL DEFAULT 'all';

ALTER TABLE competition_prizes DROP CONSTRAINT IF EXISTS competition_prizes_recipient_gender_check;
ALTER TABLE competition_prizes
  ADD CONSTRAINT competition_prizes_recipient_gender_check
  CHECK (recipient_gender IN ('all', 'male', 'female'));
