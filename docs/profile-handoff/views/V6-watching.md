# V6 — Watch list

| | |
| --- | --- |
| **Route** | `/me/watching` |
| **Source** | `me/watching/page.tsx` ← `src/lib/data/watching.ts` (`listMyWatching`, keyed by lowercased email) |
| **Findings** | [R8](../findings.md#r8--markets-watched-counts-something-else) (shared with V1) |
| **Tests** | [`V6-watching.spec.ts`](../tests/e2e/V6-watching.spec.ts) |

## What it does today

Lists `notify_me_subscriptions` for the member's email. This list is the
ground truth for "watching"; three other surfaces show a watching number —
the dashboard stat tile (wrong source, R8), the dashboard quick action
(correct), and the profile hero's owner-only Watching count (correct,
`page-v3.tsx:34,85`).

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V6-01` | Every surface that shows a watching count agrees with this list's length: stat tile (or renamed), quick action, hero count. | R8 | `T-AC-V6-01` |
| `AC-V6-02` | **Guard:** a member whose auth email contains uppercase still sees their watch list — the seeded rows actually render, not merely "no error" (lowercasing stays inside the loader). | — | `T-AC-V6-02` (mixed-case fixture + its known watch count) |
