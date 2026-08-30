# Tests

Acceptance coverage for the findings in this package. Every test is named for
the criterion it proves: `T-AC-V2-01` proves `AC-V2-01`.

**Honesty note:** nothing in this packet has been executed — this audit ran
from source with no credentials and no seeded environment. Wherever a test is
called "expected green at `c2f45dd`", that means: verified against source,
unrun. No test here is claimed green from an actual run.

## These files target `eliterank-app`, not the repo this packet lives in

| Here | Destination in `eliterank-app` |
| --- | --- |
| `unit/social-handle.test.ts` | `src/lib/actions/social-handle.acceptance.unit.test.ts` |
| `unit/track-record-labels.test.ts` | `src/lib/data/track-record-labels.acceptance.unit.test.ts` |
| `unit/share-card-fallback.test.ts` | `src/components/share/share-card-fallback.acceptance.unit.test.ts` |
| `unit/dead-components.test.ts` | `src/components/profile/dead-components.acceptance.unit.test.ts` |
| `unit/light-theme-tokens.test.ts` | `src/app/light-theme-tokens.acceptance.unit.test.ts` |
| `e2e/_fixtures.ts` | `e2e/profile-acceptance/_fixtures.ts` |
| `e2e/V*.spec.ts` | `e2e/profile-acceptance/` |

The app already runs Vitest and Playwright; nothing new needs installing.
Note the app's convention is `*.unit.test.ts` colocated with sources — the
destinations above follow it.

## Experience selection (REQ-01)

Specs never encode the switching mechanism. `_fixtures.ts` exposes

```ts
selectExperience(context, baseURL, 'profile' | 'dashboard')
```

as a thin delegation to the **app-owned** helper. The app ships the
profile-side seam today (`e2e/helpers/ui-flags.ts` exports
`enableUiSurfaces(context, baseURL, surfaces)`); `_fixtures.ts` wraps it and
is the single place to update if the app team changes the mechanism.

**The dashboard side is an app-owned TODO this suite depends on:** no
off-selection helper exists yet, and `_fixtures.ts` deliberately does not
inline one — every dashboard-experience spec skips
(`CAN_SELECT_DASHBOARD` / `DASHBOARD_TODO`) until the app team ships it.
A spec that sets switching state directly is a bug in the spec.

The default base URL is `http://localhost:3010`, matching the app's
Playwright config (`playwright.config.ts:62-63` derives it from `PORT`,
default 3010); override with `BASE_URL`.

Which experience each spec declares:

- V2, V3, V8, V9, V10 → profile
- V1, V4, V5, V7 → dashboard (skipped until the off-selection helper lands)
- V6 → the consistency spec crosses both in one test (skipped, needs
  dashboard); the mixed-case guard runs under profile (the loader it guards
  is experience-independent)

## Readiness, per file — three levels

**Runnable at `c2f45dd`** (compile and can execute today):

- `unit/light-theme-tokens.test.ts` — the brand-contract **parity** check
  runs now (skips, not passes, when sibling checkouts are absent); every
  light-theme assertion in the file is `skip`-marked post-fix acceptance
  (they fail by design until the V10 work lands — un-skipping is part of
  each fix).
- `unit/share-card-fallback.test.ts`, `unit/dead-components.test.ts` —
  compile and run today but ship `describe.skip` (post-fix acceptance: their
  assertions fail by design while R9/R23 are open).
- `e2e/` guards `T-AC-V2-03`, `T-AC-V2-07`, `T-AC-V6-02`, `T-AC-V8-08`,
  `T-AC-V9-01` — plain `test()`, expected green at `c2f45dd` (written from
  source, unrun); they need a signed-in session and fixtures.

**Contract-first — DO NOT add to CI until the fix lands** (do not compile at
`c2f45dd`; each carries a banner comment):

- `unit/social-handle.test.ts` — imports `extractSocialHandle` from
  `@/lib/social-handle`, which exists only after the R5 fix extracts the
  helper out of the `'use server'` module.
- `unit/track-record-labels.test.ts` — imports `deriveTier`,
  `derivePlacementLabel` (module-private today) and `deriveHostedDates`
  (does not exist yet); exporting them is part of the R10/R11 fixes.

**Fix-gated e2e** — specs covering unfixed findings are `test.fixme` so CI
stays green when they do run; removing the marker is part of each fix.
Dashboard-experience specs additionally skip on the missing off-selection
helper.

**`manual/`** — needs a person. Visual judgement and written decisions.

## Instrumentation the specs assume (REQ-19)

Generated from the shipped spec files
(`grep -ho 'data-testid="[^"]*"' e2e/*.ts | sort -u`):

| `data-testid` | Attributes | Used by |
| --- | --- | --- |
| `bonus-task-row` | `data-completed` | V2 |
| `fan-toggle` | — | V8 |
| `hero-count-label` | — | V1, V6, V8 (via the `heroCountValue` helper) |
| `history-entry` | `data-role` | V5 |
| `interests-editor` | — | V3 |
| `member-tier` | `data-source` | V1 |
| `stat-label` | — | V1, V6 (via the `statValue` helper) |
| `watching-row` | — | V1, V6 |

**None of these exist in the app at `c2f45dd`** — adding each id is part of
the fix its spec verifies. (`data-testid="timeline"` exists at
`timeline.tsx:270` but no spec selects it.)

## Fixtures

| Fixture | Needs |
| --- | --- |
| `MEMBER_PLAIN` | signed-in member, no org, some votes |
| `MEMBER_HOST` | org member with ≥1 concluded competition — and a competition in phase `voting` when the deletion-guard spec runs (T-AC-V7-03) |
| `MEMBER_WINNER` | ≥1 crowned entry |
| `MEMBER_CONTESTANT_ACTIVE` | claimed contestant in an open round, with ≥1 approved bonus submission (AC-V2-01) |
| `MEMBER_CONTESTANT_MULTI` | claimed contestant live in ≥2 competitions (AC-V2-02) |
| `MEMBER_CONTESTANT_OUT` | eliminated contestant (AC-V4-01) |
| `MEMBER_WITH_FANS` | ≥1 fan; several timeline events |
| `MEMBER_WITH_VIDEO` | uploaded intro video (T-AC-V3-04) |
| `MEMBER_WITH_TAGS` | imported interest tags (T-AC-V3-06 — keeps the "removed" arm non-vacuous) |
| `SS_MEMBER_MIXEDCASE` (env) | uppercase letter in auth email, with `MIXEDCASE_WATCH_COUNT` = its seeded watch count ≥1 (T-AC-V6-02 skips without both) |
| `TARGET_VOTER_ID` (env) | public profile of a member with fans + a live entry, no crown, no org (V8) |
| `TARGET_VOTER_ID_WINNER` (env) | public profile of the crowned fixture (T-AC-V8-04 positive half) |
| `LIVE_CONTESTANT_PATH` (env) | a contestant page in an open round (T-AC-V9-01) |

Never point these at real production members — several specs write profile
fields.

## Running

```bash
# Runnable-now unit files (the contract-first pair is deliberately excluded
# and must not join CI until the R5 / R10 / R11 fixes land):
pnpm vitest run \
  src/app/light-theme-tokens.acceptance.unit.test.ts \
  src/components/share/share-card-fallback.acceptance.unit.test.ts \
  src/components/profile/dead-components.acceptance.unit.test.ts

# E2E (needs auth fixtures; dashboard specs skip until the off-selection
# helper exists):
pnpm playwright test e2e/profile-acceptance/
```
