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

## 5. Protected Production Operations & Fail-Closed Incident Recovery

### 5.1 Mandatory Identity Verification Gate
Every production database interaction or operational intervention on live production MUST be preceded by freshly proving the project identity. Under no circumstances may any command or script be executed against an unverified or ambiguous endpoint.

Before executing any write query, run this identity proof:
```sql
SELECT
  current_database() AS database,
  current_user AS db_user,
  'jioblcflgpqcfdmzjnto' AS expected_project_ref,
  'EliteRank' AS expected_project_name;
```
Verify that the active connection explicitly targets project `jioblcflgpqcfdmzjnto` (EliteRank).

### 5.2 Protected Operations Policy
All write actions on live production are strictly **Protected Operations** requiring:
1. Explicit written authorization from owner `guillermovillegas` and the competition host.
2. Verified project ref `jioblcflgpqcfdmzjnto`.
3. An audit trail of the decision and action taken.

The following operations are classified as Protected Operations:
- **Migration Application:** Applying `20260905000000_mws_judging_readiness_and_placement_labels.sql`.
- **Judge Management:** Inviting judges, revoking invites, or setting `hidden = true` on any judge.
- **Schedule Changes:** Extending the round deadline or placing a competition hold.
- **Placement Labels:** Modifying or resetting `winner_placement_labels`.
- **Round Finalization / Re-finalization:** Invoking `finalize_voting_round`.

### 5.3 Operational Invariant: Fail-Closed Protection
The readiness barrier trigger `trg_check_judging_round_readiness` is strictly fail-closed by design. It aborts and rolls back any transaction attempting to finalize a round with `judge_weight > 0` unless all criteria exist, all active judges are claimed, and every judge has submitted all scores. Under no circumstances may the trigger be dropped or disabled during an incident, as doing so removes the barrier and causes silent score truncation or unranked winners.

### 5.4 Diagnostic Hints & Incident Recovery Scenarios

When finalization is blocked, the trigger raises a PostgreSQL exception with a specific diagnostic `HINT`. Use the exact diagnostic hint to identify the cause:

1. **`incomplete_score_matrix` (Missing Judge Scores):**
   - **Trigger Diagnostic:** `HINT = 'incomplete_score_matrix'`
   - **Symptom:** Exception: `Judging readiness barrier: round % is missing % required score(s) across active judges, contestants, and criteria`.
   - **Protected Decision & Action:**
     - **Action A (Preferred):** Contact the assigned judge to complete and submit their scoresheet before the deadline. Once submitted, re-trigger finalization.
     - **Action B (Absent / No-Show Judge — Requires Host Written Approval):** If a judge is confirmed absent/unreachable and the host officially determines the competition will proceed with the remaining judges, the host/owner must explicitly approve marking that specific judge as hidden:
       ```sql
       -- REQUIRES OWNER & HOST AUTHORIZATION
       -- Verify project ref: jioblcflgpqcfdmzjnto
       UPDATE public.judges
       SET hidden = true
       WHERE id = '<unresponsive_judge_id>'
         AND competition_id = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
       ```
       Setting `hidden = true` auditably removes that judge from the required matrix calculation while preserving all historical records. Finalization can then proceed safely with the remaining claimed judges.

2. **`unsubmitted_draft_scores` (Unsubmitted Draft Scores):**
   - **Trigger Diagnostic:** `HINT = 'unsubmitted_draft_scores'`
   - **Symptom:** Exception: `Judging readiness barrier: round % has % unsubmitted draft score(s)`.
   - **Protected Decision & Action:**
     - The judge entered scores but has not clicked "Submit".
     - Have the judge click "Submit Scores" to set `submitted_at = NOW()`.
     - Once all draft scores are submitted, re-trigger finalization.

3. **`unclaimed_judges` (Unclaimed Judge Invitation):**
   - **Trigger Diagnostic:** `HINT = 'unclaimed_judges'`
   - **Symptom:** Exception: `Judging readiness barrier: competition % has % unclaimed active judge(s)`.
   - **Protected Decision & Action:**
     - An invited judge has `claimed_at IS NULL` or `user_id IS NULL`.
     - **Action A:** Have the judge log in via their invite link to claim their seat.
     - **Action B (Unused Invite — Requires Host Written Approval):** If the invite was abandoned or sent in error, the host/owner must explicitly approve marking that specific unclaimed judge record as hidden:
       ```sql
       -- REQUIRES OWNER & HOST AUTHORIZATION
       -- Verify project ref: jioblcflgpqcfdmzjnto
       UPDATE public.judges
       SET hidden = true
       WHERE id = '<unclaimed_judge_id>'
         AND competition_id = '16276ff8-be5b-47c5-8178-2d463fb7dcc3'
         AND (claimed_at IS NULL OR user_id IS NULL);
       ```

4. **`judging_criteria_missing` (No Criteria Configured):**
   - **Trigger Diagnostic:** `HINT = 'judging_criteria_missing'`
   - **Symptom:** Exception: `Judging readiness barrier: competition % has no judging criteria configured`.
   - **Action:** The 10 bilingual criteria must be installed via migration `20260905000000_mws_judging_readiness_and_placement_labels.sql`.

5. **`judges_missing` (No Judges Configured):**
   - **Trigger Diagnostic:** `HINT = 'judges_missing'`
   - **Symptom:** Exception: `Judging readiness barrier: competition % has no active (non-hidden) judges`.
   - **Action:** At least one non-hidden judge must be assigned and claimed.

6. **Podium Placement Labels Adjustment (Protected Operation):**
   - If placement titles need adjustment, execute only with explicit host/owner approval:
     ```sql
     -- REQUIRES OWNER & HOST AUTHORIZATION
     -- Verify project ref: jioblcflgpqcfdmzjnto
     UPDATE public.competitions
     SET winner_placement_labels = ARRAY['Reina', 'Virreina', 'Princesa']
     WHERE id = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
     ```
   - Labels must satisfy the `validate_placement_labels` constraint: cardinality $\le$ `number_of_winners`, non-empty trimmed strings, no empty or duplicate elements.
   - If set to `NULL`, the UI automatically falls back to standard `1st`, `2nd`, `3rd` ordinal rank badges.
