# Verification checklist

Sign-off sheet. A finding is **closed** when every criterion it maps to
passes and its row here is signed. Record the **experience** rendered for
every row (REQ-02) — a result without it is not evidence.

## Before you start

- [ ] Recorded how the environment resolves the experience (per the app
      team's current mechanism) so results aren't from a stale override.
      Note: dashboard-experience specs skip until the app-owned off-selection
      helper exists (REQ-01).
- [ ] Fixture accounts seeded — see [tests/README.md](../README.md#fixtures)
- [ ] Base URL recorded: ................

## Automated

Run first; no judgement needed. `T-AC-*` per the
[traceability matrix](../../traceability.md); each spec/unit file names its
criterion. Guards expected green at `c2f45dd` (written from source, unrun —
confirm on first execution): `AC-V2-03` (automated half), `AC-V2-07`,
`AC-V6-02` (needs the mixed-case fixture + `MIXEDCASE_WATCH_COUNT`),
`AC-V8-08`, `AC-V9-01`. The two contract-first unit files
(`social-handle`, `track-record-labels`) do not compile until their fixes
land — do not add them to CI before that.

| Criterion | Result | Notes |
| --- | --- | --- |
| AC-V1-01 … AC-V1-05 | ☐ | dashboard stats honest (specs skip until the off-selection helper lands) |
| AC-V2-01, -02, -03, -04, -06, -07 | ☐ | checklist, nav guard, preview, dead code |
| AC-V3-01 … AC-V3-06 | ☐ | editor honesty |
| AC-V4-01, -02 | ☐ | achievement framing |
| AC-V5-01, -02 | ☐ | history + ledger |
| AC-V6-01, -02 | ☐ | watching consistency |
| AC-V7-01, -03, -04, -05 | ☐ | -03/-04/-05 blocked until AC-V7-06 signed |
| AC-V8-01 … AC-V8-08 | ☐ | fan toggle, story card, track-record honesty |
| AC-V9-01 | ☐ | guard |
| AC-V10-01, -02, -03, -05 | ☐ | theme structure (units ship skipped; un-skip as the V10 pieces land) |

## Decisions (written, dated, linked)

| Criterion | Decision needed | Signed |
| --- | --- | --- |
| AC-V2-03 | Profile-experience navigation: avatar-menu-only recorded as intended, or surfaced nav ships (R3) | ☐ |
| AC-V2-05 | Host identity in the hero: track record sufficient, or org named | ☐ |
| AC-V3-03 | Per field — LinkedIn / cover image / occupation: render or remove | ☐ |
| AC-V3-07 | Age on the public profile (references 18+ eligibility work) | ☐ |
| AC-V5-03 | Votes-received scope | ☐ |
| AC-V7-02 | Phone: collect for SMS, or drop | ☐ |
| AC-V7-06 | Retention policy (gates AC-V7-03/04/05); infra migrations named | ☐ |
| AC-V8-07 | Placement-label ladder | ☐ |
| AC-V10-08 | Theme toggle placement + persistence | ☐ |

## Visual — light theme walkthrough (AC-V10-06, AC-V10-07)

For each view V1–V9, in **light**, then repeat spot checks in **dark**:

1. Set the explicit theme to light (per AC-V10-08's landed control).
2. Load the view with its fixture (per tests/README).
3. Check: page ground is the light `--color-bg-app`; body text ≥4.5:1 (spot
   check with devtools contrast picker on the faintest text token); gold
   accents legible; card borders visible; no black scrim where content
   should show; no white-on-white.
4. Open every overlay on the view (lightbox, detail sheet, share modal,
   story card): scrims render deliberately (tokenized or marked
   theme-invariant), content inside is legible.
5. Toggle to dark and back on the same page: no flash of the wrong theme,
   no unstyled flicker, form controls follow (`color-scheme`).
6. Capture the `IMG-V10-<view>-light` screenshot (see assets/README).

| View | Light pass | Dark re-check | Signed |
| --- | --- | --- | --- |
| V1 … V9 (one row each when executing) | ☐ | ☐ | |

## Visual — remaining halves

| Criterion | What to judge | Signed |
| --- | --- | --- |
| AC-V3-05 | The relabelled link fields read as different things at a glance | ☐ |
| AC-V8-07 | The chosen ladder reads as earned, not inflated, on a real record | ☐ |
| AC-V10-04 | Contrast measurements reviewed (script authored with the palette work); gold-split pairs listed and passing | ☐ |
