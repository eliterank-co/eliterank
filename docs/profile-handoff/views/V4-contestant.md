# V4 — Contestant self-service

| | |
| --- | --- |
| **Route** | `/me/contestant` (dashboard-experience tab; under the profile experience the tab bar is gone and the route is reached via the avatar menu's "My contestant hub" — see R3) |
| **Source** | `src/app/(public)/(member)/me/contestant/page.tsx` |
| **Findings** | [R18](../findings.md#r18--the-contestant-tab-still-reads-eliminated-as-the-whole-story) |
| **Tests** | [`V4-contestant.spec.ts`](../tests/e2e/V4-contestant.spec.ts) |

## What it does today

Per claimed contestant entry: lifetime votes, `Placement #n`, and a binary
status — `Active` or `Eliminated` (page.tsx:175-182). Meanwhile the profile's
track record renders the same result as WINNER/2ND/3RD/TOP 5/TOP 10/FINALIST
with tier rings. The self-service view is the only member surface that still
says "Eliminated" with no achievement context; `tier-badge.tsx` exists and is
unused here.

## Requirements

- **RQ-V4-1** One achievement ladder across the product: this tab and the
  track record derive labels from the same function, so the same result never
  reads differently on two member surfaces.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V4-01` | An eliminated contestant's entry shows the achievement label for how far they got; "Eliminated" never appears as the entire status. | R18 | `T-AC-V4-01` |
| `AC-V4-02` | The label shown here equals the track record's label for the same entry (shared derivation, unit-proven). | R18 | `T-AC-V4-02` (unit, contract-first) |

## Notes

The ladder itself is being corrected under R11 (`AC-V8-07`) — land that
decision first, then point this tab at the shared function.
