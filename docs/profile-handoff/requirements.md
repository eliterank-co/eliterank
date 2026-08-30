# Global requirements

Constraints every fix in this package must satisfy, regardless of which view it
touches. View-specific requirements live in [`views/`](views/).

---

## 1. Experience selection is app-owned

The member area currently renders one of two experiences at `/me`, and
`/p/[voterId]` resolves only under the profile experience. Those are facts a
reproducer needs — they are **not** requirements. Which flags, cookies,
routes, or rollout process control the switch is the application team's
decision, and nothing in this package mandates any of it.

**REQ-01 — Tests select the experience through an app-owned helper.** Every
spec that depends on an experience calls `selectExperience(context, baseURL,
'profile' | 'dashboard')` from this suite's `_fixtures.ts`, which delegates to
the app's e2e helpers rather than encoding the switching mechanism itself.
The app ships the profile-side seam today (`e2e/helpers/ui-flags.ts` exports
`enableUiSurfaces(context, baseURL, surfaces)`). **No app-owned dashboard/off
selection exists yet — shipping one is an app-owned TODO this suite depends
on**, and every dashboard-experience spec skips with that reason until it
lands (see `CAN_SELECT_DASHBOARD` in `tests/e2e/_fixtures.ts`). The app team
may keep, rename, or reimplement the helpers; specs depend only on their
existence and the two-experience contract, never on the mechanism.

**REQ-02 — State the experience in every bug report and PR.** R6–R8 reproduce
only on the dashboard experience; R1–R3, R9–R11, R13 only on the profile
experience. A report that omits which experience was rendered is not
actionable.

---

## 2. Design system and theming

**REQ-03 — Tokens only, no raw hex.** Every color references a token defined
in `src/app/globals.css` (semantic layer: `--color-bg-app`,
`--color-surface-1..3`, `--color-text-cream/subtle/faint`, `--gold-primary`,
`--gold-text`, `--color-gold-line`, `--color-border-subtle` via shadcn
`--border`, status tokens) or the brand primitives beneath them
(`--brand-*`). The canonical contract is `design/brand-contract.json`,
identical today in `eliterank-app`, `eliterank-registry`, and
`eliterank-infra` (verified byte-for-byte at this audit). A change to the
contract lands in the registry first and is mirrored to the other two copies.

**REQ-04 — Gold is the only accent; status colors are for status.** The
two-token gold split (`--gold-primary` for large/bold, `--gold-text` for
body-size) is a WCAG device and must survive any theming work
(`docs/rebuild/INVARIANTS.md` in `eliterank-infra`, item 30).

**REQ-05 — A light theme is a requirement, not a hazard.** This replaces the
prior packet's REQ-07 ("the app is deliberately dark-only"). The app renders
dark-only today (`src/app/globals.css:238` sets `color-scheme: dark`; the
brand contract v1 defines a single dark palette; the registry's own
`globals.css` is equally dark-only; `eliterank-infra/docs/rebuild/DESIGN-PROMPT.md:177`
explicitly deferred light mode). **No light tokens exist anywhere in the four
repos** — so the work is to *author* a light palette as a brand-contract
revision, not to adopt an existing one. Scope, token architecture, viewer
resolution, and acceptance criteria: [`views/V10-light-theme.md`](views/V10-light-theme.md).

**REQ-06 — Theme-safe composition.** From now on, no new surface may bake in
a dark assumption: overlays, scrims, and "black" glass effects must either be
tokenized or documented as theme-invariant. The profile surfaces carry 29
hardcoded-color instances today (counted at `c2f45dd`; see AC-V10-05) — new
code must not add to that number.

---

## 3. Data honesty

**REQ-07 — No placeholder that reads as a fact.** A hardcoded tier (R6), a
hardcoded count (R7), a label describing a different quantity (R8), a
completion state that is always false (R2), a "FINALIST" label for a
first-round exit (R11), or a "CLOSES" date in the past (R10) is worse than an
omission. Where a real value is unavailable, omit the element. Precedent in
the codebase: the "Live now" card drops unknown close dates; the watch-list
quick action shows the real `listMyWatching` count.

**REQ-08 — A label must name what is counted.** "Markets watched" must count
the watch list; "Crowns" must count crowned entries; "N/N Done" must count
completed tasks.

**REQ-09 — One concept, one name.** "Fan" and "Watching" appear side by side
in the profile hero counts today. Whatever term wins must be applied across
profile, competition pages, and the fan-digest email in one pass — as a label
change only, without altering what `voter_follows`/fan rows mean (the digest
cron reads them).

**REQ-10 — Self-presentation is bounded by the record.** A member may style
their profile; they may not select a state the data does not support. The
story-card role selector currently lets any member render a "WINNER" card
(R9). Role states must derive from the member's actual record.

---

## 4. Error handling

**REQ-11 — Validation errors name the field, in human copy.** A server action
rejecting a multi-field form must return enough for the client to mark which
input failed, and the client must never print a raw error code
(`Couldn't save: invalid_input` is today's rendering — R5).

**REQ-12 — Accept what you advertise.** Scope: the voter profile editor —
the single `ProfileEdit` component
(`src/experiences/voter/profile/profile-edit.tsx`) behind both `/me/profile`
and the legacy-crossover `/profile` route. It normalizes pasted URLs for
every network it accepts (`extractSocialHandle`,
`src/lib/actions/profile.ts:39-58`); keep that under test so it cannot
regress. The host org-settings editor (`updateOrganizationSocials`,
`src/app/(public)/host/[orgSlug]/settings/social-actions.ts`) writes
*organization* socials as full URLs with its own normalization and is
explicitly out of this packet's scope.

**REQ-13 — Never report failure for work that succeeded.** The Save button is
disabled and relabelled while media commits are in flight; keep it that way.

---

## 5. Records and privacy

**REQ-14 — Competition results are durable.** Deleting an account must not
destroy the record of who won a competition. What is erased, tombstoned, or
retained per role is a business decision (R14) that must be written before
guards are implemented. Migration implications land in `eliterank-infra`
(`supabase/` migrations), not in the app.

**REQ-15 — Owner-only data never renders publicly.** The Watching count and
bonus-task checklist are owner-only; the public render of the same components
must not receive them (guarded criteria in V2/V8).

---

## 6. Testing

**REQ-16 — Every acceptance criterion is provable** by an automated test or a
numbered manual step. No criterion reads "looks good".

**REQ-17 — Unit-test what does not need auth.** Normalization, label
derivation (`deriveTier`, `derivePlacementLabel`), and token-coverage checks
run without a session.

**REQ-18 — Specs declare their experience** via the app-owned helper (REQ-01),
never by inheriting ambient state.

**REQ-19 — Fixes add the instrumentation their tests need.** The
`data-testid` values the shipped specs select on (generated from the spec
files — regenerate with `grep -ho 'data-testid="[^"]*"' tests/e2e/*.ts | sort -u`):

- `bonus-task-row` (with attribute `data-completed`) — V2
- `fan-toggle` — V8
- `hero-count-label` — V1/V6/V8 (hero counts row)
- `history-entry` (with attribute `data-role`) — V5
- `interests-editor` — V3
- `member-tier` (with attribute `data-source`) — V1
- `stat-label` — V1/V6
- `watching-row` — V1/V6

**None of these exist in the app at `c2f45dd`.** (The one profile testid that
does exist, `data-testid="timeline"` at
`src/components/profile/timeline.tsx:270`, is selected by no spec.) Adding
each id is part of the fix its spec verifies, not optional polish.

---

## 7. Out of scope

- How and when either experience rolls out. App team's call.
- Retiring the `(legacy)` crossover route group and the Classic profile.
- Building the "votes received" feature (R16 scopes it; the build is separate).
- The light palette's actual color values (V10 specifies structure,
  resolution, and proof — the values are design work).
