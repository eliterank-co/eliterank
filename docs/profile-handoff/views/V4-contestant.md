# V4 — Contestant self-service

| | |
| --- | --- |
| **Route** | `/me/contestant` (tab appears only for a claimed contestant) |
| **Renders when** | Both paths — the page itself never checks the flag. Only its **tab** is flag-gated: with the flag on, the layout drops the tab bar and the route is reachable by direct URL only. |
| **Source** | `src/app/(public)/(member)/me/contestant/{page.tsx,_form.tsx}`, `src/lib/contestant-guards.ts`, `src/lib/data/contestants.ts` |
| **Diagram** | [`V4-contestant.svg`](../assets/diagrams/V4-contestant.svg) |
| **Screenshot** | `IMG-V4-a` — not captured, see [assets](../assets/README.md) |
| **Findings** | [G4](../findings.md#g4--achievement-tier-framing-is-gone) |
| **Tests** | [`V4-contestant.spec.ts`](../tests/e2e/V4-contestant.spec.ts) |

## What it does today

Header naming the contestant, a stats panel, then an editor. Single-competition
contestants get three stats — Lifetime votes, Placement `#n`, Status
(Active / Eliminated). Multi-competition contestants get one row per competition
with votes, rank, status and an external link.

The editor covers display name, bio (400), avatar, cover and four social
handles, and its placeholders read "@yourhandle **or full URL**". Slug is
read-only — the host owns URL stability. Edits broadcast across every
competition the contestant is in, which the page states explicitly.

## Requirements

- **RQ-V4-1** A contestant's standing must be expressed as the tier they reached,
  not only a raw placement integer.
- **RQ-V4-2** An eliminated contestant keeps the tier they earned. Elimination
  is a stopping point, not an erasure.
- **RQ-V4-3** Social-handle acceptance here and in V3 must be identical.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V4-01` | A contestant who survived a capped round sees that tier label ("Top 50 Contestant"), derived from `contestants_advance` on the surviving round. | G4 | `T-AC-V4-01` |
| `AC-V4-02` | An eliminated contestant retains the tier label they reached; "Eliminated" never appears as the only descriptor of their result. | G4 | `T-AC-V4-02` |
| `AC-V4-03` | Multi-competition contestants see the tier per competition, not a single aggregate. | G4 | `T-AC-V4-03` |
| `AC-V4-04` | A social value accepted here is accepted at `/me/profile`. | P1 | `T-AC-V3-03` (shared) |

## Notes

`src/components/contestants/tier-badge.tsx` already exists and is used elsewhere.
`AC-V4-01` is a wiring task, not a new component. The derivation to mirror is in
legacy `ProfileView.jsx:190-207`.
