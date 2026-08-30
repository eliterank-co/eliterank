# V1 — Member dashboard

| | |
| --- | --- |
| **Route** | `/me` |
| **Renders when** | `social_profile` is **off** (the current production default) |
| **Source** | `src/app/(public)/(member)/me/page.tsx`, `_components/header.tsx`, `_components/tabs.tsx`, `layout.tsx` |
| **Data** | `getVoterStats`, `getMyVoteHistory`, `listMyOrgs`, `listCompetitions`, `getVoterWelcomeVisibility` |
| **Diagram** | [`V1-me-dashboard.svg`](../assets/diagrams/V1-me-dashboard.svg) |
| **Screenshot** | `IMG-V1-a` — not captured, see [assets](../assets/README.md) |
| **Findings** | [D1](../findings.md#d1--gold-member-is-hardcoded-for-every-member), [D2](../findings.md#d2--active-wins-is-hardcoded-to-zero-for-non-hosts), [D3](../findings.md#d3--markets-watched-counts-something-else), [S3](../findings.md#s3--profile-icon-size-and-alignment) |
| **Tests** | [`V1-me-dashboard.spec.ts`](../tests/e2e/V1-me-dashboard.spec.ts) |

## What it does today

An identity strip (avatar, display name, email, a "Gold member" badge), a tab
bar, then four stat tiles, an optional host call-to-action, three quick actions,
a live-markets snapshot and recent vote activity.

**This is not a profile.** It shows no bio, gallery, socials, interests or
fans. The read view of your own profile does not exist anywhere under `/me` on
this path — `/me/profile` is an editor, and the only profile *view* in v2 is the
crossover port at `/profile`.

## Requirements

- **RQ-V1-1** Every stat tile must show a real value or not render. (REQ-08)
- **RQ-V1-2** Every stat label must name the quantity actually counted. (REQ-09)
- **RQ-V1-3** A tile must not change which metric it shows based on role. If
  hosts need an org count, that is its own tile.
- **RQ-V1-4** Tier must come from a tier model or be absent. There is no tier
  model today.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V1-01` | No hardcoded tier string renders anywhere on `/me`. Neither the stat tile nor the header badge asserts a tier unless a tier model supplies it. | D1 | `T-AC-V1-01` |
| `AC-V1-02` | A member with at least one crowned entry sees that count, not `0`. | D2 | `T-AC-V1-02` |
| `AC-V1-03` | The wins tile shows the same number as the v3 hero's Crowns count for the same member. | D2 | `T-AC-V1-03` |
| `AC-V1-04` | The watch-count tile either reads "Competitions voted in", or its value equals `listMyWatching(...).length` — the same number `/me/watching` shows. | D3 | `T-AC-V1-04` |
| `AC-V1-05` | No tile label changes meaning between a host and a non-host viewing the same page. | D2 | `T-AC-V1-05` |

## Notes

`D1`–`D3` **cannot reproduce with the flag on** — this page never renders on
that path. Any bug report against them must state the flag state (REQ-03).
