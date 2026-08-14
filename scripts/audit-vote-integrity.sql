-- audit-vote-integrity.sql — READ-ONLY vote reconciliation for one competition.
--
-- First used for the 2026-08-14 "votes didn't count" incident audit
-- (Who's Who: Singles Edition). Run in the Supabase SQL Editor; edit the
-- competition id in the params CTE of each statement. No writes anywhere.
--
-- What "clean" looks like:
--   1. Every row in query 1 has drift = 0 (contestant counters == ledger).
--   2. Query 2: comp_counter == recomputed_total. A positive difference means
--      competitions.total_votes was never decremented for removed contestants
--      or revoked bonus completions (observed drift on 2026-08-14: +745).
--   3. Query 3: paid_vote_rows == distinct_intents (payment_intent_id
--      idempotency held; every Stripe payment maps to exactly one vote row).

-- ── 1. Per-contestant: displayed counters vs recomputed ledger ─────────────
WITH params AS (SELECT '4d246aa1-97cc-4f44-8fbb-79fba52ac1ba'::uuid AS competition_id),
led AS (
  SELECT contestant_id,
         COALESCE(SUM(vote_count),0) AS ledger_total,
         COALESCE(SUM(vote_count) FILTER (WHERE payment_intent_id IS NOT NULL),0) AS paid,
         COALESCE(SUM(vote_count) FILTER (WHERE payment_intent_id IS NULL),0) AS free
  FROM votes WHERE competition_id = (SELECT competition_id FROM params) GROUP BY 1),
arc AS (SELECT contestant_id, COALESCE(SUM(vote_count),0) AS archived
        FROM archived_votes WHERE competition_id = (SELECT competition_id FROM params) GROUP BY 1),
bon AS (SELECT contestant_id, COALESCE(SUM(votes_awarded),0) AS bonus
        FROM bonus_vote_completions WHERE competition_id = (SELECT competition_id FROM params) GROUP BY 1),
man AS (SELECT contestant_id, COALESCE(SUM(vote_count),0) AS manual
        FROM manual_votes WHERE competition_id = (SELECT competition_id FROM params) GROUP BY 1)
SELECT c.name, c.gender, c.status,
       c.votes AS displayed_votes, c.lifetime_votes,
       COALESCE(led.free,0) AS free, COALESCE(led.paid,0) AS paid,
       COALESCE(arc.archived,0) AS archived, COALESCE(bon.bonus,0) AS bonus, COALESCE(man.manual,0) AS manual,
       c.lifetime_votes
         - (COALESCE(led.ledger_total,0)+COALESCE(arc.archived,0)+COALESCE(bon.bonus,0)+COALESCE(man.manual,0)) AS drift
FROM contestants c
LEFT JOIN led ON led.contestant_id = c.id
LEFT JOIN arc ON arc.contestant_id = c.id
LEFT JOIN bon ON bon.contestant_id = c.id
LEFT JOIN man ON man.contestant_id = c.id
WHERE c.competition_id = (SELECT competition_id FROM params)
ORDER BY abs(c.lifetime_votes
         - (COALESCE(led.ledger_total,0)+COALESCE(arc.archived,0)+COALESCE(bon.bonus,0)+COALESCE(man.manual,0))) DESC,
         c.lifetime_votes DESC;

-- ── 2. Competition-level counter vs recomputed total ───────────────────────
WITH params AS (SELECT '4d246aa1-97cc-4f44-8fbb-79fba52ac1ba'::uuid AS competition_id)
SELECT
  (SELECT total_votes FROM competitions WHERE id = (SELECT competition_id FROM params)) AS comp_counter,
  (SELECT COALESCE(SUM(vote_count),0) FROM votes WHERE competition_id = (SELECT competition_id FROM params))
  + (SELECT COALESCE(SUM(vote_count),0) FROM archived_votes WHERE competition_id = (SELECT competition_id FROM params))
  + (SELECT COALESCE(SUM(votes_awarded),0) FROM bonus_vote_completions WHERE competition_id = (SELECT competition_id FROM params))
  + (SELECT COALESCE(SUM(vote_count),0) FROM manual_votes WHERE competition_id = (SELECT competition_id FROM params)) AS recomputed_total,
  (SELECT COALESCE(SUM(votes),0) FROM contestants WHERE competition_id = (SELECT competition_id FROM params)) AS sum_contestant_counters;

-- ── 3. Paid votes vs Stripe payment intents ────────────────────────────────
WITH params AS (SELECT '4d246aa1-97cc-4f44-8fbb-79fba52ac1ba'::uuid AS competition_id)
SELECT count(*) AS paid_vote_rows,
       count(DISTINCT payment_intent_id) AS distinct_intents,
       COALESCE(SUM(vote_count),0) AS paid_vote_value,
       COALESCE(SUM(amount_paid),0) AS gross_amount,
       COALESCE(SUM(tax_amount),0) AS tax_collected,
       count(*) FILTER (WHERE receipt_sent_at IS NULL) AS receipts_missing
FROM votes
WHERE competition_id = (SELECT competition_id FROM params)
  AND payment_intent_id IS NOT NULL;
