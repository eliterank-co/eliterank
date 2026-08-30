# V9 — Contestant public profile

| | |
| --- | --- |
| **Route** | `/o/[orgSlug]/c/[competitionSlug]/[contestantSlug]` |
| **Source** | that route's `page.tsx` + `vote-cta.tsx` |
| **Findings** | none open — the prior "verify" item (old S6) is resolved: the page carries its own `ContestantVoteCta` |
| **Tests** | [`V9-contestant-public.spec.ts`](../tests/e2e/V9-contestant-public.spec.ts) |

## Why it stays in the packet

Two vote paths now exist per contestant — this page's CTA and the profile's
`ProfileVoteModule` — and future work on either could orphan the other. One
guard criterion keeps them both alive.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V9-01` | **Guard (expected green at `c2f45dd` — verified in source, unrun):** during a live round, a visitor on the contestant page has a working vote affordance, and the profile's live-round module links to this page. | — | `T-AC-V9-01` |
