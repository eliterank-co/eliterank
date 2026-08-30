# Traceability matrix

One row per acceptance criterion. Read left to right to go from a finding to
the test that proves it is closed. The old→new finding map is at the bottom.

**Legend** — Class: `Defect` reproduces from source · `Policy` blocked on a
written decision · `Product` capability/decision owed · `Craft` design and
clarity · `Guard` currently correct, protected against regression · `Theme`
light-theme workstream. **Exp**: which experience the check runs under —
`dashboard`, `profile`, `both`, or `n/a` (selected via the app-owned helper,
REQ-01; dashboard selection is an app-owned TODO — those specs skip until it
exists).

| Finding | Class | View | Criterion | Test | Exp | Asset |
| --- | --- | --- | --- | --- | --- | --- |
| [R6](findings.md#r6--gold-member-is-hardcoded-for-every-member) | Defect | [V1](views/V1-me-dashboard.md) | `AC-V1-01` | `T-AC-V1-01` (e2e) | dashboard | `IMG-V1-a` |
| [R7](findings.md#r7--active-wins-is-hardcoded-to-zero-for-non-hosts) | Defect | V1 | `AC-V1-02` | `T-AC-V1-02` (e2e) | dashboard | `IMG-V1-a` |
| R7 | Defect | V1 | `AC-V1-03` | `T-AC-V1-03` (e2e) | both | — |
| [R8](findings.md#r8--markets-watched-counts-something-else) | Defect | V1, [V6](views/V6-watching.md) | `AC-V1-04` | `T-AC-V1-04` (e2e) | dashboard | `IMG-V1-a` |
| R7 | Defect | V1 | `AC-V1-05` | `T-AC-V1-05` (e2e, two fixtures in one test) | dashboard | — |
| [R2](findings.md#r2--the-bonus-task-checklist-can-never-show-progress-and-shows-the-wrong-tasks-on-a-second-live-round) | Defect | [V2](views/V2-member-profile.md) | `AC-V2-01` | `T-AC-V2-01` (e2e) | profile | `IMG-V2-b` |
| R2 | Defect | V2 | `AC-V2-02` | `T-AC-V2-02` (e2e, multi-comp fixture) | profile | — |
| [R3](findings.md#r3--the-profile-experience-demotes-all-member-navigation-to-the-avatar-menu) | Craft | V2 | `AC-V2-03` | `T-AC-V2-03` (e2e guard) + Manual (decision) | profile | `IMG-V2-a` |
| [R13](findings.md#r13--view-as-visitor-is-still-a-one-way-trip) | Defect | V2 | `AC-V2-04` | `T-AC-V2-04` (e2e) | profile | `IMG-V2-a` |
| [R21](findings.md#r21--host-identity-on-the-profile-decide-whether-the-track-record-is-enough) | Product | V2 | `AC-V2-05` | Manual (decision) | n/a | — |
| [R23](findings.md#r23--dead-profile-components-left-behind-by-the-redesign) | Craft | V2 | `AC-V2-06` | `T-AC-V2-06` (unit, post-fix — skipped until the R23 cleanup) | n/a | — |
| — | Guard | V2, V8 | `AC-V2-07` | `T-AC-V2-07` (e2e) | profile | — |
| [R5](findings.md#r5--save-errors-are-fieldless-raw-codes) | Defect | [V3](views/V3-profile-editor.md) | `AC-V3-01` | `T-AC-V3-01` (unit + e2e) | profile | `IMG-V3-a` |
| — | Guard | V3 | `AC-V3-02` | `T-AC-V3-02` (unit, contract-first — compiles only after the R5 extraction) | n/a | — |
| [R4](findings.md#r4--the-editor-captures-fields-the-profile-never-renders) | Defect | V3 | `AC-V3-03` | `T-AC-V3-03` (e2e) + Manual (per-field decision) | profile | `IMG-V3-b` |
| [R24](findings.md#r24--the-editors-video-preview-still-paints-a-black-frame) | Defect | V3 | `AC-V3-04` | `T-AC-V3-04` (e2e, video fixture) | profile | `IMG-V3-c` |
| [R22](findings.md#r22--link-and-pinned-link-are-still-indistinguishable-in-the-editor) | Craft | V3 | `AC-V3-05` | `T-AC-V3-05` (e2e + visual) | profile | `IMG-V3-a` |
| [R17](findings.md#r17--interests-still-cannot-be-set) | Product | V3 | `AC-V3-06` | `T-AC-V3-06` (e2e, tagged fixture) | profile | `IMG-V3-b` |
| [R20](findings.md#r20--age-on-the-profile-is-an-undecided-product-question) | Product | V3 | `AC-V3-07` | Manual (decision) | n/a | — |
| [R18](findings.md#r18--the-contestant-tab-still-reads-eliminated-as-the-whole-story) | Product | [V4](views/V4-contestant.md) | `AC-V4-01` | `T-AC-V4-01` (e2e) | dashboard | `IMG-V4-a` |
| R18 | Product | V4 | `AC-V4-02` | `T-AC-V4-02` (unit, contract-first — shared ladder) | n/a | — |
| [R12](findings.md#r12--competition-history-omits-hosting) | Defect | [V5](views/V5-vote-records.md) | `AC-V5-01` | `T-AC-V5-01` (e2e) | dashboard | `IMG-V5-a` |
| [R16](findings.md#r16--votes-cast-and-votes-received-belong-in-one-ledger) | Policy | V5 | `AC-V5-02` | `T-AC-V5-02` (e2e, after decision) | dashboard | — |
| R16 | Policy | V5 | `AC-V5-03` | Manual (decision) | n/a | — |
| [R8](findings.md#r8--markets-watched-counts-something-else) | Defect | V6 | `AC-V6-01` | `T-AC-V6-01` (e2e) | both | `IMG-V6-a` |
| — | Guard | V6 | `AC-V6-02` | `T-AC-V6-02` (e2e, mixed-case fixture + known watch count) | profile | — |
| [R19](findings.md#r19--password-email-and-phone-are-unreachable-from-the-member-area) | Product | [V7](views/V7-settings.md) | `AC-V7-01` | `T-AC-V7-01` (e2e) | dashboard | `IMG-V7-a` |
| R19 | Product | V7 | `AC-V7-02` | Manual (decision) | n/a | — |
| [R14](findings.md#r14--account-deletion-has-no-host-contestant-or-winner-guards) | Policy | V7 | `AC-V7-03` | `T-AC-V7-03` (e2e, gated) | dashboard | — |
| R14 | Policy | V7 | `AC-V7-04` | `T-AC-V7-04` (e2e, gated) | dashboard | — |
| R14 | Policy | V7 | `AC-V7-05` | `T-AC-V7-05` (e2e, gated) | dashboard | — |
| R14 | Policy | V7 | `AC-V7-06` | Manual — **gates the three above** | n/a | — |
| [R1](findings.md#r1--becoming-a-fan-is-impossible-on-the-redesigned-profile) | Defect | [V8](views/V8-public-profile.md) | `AC-V8-01` | `T-AC-V8-01` (e2e) | profile | `IMG-V8-a` |
| [R15](findings.md#r15--fans-and-watching-still-coexist-as-concepts) | Policy | V8, V2 | `AC-V8-02` | `T-AC-V8-02` (e2e, after decision) | profile | `IMG-V8-a` |
| [R9](findings.md#r9--the-story-card-modal-shares-no-card-and-lets-anyone-be-a-winner) | Defect | V8, V2 | `AC-V8-03` | `T-AC-V8-03` (e2e) | profile | `IMG-V8-b` |
| R9 | Defect | V8, V2 | `AC-V8-04` | `T-AC-V8-04` (e2e, negative + positive fixtures) | profile | `IMG-V8-b` |
| R9 | Defect | V8, V2 | `AC-V8-05` | `T-AC-V8-05` (unit, post-fix — skipped until the R9 fix) | n/a | — |
| [R10](findings.md#r10--concluded-hosted-competitions-read-closes-past-date) | Defect | V8, V2 | `AC-V8-06` | `T-AC-V8-06` (unit, contract-first) | n/a | — |
| [R11](findings.md#r11--every-below-top-10-result-is-labelled-finalist) | Defect | V8, V2 | `AC-V8-07` | `T-AC-V8-07` (unit, contract-first) + Manual (ladder decision) | n/a | — |
| — | Guard | V8 | `AC-V8-08` | `T-AC-V8-08` (e2e) | profile | — |
| — | Guard | [V9](views/V9-contestant-public.md) | `AC-V9-01` | `T-AC-V9-01` (e2e) | profile | `IMG-V9-a` |
| — | Theme | [V10](views/V10-light-theme.md) | `AC-V10-01` | `T-AC-V10-01` (unit — parity check runs now; v2-declaration check post-fix) | n/a | — |
| — | Theme | V10 | `AC-V10-02` | `T-AC-V10-02a/b/c` (e2e) | profile | `IMG-V10-a` |
| — | Theme | V10 | `AC-V10-03` | `T-AC-V10-03` (unit — scripted token census, post-fix) | n/a | — |
| — | Theme | V10 | `AC-V10-04` | Manual (sign-off over a contrast script authored with the palette work — no script ships in this packet) | n/a | — |
| — | Theme | V10 | `AC-V10-05` | `T-AC-V10-05` (unit — hardcoded-color census, post-fix) | n/a | — |
| — | Theme | V10 | `AC-V10-06` | Manual (visual pass) | n/a | `IMG-V10-b` |
| — | Theme | V10 | `AC-V10-07` | Manual (numbered walkthrough, all views) | both | `IMG-V10-*` |
| — | Theme | V10 | `AC-V10-08` | Manual (decision — toggle placement) + `T-AC-V10-02b` | n/a | — |

## Totals

Derived by script from this matrix and the shipped test files — regenerate
before editing either.

| | |
| --- | --- |
| Findings | 24 (13 defect · 3 policy · 5 product/decision · 3 craft) |
| Acceptance criteria | 49 (41 from findings/guards, 8 light-theme) |
| Carrying an automated test, in full or in part | 41 |
| Manual-only | 8 — decisions: `AC-V2-05`, `AC-V3-07`, `AC-V5-03`, `AC-V7-02`, `AC-V7-06`; visual/measurement: `AC-V10-04`, `AC-V10-06`, `AC-V10-07` |
| Automated + manual halves on one criterion | 5 (`AC-V2-03`, `AC-V3-03`, `AC-V3-05`, `AC-V8-07`, `AC-V10-08`) |
| Blocked on a policy document | 3 (`AC-V7-03/04/05`, all gated on `AC-V7-06`) |
| Guards expected green at `c2f45dd` (written from source, unrun) | 5 (`AC-V2-03` automated half, `AC-V2-07`, `AC-V6-02`, `AC-V8-08`, `AC-V9-01`) |

`AC-V3-02` is also a guard of shipped behavior, but its unit file is
contract-first (compiles only after the R5 extraction) — it is **not** in
the expected-green set.

## Old → new finding map

Prior packet (`3f6de99`, IDs P/D/X/G/S) → this packet (`c2f45dd`, IDs R).
"Resolved" rows carry the fixing commit; details in
[findings.md — Resolved since the prior audit](findings.md#resolved-since-the-prior-audit).
Each new finding appears exactly once in this map.

| Old | Status | New |
| --- | --- | --- |
| P1 | Mostly resolved (`6b665a8` normalization) | R5 (error contract) |
| P2 | Resolved on profile (`6b665a8` poster); save-interlock half did not reproduce | R24 (editor preview residual) |
| P3 | Resolved on profile (`6b665a8` track record) | R12 (/me/history residual) |
| P4 | Mostly resolved (`6b665a8` Preview Mode) | R13 (one-way link residual) |
| D1 | Survives verbatim | R6 |
| D2 | Survives verbatim | R7 |
| D3 | Partially resolved (quick action) | R8 (stat tile) |
| X1 | Survives | R14 |
| X2 | Split — mechanism regressed, naming survives | R1 (toggle unmounted) + R15 (naming) |
| X3 | Survives | R16 |
| G1 | Partially resolved (`6b665a8` honest empty state) | R17 (editor) |
| G2 | Partially resolved (`6b665a8` hosted entries) | R21 (hero decision) |
| G3 | Partially resolved (`6b665a8` checklist on profile) | R2 (completion + per-entry) |
| G4 | Partially resolved (`6b665a8` medals grid) | R11 (label honesty) + R18 (contestant tab) |
| G5 | Survives, reframed — nav is reachable via the avatar menu, so the residual is discoverability | R19 + R3 (nav demoted to dropdown) |
| G6 | Reframed (parity → product decision) | R20 |
| S1 | Survives verbatim | R22 |
| S2 | Superseded by redesign (`6b665a8` replaced the share surface) | R9 (new share-card defects) |
| S3 | Resolved (`6b665a8`); alignment half retired as superseded by design | — |
| S4 | Resolved (`6b665a8`) | R4 (LinkedIn/cover/occupation drop) |
| S5 | Resolved | — |
| S6 | Verified resolved in source | — (guard `AC-V9-01`) |
| — | New at `c2f45dd` (no prior-packet ancestor) | R10, R23 |
| — | New requirement (owner directive) | V10 light theme |

Retired requirement IDs from the old packet: REQ-01/02/03 (flag mechanics —
now app-owned, see [requirements.md](requirements.md) §1) and REQ-07
("deliberately dark-only" — inverted by the light-theme directive, see §2).

## Coverage gaps, stated plainly

- **No screenshots exist yet.** Every asset ID above is a capture target
  (see [assets/README.md](assets/README.md)).
- **Nothing in this packet has been executed.** All e2e specs are written
  from source at `c2f45dd` and unrun — no credentials, no seeded environment
  in this audit. "Expected green" always means: verified against source, not
  against a running app. Selectors will need adjustment on first run; the
  criteria are what matter.
- **Dashboard-experience specs are skipped** until the app team ships an
  off-selection helper (REQ-01) — that covers every `dashboard`-Exp row
  above.
- **Two unit files are contract-first and do not compile at `c2f45dd`**
  (`social-handle.test.ts`, `track-record-labels.test.ts`) — they must not
  join CI before their fixes land; each carries a banner saying so.
- **None of the `data-testid` values the specs select on exist yet**
  (REQ-19 lists them). The one profile testid that does exist
  (`data-testid="timeline"`, `timeline.tsx:270`) is selected by no spec.
- **Three deletion criteria cannot be implemented before the retention policy
  is written** (`AC-V7-06` gates `AC-V7-03/04/05`).
- **The light-theme criteria are structural until a palette exists.**
  The `T-AC-V10-01/03/05` units ship skipped (post-fix acceptance) and are
  un-skipped as their pieces land; `AC-V10-04/06/07` need the actual colors.
