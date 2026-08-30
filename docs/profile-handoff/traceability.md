# Traceability matrix

One row per acceptance criterion. Read left to right to go from a piece of owner
feedback to the test that proves it is fixed.

**Legend** — Class: `Defect` reproduces from source · `Policy` blocked on a
written decision · `Gap` legacy does it, v2 does not · `Craft` design and
clarity · `Verify` needs a live check · `Guard` currently correct, protected
against regression.

| Feedback item | Finding | Class | View | Criterion | Test | Flag | Asset |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Save error with more social links | [P1](findings.md#p1--saving-a-profile-with-a-pasted-social-url-fails-with-a-bare-error) | Defect | [V3](views/V3-profile-editor.md) | `AC-V3-01` | [`T-AC-V3-01`](tests/unit/social-handle.test.ts) | either | `IMG-V3-b` |
| Save error with more social links | P1 | Defect | V3 | `AC-V3-02` | [`T-AC-V3-02`](tests/e2e/V3-profile-editor.spec.ts) | either | `IMG-V3-b` |
| Save error with more social links | P1 | Defect | V3 | `AC-V3-03` | [`T-AC-V3-03`](tests/unit/social-handle.test.ts) | n/a | — |
| Save error with more social links | P1 | Defect | [V4](views/V4-contestant.md) | `AC-V4-04` | [`T-AC-V3-03`](tests/unit/social-handle.test.ts) (shared) | n/a | — |
| Video save error; black preview | [P2](findings.md#p2--intro-video-saves-with-an-error-then-renders-as-a-black-frame) | Defect | V3 | `AC-V3-04` | [`T-AC-V3-04`](tests/e2e/V3-profile-editor.spec.ts) | either | `IMG-V3-c` |
| Video save error; black preview | P2 | Defect | V3 | `AC-V3-05` | `T-AC-V3-05` (visual) | either | `IMG-V3-c` |
| History does not display hosting | [P3](findings.md#p3--competition-history-omits-hosting-entirely) | Defect | [V5](views/V5-vote-records.md) | `AC-V5-01` | [`T-AC-V5-01`](tests/e2e/V5-vote-records.spec.ts) | off | `IMG-V5-c` |
| History does not display hosting | P3 | Defect | V5 | `AC-V5-02` | [`T-AC-V5-02`](tests/e2e/V5-vote-records.spec.ts) | off | `IMG-V5-c` |
| No way back from view-as-visitor | [P4](findings.md#p4--view-as-visitor-is-a-one-way-trip) | Defect | [V8](views/V8-public-profile.md) | `AC-V8-01` | [`T-AC-V8-01`](tests/e2e/V8-public-profile.spec.ts) | on | `IMG-V8-a` |
| No way back from view-as-visitor | P4 | Defect | V8 | `AC-V8-02` | [`T-AC-V8-02`](tests/e2e/V8-public-profile.spec.ts) | on | `IMG-V8-a` |
| *(audit)* hardcoded tier | [D1](findings.md#d1--gold-member-is-hardcoded-for-every-member) | Defect | [V1](views/V1-me-dashboard.md) | `AC-V1-01` | [`T-AC-V1-01`](tests/e2e/V1-me-dashboard.spec.ts) | off | `IMG-V1-b` |
| *(audit)* hardcoded wins | [D2](findings.md#d2--active-wins-is-hardcoded-to-zero-for-non-hosts) | Defect | V1 | `AC-V1-02` | [`T-AC-V1-02`](tests/e2e/V1-me-dashboard.spec.ts) | off | `IMG-V1-b` |
| *(audit)* hardcoded wins | D2 | Defect | V1 | `AC-V1-03` | [`T-AC-V1-03`](tests/e2e/V1-me-dashboard.spec.ts) | off→on | — |
| *(audit)* hardcoded wins | D2 | Defect | V1 | `AC-V1-05` | [`T-AC-V1-05a` + `T-AC-V1-05b`](tests/e2e/V1-me-dashboard.spec.ts) — two-fixture comparison | off | `IMG-V1-b` |
| *(audit)* mislabelled metric | [D3](findings.md#d3--markets-watched-counts-something-else) | Defect | V1, [V6](views/V6-watching.md) | `AC-V1-04` | [`T-AC-V1-04`](tests/e2e/V1-me-dashboard.spec.ts) | off | `IMG-V1-b` |
| *(audit)* mislabelled metric | D3 | Defect | V6 | `AC-V6-01` | [`T-AC-V6-01`](tests/e2e/V6-watching.spec.ts) | off→on | `IMG-V6-a` |
| Deletion guards for hosts | [X1](findings.md#x1--account-deletion-has-no-host-contestant-or-winner-guards) | Policy | [V7](views/V7-settings.md) | `AC-V7-03` | [`T-AC-V7-03`](tests/e2e/V7-settings.spec.ts) | off | — |
| Contestants need permission to delete | X1 | Policy | V7 | `AC-V7-04` | [`T-AC-V7-04`](tests/e2e/V7-settings.spec.ts) | off | — |
| Retain past-winner records | X1 | Policy | V7 | `AC-V7-05` | [`T-AC-V7-05`](tests/e2e/V7-settings.spec.ts) | off | — |
| Retain past-winner records | X1 | Policy | V7 | `AC-V7-06` | Manual — **gates the three above** | n/a | — |
| Cannot become a fan; rename to "watch" | [X2](findings.md#x2--fan-vs-watch-one-concept-two-names) | Policy | V8 | `AC-V8-03` | [`T-AC-V8-03`](tests/e2e/V8-public-profile.spec.ts) | on | `IMG-V8-a` |
| Merge votes + transactions | [X3](findings.md#x3--votes-cast-and-votes-received-belong-in-one-ledger) | Policy | V5 | `AC-V5-03` | [`T-AC-V5-03`](tests/e2e/V5-vote-records.spec.ts) | off | `IMG-V5-a` |
| Show votes received | X3 | Policy | V5 | `AC-V5-04` | Manual | n/a | — |
| Merge votes + transactions | X3 | Policy | V5 | `AC-V5-05` | [`T-AC-V5-05`](tests/e2e/V5-vote-records.spec.ts) | off | `IMG-V5-b` |
| *(audit)* interests not editable | [G1](findings.md#g1--interests-render-but-cannot-be-edited) | Gap | [V2](views/V2-me-social-profile.md), V3 | `AC-V3-06` | [`T-AC-V3-06`](tests/e2e/V3-profile-editor.spec.ts) | either | `IMG-V2-b` |
| *(audit)* interests not editable | G1 | Gap | V2 | `AC-V2-04` | [`T-AC-V2-04`](tests/e2e/V2-me-social-profile.spec.ts) | on | `IMG-V2-b` |
| Host status should display on profile | [G2](findings.md#g2--host-role-never-appears-on-a-profile) | Gap | V2 | `AC-V2-01` | [`T-AC-V2-01` + `T-AC-V2-01b`](tests/e2e/V2-me-social-profile.spec.ts) — host and non-host halves | on | `IMG-V2-a` |
| *(audit)* bonus tasks not actionable | [G3](findings.md#g3--bonus-tasks-are-visible-only-after-the-fact) | Gap | V2 | `AC-V2-02` | [`T-AC-V2-02`](tests/e2e/V2-me-social-profile.spec.ts) | on | `IMG-V2-a` |
| *(audit)* tier framing lost | [G4](findings.md#g4--achievement-tier-framing-is-gone) | Gap | [V4](views/V4-contestant.md) | `AC-V4-01` | [`T-AC-V4-01`](tests/e2e/V4-contestant.spec.ts) | off | `IMG-V4-a` |
| *(audit)* tier framing lost | G4 | Gap | V4 | `AC-V4-02` | [`T-AC-V4-02`](tests/e2e/V4-contestant.spec.ts) | off | `IMG-V4-b` |
| *(audit)* tier framing lost | G4 | Gap | V4 | `AC-V4-03` | [`T-AC-V4-03`](tests/e2e/V4-contestant.spec.ts) | off | `IMG-V4-a` |
| *(audit)* account controls unreachable | [G5](findings.md#g5--password-email-and-phone-are-unreachable-from-the-member-area) | Gap | V7 | `AC-V7-01` | [`T-AC-V7-01`](tests/e2e/V7-settings.spec.ts) | off | `IMG-V7-a` |
| *(audit)* phone dropped | G5 | Gap | V7 | `AC-V7-02` | Manual | n/a | — |
| *(audit)* age, video prompts dropped | [G6](findings.md#g6--age-and-video-prompts-have-no-v2-equivalent) | Gap | V3 | `AC-V3-07` | Manual | n/a | — |
| Pinned link vs. link unclear | [S1](findings.md#s1--pinned-link-and-link-are-indistinguishable-in-the-editor) | Craft | V3 | `AC-V3-08` | [`T-AC-V3-08`](tests/e2e/V3-profile-editor.spec.ts) | either | `IMG-V3-b` |
| Improve share card design | [S2](findings.md#s2--share-card-design) | Craft | V8 | `AC-V8-04` | [`T-AC-V8-04`](tests/e2e/V8-public-profile.spec.ts) | on | `IMG-V8-c` |
| Profile icon bigger; text left-aligned | [S3](findings.md#s3--profile-icon-size-and-alignment) | Craft | V1, V2 | `AC-V2-03` | `T-AC-V2-03` (visual) | on | `IMG-V2-a` |
| Sleeker social icons | [S4](findings.md#s4--social-icon-set) | Craft | V8 | `AC-V8-05` | [`T-AC-V8-05`](tests/e2e/V8-public-profile.spec.ts) | on | `IMG-V8-a` |
| Mobile share icon unintuitive | [S5](findings.md#s5--mobile-share-affordance-is-unclear) | Craft | V8 | `AC-V8-06` | [`T-AC-V8-06`](tests/e2e/V8-public-profile.spec.ts) | on | `IMG-V8-b` |
| Vote modal on contestant profile | [S6](findings.md#s6--vote-modal-on-the-contestant-profile) | Verify | [V9](views/V9-contestant-public.md) | `AC-V9-01` | [`T-AC-V9-01`](tests/e2e/V9-contestant-public.spec.ts) | either | `IMG-V9-a` |
| Vote modal on contestant profile | S6 | Verify | V9 | `AC-V9-02` | [`T-AC-V9-02`](tests/e2e/V9-contestant-public.spec.ts) | either | `IMG-V9-a` |
| — | — | Guard | V2 | `AC-V2-05` | [`T-AC-V2-05`](tests/e2e/V2-me-social-profile.spec.ts) | on | — |
| — | — | Guard | V6 | `AC-V6-02` | [`T-AC-V6-02`](tests/e2e/V6-watching.spec.ts) | off | — |
| — | — | Guard | V8 | `AC-V8-07` | [`T-AC-V8-07`](tests/e2e/V8-public-profile.spec.ts) | on | — |

## Totals

| | |
| --- | --- |
| Findings | 22 |
| Acceptance criteria | 44 (41 from findings, 3 regression guards) |
| With an automated test | 39 |
| Needing a visual pass | 5 (`AC-V2-03`, `AC-V3-05`, `AC-V3-08`, `AC-V8-04`, `AC-V8-06`) |
| Written decision only | 4 (`AC-V3-07`, `AC-V5-04`, `AC-V7-02`, `AC-V7-06`) |
| Blocked on a policy document | 3 (`AC-V7-03`, `04`, `05`, all gated on `AC-V7-06`) |

Counts overlap: `AC-V3-01` is proven by both a unit test and an e2e spec;
`AC-V3-05`, `AC-V3-08`, `AC-V8-04` and `AC-V8-06` have an automated assertion
*and* a visual half; `AC-V2-03` is visual only.

## Coverage gaps, stated plainly

- **No screenshots exist yet.** Every asset ID above is a capture target, not a
  file. See [assets/README.md](assets/README.md).
- **Three criteria cannot be tested until a policy is written.** `AC-V7-03`
  through `05` are specified and specced, but implementing them before
  `AC-V7-06` encodes an answer nobody chose.
- **E2E specs are unrun.** They were written from source and syntax-checked, not
  executed — this audit had no credentials and no seeded environment. Expect to
  adjust selectors on first run; the criteria are what matter, not the locators.
- **Four test ids the specs select on do not exist in the app** (`stat-label`,
  `history-entry`, `profile-hero`, `contestant-competition-row`). Adding them is
  part of each fix — REQ-19.
- **One unit test needs a session mock.** `saveOwnProfile` checks auth before
  validation, so the field-naming assertion skips in bare Vitest
  (`SESSION_MOCK`); its criterion is also covered by e2e `T-AC-V3-02`.
- **`T-AC-V6-02` skips without a seeded mixed-case-email fixture** — without
  that precondition it would pass vacuously, so it refuses to run instead.
- **The app is dark-only.** `AC-*` visual checks verify explicit backgrounds on
  dark tokens; there is no light theme to test (REQ-07).
