# V5 — Votes, transactions, history

| | |
| --- | --- |
| **Routes** | `/me/votes`, `/me/transactions`, `/me/history` |
| **Source** | `me/votes/page.tsx`, `me/transactions/page.tsx` (`getMyVoteHistory(...).filter(paid)`), `me/history/page.tsx` (`getMyCompetitionHistory`) |
| **Data** | `src/lib/data/voter.ts`, `src/lib/data/voter-history.ts` |
| **Findings** | [R12](../findings.md#r12--competition-history-omits-hosting), [R16](../findings.md#r16--votes-cast-and-votes-received-belong-in-one-ledger) |
| **Tests** | [`V5-vote-records.spec.ts`](../tests/e2e/V5-vote-records.spec.ts) |

## What it does today

Three pages over two datasets: votes cast (full list; transactions = the same
list filtered to paid), and competition history (voted + watching — no
hosting, R12). Votes *received* exist nowhere in the member area even though
the profile now shows per-entry totals.

## Requirements

- **RQ-V5-1** History covers every relationship the member has to a
  competition — voted, watched, competed, hosted — with the role visible.
- **RQ-V5-2** One ledger surface once R16 is decided; paid is a filter, not a
  page.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V5-01` | A member who has hosted sees those competitions in `/me/history` with a host role marker (or the page is folded into the track record and redirects). | R12 | `T-AC-V5-01` |
| `AC-V5-02` | After the R16 decision: cast and received render on one surface, paid status as a filter; `/me/transactions` redirects or is re-scoped. | R16 | `T-AC-V5-02` |
| `AC-V5-03` | The votes-received scope is written: who voted, for which entry, when, and whether voter identity is ever shown to the contestant. | R16 | Manual |
