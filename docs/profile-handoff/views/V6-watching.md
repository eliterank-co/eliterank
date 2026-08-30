# V6 — Watch list

| | |
| --- | --- |
| **Route** | `/me/watching` |
| **Renders when** | `social_profile` **off** (tab bar); the count also feeds the v3 hero |
| **Source** | `src/app/(public)/(member)/me/watching/page.tsx`, `src/lib/data/watching.ts` |
| **Diagram** | [`V6-watching.svg`](../assets/diagrams/V6-watching.svg) |
| **Screenshot** | `IMG-V6-a` — not captured, see [assets](../assets/README.md) |
| **Findings** | [D3](../findings.md#d3--markets-watched-counts-something-else) |
| **Tests** | [`V6-watching.spec.ts`](../tests/e2e/V6-watching.spec.ts) |

## What it does today

Saved markets and contestants, keyed on the member's lowercased email via
`listMyWatching`, with a phase tint per row and an empty state. This is the
authoritative watch list; the v3 hero's "Watching" count reads from the same
function.

## Requirements

- **RQ-V6-1** This page and every watch count elsewhere in the app must read
  from one source.
- **RQ-V6-2** The lookup key is the member's email, lowercased — any new caller
  must normalise identically or silently return an empty list.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V6-01` | The row count here equals every "watching" count shown elsewhere for the same member — the v3 hero, and the V1 tile once `AC-V1-04` is satisfied. | D3 | `T-AC-V6-01` |
| `AC-V6-02` | A member whose email differs in case between auth and subscription records still sees their saved markets. | — (regression guard) | `T-AC-V6-02` |

## Notes

`AC-V6-02` guards an existing normalisation. It is worth an explicit test
because the failure mode is silent: a case mismatch returns an empty list rather
than an error, which reads as "nothing saved".
