# V5 — Votes, transactions and history

| | |
| --- | --- |
| **Routes** | `/me/votes`, `/me/transactions`, `/me/history` |
| **Renders when** | `social_profile` **off** (tab bar); `/me/history` is also linked from the v3 hero counts |
| **Source** | `src/app/(public)/(member)/me/{votes,transactions,history}/`, `src/lib/data/{voter.ts,voter-history.ts}` |
| **Diagram** | [`V5-vote-records.svg`](../assets/diagrams/V5-vote-records.svg) |
| **Screenshot** | `IMG-V5-a`, `IMG-V5-b`, `IMG-V5-c` — not captured, see [assets](../assets/README.md) |
| **Findings** | [P3](../findings.md#p3--competition-history-omits-hosting-entirely), [X3](../findings.md#x3--votes-cast-and-votes-received-belong-in-one-ledger), [D3](../findings.md#d3--markets-watched-counts-something-else) |
| **Tests** | [`V5-vote-records.spec.ts`](../tests/e2e/V5-vote-records.spec.ts) |

## What it does today

Three routes over substantially the same rows.

- **`/me/votes`** — every contestant voted for, in order, with links onward.
- **`/me/transactions`** — the same `getMyVoteHistory` rows filtered to
  `amountPaidCents > 0`, plus two summary tiles. Framed as a vote ledger, not a
  card statement.
- **`/me/history`** — competitions participated in, grouped by year, from
  `votes` and `notify_me_subscriptions`. History lost its tab in the current nav
  and is reachable from a link on `/me/votes`.

Votes *received* do not exist as a concept anywhere in the codebase.

## Requirements

- **RQ-V5-1** History must reflect every way a member participates, including
  hosting.
- **RQ-V5-2** Each history entry must carry the member's role in that
  competition, so hosted, competed and voted are distinguishable.
- **RQ-V5-3** Paid status is an attribute of a vote, not a separate surface.
- **RQ-V5-4** If votes received are added, the privacy of the voter's identity
  is an explicit decision recorded before build. (REQ-14 neighbours this.)

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V5-01` | A host who has run at least one competition sees it in `/me/history`. | P3 | `T-AC-V5-01` |
| `AC-V5-02` | Each history entry displays the member's role, and a member who both hosted and voted in the same competition sees it once with both roles. | P3 | `T-AC-V5-02` |
| `AC-V5-03` | Votes cast and paid records are reachable from one surface, with paid as a filter rather than a separate route. | X3 | `T-AC-V5-03` |
| `AC-V5-04` | A written scope exists for votes received: fields, ordering, and whether voter identity is shown to the contestant. | X3 | Manual — [checklist](../tests/manual/verification-checklist.md) |
| `AC-V5-05` | Any consolidation preserves the existing framing that paid records are a vote ledger, not a card statement. | X3 | `T-AC-V5-05` |

## Notes

`D3` is listed here as well as on V1 because the consolidation in `X3` touches
the same counts. Fixing the label on V1 without reconciling it against
`listMyWatching` will re-diverge.
