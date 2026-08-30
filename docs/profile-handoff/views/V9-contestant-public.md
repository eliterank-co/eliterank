# V9 — Contestant public profile

| | |
| --- | --- |
| **Route** | `/o/[orgSlug]/c/[competitionSlug]/[contestantSlug]` |
| **Renders when** | Always — a public competition surface, not part of the member area |
| **Source** | `src/app/(public)/o/[orgSlug]/c/[competitionSlug]/[contestantSlug]/page.tsx`, `_rewards-section.tsx`; vote path via `src/components/vote/` |
| **Diagram** | [`V9-contestant-public.svg`](../assets/diagrams/V9-contestant-public.svg) |
| **Screenshot** | `IMG-V9-a` — not captured, see [assets](../assets/README.md) |
| **Findings** | [S6](../findings.md#s6--vote-modal-on-the-contestant-profile) |
| **Tests** | [`V9-contestant-public.spec.ts`](../tests/e2e/V9-contestant-public.spec.ts) |

## Why it is in this package

It is out of member-area scope but carries one item from the owner review: the
vote modal must appear here. Included so the finding has a home and a test
rather than sitting unowned between two packages.

`profile-vote-panel.tsx` is currently rendered by `/p/[voterId]`. This is a
different route with a different data path, so the panel's presence there proves
nothing about its presence here.

## Requirements

- **RQ-V9-1** A visitor on a contestant's page during an open voting round must
  be able to vote without navigating away.
- **RQ-V9-2** The vote affordance must be absent, or clearly disabled with a
  reason, outside an open round.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V9-01` | During an open voting round, a contestant's public page presents a working vote affordance. | S6 | `T-AC-V9-01` |
| `AC-V9-02` | Outside an open round the page shows no active vote control; any disabled state states why. | S6 | `T-AC-V9-02` |

## Notes

Marked **Verify** rather than Defect. Confirm against a live competition with
the flag on before filing an issue — the fix may be as small as mounting an
existing component.
