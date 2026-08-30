# V1 — Member dashboard (classic experience)

| | |
| --- | --- |
| **Route** | `/me`, when the dashboard experience renders (see [requirements](../requirements.md) §1) |
| **Source** | `src/app/(public)/(member)/me/page.tsx`, `_components/header.tsx` |
| **Data** | `getVoterStats`, `getMyVoteHistory`, `listMyOrgs`, `listMyWatching`, `listCompetitions` |
| **Findings** | [R6](../findings.md#r6--gold-member-is-hardcoded-for-every-member), [R7](../findings.md#r7--active-wins-is-hardcoded-to-zero-for-non-hosts), [R8](../findings.md#r8--markets-watched-counts-something-else) |
| **Tests** | [`V1-me-dashboard.spec.ts`](../tests/e2e/V1-me-dashboard.spec.ts) |

## What it does today

Welcome header, a 2×4 stat grid (Votes cast · Markets watched · Active
wins/Orgs owned · Member tier), a host invitation card, quick actions
(discover / main card / watch list), live-markets snapshot, and recent vote
activity. The member-area header above it carries a "♔ Gold member" badge.

Three of the four stat tiles are wrong for someone: tier is a literal
(R6), wins are a literal `'0'` for non-hosts (R7), and "Markets watched"
counts competitions voted in (R8). The quick-action watch count is real —
the two can disagree on the same screen.

## Requirements

- **RQ-V1-1** Every stat renders a real number from a named source, or the
  tile is omitted (REQ-07).
- **RQ-V1-2** Tile labels are stable across roles; a host gets an added tile,
  not a redefined one.
- **RQ-V1-3** Counts shown on this page agree with the pages they link to.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V1-01` | No hardcoded tier renders anywhere on `/me` or in the member-area header. Either a derived tier that names its derivation, or no tier element. | R6 | `T-AC-V1-01` |
| `AC-V1-02` | A member with crowned entries sees their real win count; a member without sees a real zero or no tile — never a literal. | R7 | `T-AC-V1-02` |
| `AC-V1-03` | The wins number equals the profile experience's Crowns count for the same member (both derive from `loadPerformance`). | R7 | `T-AC-V1-03` |
| `AC-V1-04` | The watch tile matches `/me/watching`'s list length, or is renamed to name what it counts. | R8 | `T-AC-V1-04` |
| `AC-V1-05` | The non-host stat-label set is a subset of the host set: a host may gain an additive host-only tile, but no shared tile is renamed or redefined by role (RQ-V1-2). | R7 | `T-AC-V1-05` |
