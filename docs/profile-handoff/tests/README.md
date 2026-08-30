# Tests

Acceptance coverage for the findings in this package. Every test is named for
the criterion it proves: `T-AC-V3-01` proves `AC-V3-01`.

## These files target `eliterank-app`, not this repo

The code under test lives in `eliterank-co/eliterank-app`. Copy them across:

| Here | Destination in `eliterank-app` |
| --- | --- |
| `unit/social-handle.test.ts` | `src/lib/actions/__tests__/social-handle.test.ts` |
| `e2e/_fixtures.ts` | `e2e/_fixtures.ts` |
| `e2e/V*.spec.ts` | `e2e/` |

`eliterank-app` already runs Vitest (`vitest.config.ts`) and Playwright
(`playwright.config.ts`), so nothing new needs installing.

## Three tiers, three levels of readiness

**`unit/` — runnable today.** Pure validation logic, no session, no flag. This
is the highest-value coverage in the package: `P1` is entirely a validation
bug, so it can be proven and fixed without any test infrastructure.

**`e2e/` — needs a signed-in session.** Playwright specs against a real
environment. They need `storageState` for an authenticated member and, for
several views, seeded fixture data (a member who has hosted, an eliminated
contestant, a member with fans). See *Preconditions* below.

**`manual/` — needs a person.** Visual judgement, and the criteria that are
satisfied by a written decision rather than by code.

## Expected state: most of these fail

These are acceptance tests for findings that are **not yet fixed**. A failing
run is the correct starting state — that is what makes them useful for
verification. Specs covering unfixed findings are marked `test.fixme` so a CI
run stays green until the fix lands; remove the marker as part of the fix.

Two exceptions, marked `test()` and expected to pass now — they guard behaviour
that is currently correct and could regress under a nearby fix:

- `T-AC-V2-05` / `T-AC-V8-07` — the owner-only Watching count must not leak onto
  the public profile.
- `T-AC-V6-02` — email case normalisation in the watch-list lookup.

## Flag discipline

Every spec sets `ui_override` explicitly rather than inheriting ambient state
(REQ-18). `withFlag('on' | 'off')` in `_fixtures.ts` does this. A spec that does
not set it is a bug in the spec.

- V1, V4, V5, V6, V7 → flag **off**
- V2, V8 → flag **on**
- V3, V9 → either; specs run both

## Preconditions

E2E specs need fixture accounts. Name them in `e2e/_fixtures.ts` rather than
hardcoding ids in specs:

| Fixture | Needs |
| --- | --- |
| `MEMBER_PLAIN` | signed-in member, no org, some votes |
| `MEMBER_HOST` | belongs to an organization with at least one run competition |
| `MEMBER_WINNER` | at least one crowned entry |
| `MEMBER_CONTESTANT_ACTIVE` | claimed contestant in an open round |
| `MEMBER_CONTESTANT_OUT` | claimed contestant, eliminated after surviving a capped round |
| `MEMBER_WITH_FANS` | at least one fan and several timeline events |

Do not point these at real production members — several specs write profile
fields.

## Running

```bash
# unit — no session, no flag, runnable immediately
pnpm vitest run src/lib/actions/__tests__/social-handle.test.ts

# e2e — needs BASE_URL and an authenticated storageState
pnpm playwright test e2e/V3-profile-editor.spec.ts
pnpm playwright test            # everything
```

## Coverage map

See [`../traceability.md`](../traceability.md) for the full finding → criterion
→ test matrix.
