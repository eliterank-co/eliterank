-- Gender-specific prizes: let a sponsor's reward target one gender.
--
-- Some competitions run winners split by gender (competitions.winners_split_by_gender):
-- one male winner + one female winner are crowned, and contestants already carry a
-- `gender`. In those competitions a host may want a prize to go to only the men or
-- only the women (e.g. "the male winner gets the watch, the female winner does not").
--
-- Recipient is already a sponsor-level decision (reward_recipient / reward_top_x_count,
-- migration 080), so the gender filter lives alongside it on `sponsors` rather than being
-- denormalized across prize rows. 'all' (the default) means no gender restriction, so
-- every existing sponsor is unaffected and normal (non-gender-split) competitions never
-- see or set anything other than 'all'.

ALTER TABLE sponsors
  ADD COLUMN IF NOT EXISTS recipient_gender VARCHAR(20) NOT NULL DEFAULT 'all';

ALTER TABLE sponsors DROP CONSTRAINT IF EXISTS sponsors_recipient_gender_check;
ALTER TABLE sponsors
  ADD CONSTRAINT sponsors_recipient_gender_check
  CHECK (recipient_gender IN ('all', 'male', 'female'));
