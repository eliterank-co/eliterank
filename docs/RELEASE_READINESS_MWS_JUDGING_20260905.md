# Release-Readiness: Miss Woman Summer Judging Integrity & Three Named Winners

## 1. Executive Summary & Production Identity

- **Task ID:** `TASK-MWS-JUDGING-THREE-WINNERS-20260905`
- **Target Project Ref:** `jioblcflgpqcfdmzjnto` (EliteRank Legacy, live production)
- **Competition Identity:**
  - ID: `16276ff8-be5b-47c5-8178-2d463fb7dcc3`
  - Slug: `miss-woman-summer-chi-26`
  - Name: `Miss Woman Summer Chicago 2026`
- **Final Round Identity:**
  - ID: `85373939-f51b-48df-86ca-cbdaeca51663`
  - Title: Final Round (`round_type = judging`, `judge_weight = 100`)
  - Deadline: `2026-09-06T01:59:00Z` (8:59 p.m. CDT on September 5, 2026)
- **Crowned Placements:**
  - Exactly 3 winners: `Reina`, `Virreina`, `Princesa`

---

## 2. Preconditions

1. **Database Baseline:** Target database is Supabase project `jioblcflgpqcfdmzjnto`. Migration `20260811000000_120_finalize_last_round_crowning_and_gender_normalization.sql` is active.
2. **Forward-Only Migration:** Migration `supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql` is strictly additive. It does not alter or replace `finalize_voting_round` or historical migrations.
3. **Trigger Architecture:** The readiness barrier is implemented as a `BEFORE UPDATE OF finalized_at ON public.voting_rounds` trigger (`trg_check_judging_round_readiness`). If any readiness condition is not satisfied, it raises an exception which rolls back the entire finalization transaction, preserving the unfinalized state of the round and competition with zero partial mutations.
4. **Pure-Vote Invariant:** Pure-voting rounds (`judge_weight = 0` or `NULL`) are explicitly bypassed by the trigger guard, completely preserving existing vote-based competition behavior.

---

## 3. Post-Deploy Verification Queries (Run against `jioblcflgpqcfdmzjnto`)

### Verification 1: Confirm Schema & Trigger Installation
```sql
-- 1. Check winner_placement_labels column exists on competitions
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'competitions'
  AND column_name = 'winner_placement_labels';

-- 2. Check check_judging_round_readiness trigger is active on voting_rounds
SELECT trigger_name, event_manipulation, event_object_table, action_timing
FROM information_schema.triggers
WHERE trigger_name = 'trg_check_judging_round_readiness'
  AND event_object_table = 'voting_rounds';
```
*Expected: 1 row for column `winner_placement_labels` (ARRAY / text[]), 1 row for `trg_check_judging_round_readiness` (BEFORE UPDATE).*

### Verification 2: Confirm Miss Woman Summer Configuration
```sql
-- Check competition winner settings
SELECT
  id,
  name,
  number_of_winners,
  winner_placement_labels,
  status
FROM public.competitions
WHERE id = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
```
*Expected: `number_of_winners = 3`, `winner_placement_labels = {"Reina","Virreina","Princesa"}`.*

### Verification 3: Confirm Final Round Configuration
```sql
-- Check final round advancement and judging settings
SELECT
  id,
  competition_id,
  round_type,
  judge_weight,
  contestants_advance,
  finalized_at,
  end_date
FROM public.voting_rounds
WHERE id = '85373939-f51b-48df-86ca-cbdaeca51663';
```
*Expected: `judge_weight = 100`, `contestants_advance = 3`, `finalized_at IS NULL`, `end_date = 2026-09-06 01:59:00+00`.*

### Verification 4: Confirm 10 Bilingual Criteria
```sql
-- Check all 10 criteria were inserted with sort_order 1..10 and weight 1.00
SELECT
  sort_order,
  label,
  weight
FROM public.judging_criteria
WHERE competition_id = '16276ff8-be5b-47c5-8178-2d463fb7dcc3'
ORDER BY sort_order ASC;
```
*Expected: Exactly 10 rows, sort_order 1 through 10, all weights 1.00.*

---

## 4. Operational Pre-Flight Check (Run before 8:59 p.m. CDT)

Run this query ahead of tonight's deadline to monitor judging completion. The barrier will block finalization unless this query reports `readiness_status = 'READY_FOR_FINALIZATION'`.

```sql
WITH mws_data AS (
  SELECT
    '16276ff8-be5b-47c5-8178-2d463fb7dcc3'::uuid AS comp_id,
    '85373939-f51b-48df-86ca-cbdaeca51663'::uuid AS round_id
),
active_contestants AS (
  SELECT id FROM public.contestants
  WHERE competition_id = (SELECT comp_id FROM mws_data) AND status = 'active'
),
non_hidden_judges AS (
  SELECT id, name, user_id, claimed_at
  FROM public.judges
  WHERE competition_id = (SELECT comp_id FROM mws_data) AND hidden = false
),
criteria AS (
  SELECT id FROM public.judging_criteria
  WHERE competition_id = (SELECT comp_id FROM mws_data)
),
expected_matrix AS (
  SELECT
    j.id AS judge_id,
    ac.id AS contestant_id,
    c.id AS criterion_id
  FROM non_hidden_judges j
  CROSS JOIN active_contestants ac
  CROSS JOIN criteria c
)
SELECT
  (SELECT COUNT(*) FROM criteria) AS criteria_count,
  (SELECT COUNT(*) FROM non_hidden_judges) AS judges_count,
  (SELECT COUNT(*) FROM non_hidden_judges WHERE claimed_at IS NULL OR user_id IS NULL) AS unclaimed_judges_count,
  (SELECT COUNT(*) FROM active_contestants) AS active_contestants_count,
  (SELECT COUNT(*) FROM expected_matrix) AS expected_total_scores,
  COUNT(js.id) FILTER (WHERE js.submitted_at IS NOT NULL) AS submitted_scores,
  COUNT(js.id) FILTER (WHERE js.id IS NOT NULL AND js.submitted_at IS NULL) AS draft_scores,
  COUNT(*) FILTER (WHERE js.id IS NULL) AS missing_scores,
  CASE
    WHEN (SELECT COUNT(*) FROM criteria) = 0 THEN 'BLOCKED: No criteria'
    WHEN (SELECT COUNT(*) FROM non_hidden_judges) = 0 THEN 'BLOCKED: No judges'
    WHEN (SELECT COUNT(*) FROM non_hidden_judges WHERE claimed_at IS NULL OR user_id IS NULL) > 0 THEN 'BLOCKED: Unclaimed judge(s)'
    WHEN (SELECT COUNT(*) FROM active_contestants) = 0 THEN 'BLOCKED: No active contestants'
    WHEN COUNT(*) FILTER (WHERE js.id IS NULL) > 0 THEN 'BLOCKED: Missing scores'
    WHEN COUNT(js.id) FILTER (WHERE js.id IS NOT NULL AND js.submitted_at IS NULL) > 0 THEN 'BLOCKED: Unsubmitted draft scores'
    ELSE 'READY_FOR_FINALIZATION'
  END AS readiness_status
FROM expected_matrix em
LEFT JOIN public.judge_scores js
  ON js.voting_round_id = (SELECT round_id FROM mws_data)
 AND js.judge_id = em.judge_id
 AND js.contestant_id = em.contestant_id
 AND js.criterion_id = em.criterion_id;
```

---

## 5. Rollback & Forward-Fix Analysis

### Rollback Strategy:
- The migration is forward-only. If the barrier trigger needs to be temporarily deactivated in an emergency without rolling back data:
  ```sql
  DROP TRIGGER IF EXISTS trg_check_judging_round_readiness ON public.voting_rounds;
  ```
- Dropping the trigger returns finalization behavior to previous un-gated execution while preserving the configured criteria, round advancement settings, and winner labels.
- If placement labels need to be cleared:
  ```sql
  UPDATE public.competitions
  SET winner_placement_labels = NULL
  WHERE id = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
  ```
  The UI will automatically fall back to standard `1st`, `2nd`, `3rd` ordinal rank badges.

### Residual Risks:
- **Judge No-Show / Incomplete Scoring:** If a judge accepts an invite but fails to submit scores for all 13 contestants before 8:59 p.m. CDT, the barrier will block finalization. Host administrators can either:
  1. Have the judge submit their scoresheet; OR
  2. Mark the unresponsive judge `hidden = true` (which excludes them from the readiness calculation).
