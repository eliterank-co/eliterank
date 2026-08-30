# Member Profile — Handoff Package v2

Audit of the redesigned EliteRank member-profile experience and the work that
remains to finish it.

**Audited at:** `eliterank-co/eliterank-app` @ `c2f45dd`
**Design of record:** commit `6b665a8` — "single-axis 748px luxury member
profile with medals grid, live round dual experience, and story cards (#158)"
**Supersedes:** the prior packet pinned at `3f6de99` (22 findings, framed as
new-vs-legacy parity). That framing is retired: every surviving item here is a
product requirement of the current stack in its own right. See
[`traceability.md`](traceability.md) for the old→new mapping.

**Scope (cross-repo):** this packet targets the four-repo redesign stack —
`eliterank-app` (product) · `eliterank-registry` (design system, brand
contract) · `eliterank-shared` (shared packages) · `eliterank-infra`
(migrations, design docs). Where a fix belongs outside the app, the finding
says so. The legacy repo this packet is checked into is **storage only**:
nothing here describes or changes the legacy application.

---

## What changed since the last packet

~55 commits, including the #158 profile redesign. The profile is now one
748px single-axis page — hero (136px avatar, social chips, counts row), live
round module with owner/supporter duals, featured media gallery, verified
track record (medals grid), collapsible timeline, interests + fan community,
and a 5-state story-card modal. Thirteen prior findings are improved by it —
six resolved, two mostly resolved, five partially resolved — and several new
defects shipped inside it. Both are catalogued in
[`findings.md`](findings.md).

**New in this packet:** a light theme is now a requirement
([V10](views/V10-light-theme.md)). The app and the design system are dark-only
today; the brand contract has no light palette. The requirement is to author
one, not to adopt one — see [`requirements.md`](requirements.md) §2 and the
V10 acceptance criteria.

**Removed from this packet:** flag and routing mechanics as *requirements*.
The application team owns how experience switching works. Documents here state
factually which surface renders where when needed to reproduce a finding, and
tests select an experience through an app-owned helper
([`requirements.md`](requirements.md) §1) — nothing here mandates a cookie or
flag contract. (One consequence, stated plainly: selecting the dashboard
experience has no app-owned helper yet, so those specs skip until the app
team ships one.)

---

## Start here

| If you are… | Read |
| --- | --- |
| Deciding what to fix first | [`traceability.md`](traceability.md) then [`findings.md`](findings.md) |
| Implementing a fix | The view doc under [`views/`](views/), then its acceptance criteria |
| Building the light theme | [`views/V10-light-theme.md`](views/V10-light-theme.md) |
| Verifying a fix | [`tests/manual/verification-checklist.md`](tests/manual/verification-checklist.md) |
| Writing automated coverage | [`tests/README.md`](tests/README.md) |
| Producing screenshots | [`assets/README.md`](assets/README.md) |
| Auditing this packet's pipeline | [`REVIEW-LOG.md`](REVIEW-LOG.md) |

---

## Contents

```
profile-handoff/
├── README.md                  ← you are here
├── REVIEW-LOG.md              audit trail: adversarial review dispositions
├── requirements.md            global constraints every fix must satisfy
├── findings.md                24 findings (R1–R24), with evidence and fixes
├── traceability.md            finding ↔ view ↔ criterion ↔ test, plus old→new map
├── views/                     one document per surface (V1–V9) + light theme (V10)
├── assets/README.md           screenshot capture spec
└── tests/
    ├── README.md              how to run, readiness per file, fixtures
    ├── unit/                  three runnable-now files (shipped skip-marked
    │                          post-fix acceptance where they must fail today)
    │                          + two contract-first files that do NOT compile
    │                          until their fixes land (banners inside)
    ├── e2e/                   Playwright, needs a signed-in session
    └── manual/                verification checklist for sign-off
```

---

## ID scheme

| Prefix | Meaning | Example |
| --- | --- | --- |
| `V1`–`V10` | View (one surface, or one workstream) | `V2` = member profile |
| `R1`–`R24` | Finding (fresh series; old IDs mapped in traceability) | `R1` |
| `AC-V2-03` | Acceptance criterion, numbered within its view | |
| `T-AC-V2-03` | The test that proves that criterion | |
| `IMG-V2-a` | An image asset for that view | |

A finding is **closed** when every acceptance criterion it maps to passes and
its manual-checklist row is signed off.

---

## The ten views

| ID | Surface | Route | Findings |
| --- | --- | --- | --- |
| [V1](views/V1-me-dashboard.md) | Member dashboard (classic experience) | `/me` | R6, R7, R8 |
| [V2](views/V2-member-profile.md) | Member profile, 748px owner view | `/me` (profile experience) | R2, R3, R13, R15, R21, R23 |
| [V3](views/V3-profile-editor.md) | Profile editor | `/me/profile` | R4, R5, R17, R20, R22, R24 |
| [V4](views/V4-contestant.md) | Contestant self-service | `/me/contestant` | R18 |
| [V5](views/V5-vote-records.md) | Votes, transactions, history | `/me/votes`, `/me/transactions`, `/me/history` | R12, R16 |
| [V6](views/V6-watching.md) | Watch list | `/me/watching` | R8 |
| [V7](views/V7-settings.md) | Settings and account | `/me/settings` | R14, R19 |
| [V8](views/V8-public-profile.md) | Public member profile | `/p/[voterId]` | R1, R9, R10, R11, R15 |
| [V9](views/V9-contestant-public.md) | Contestant public profile | `/o/…/[contestantSlug]` | — (guard only) |
| [V10](views/V10-light-theme.md) | Light theme (workstream, all surfaces) | — | — (requirements) |

---

## What this package does not contain

- **Screenshots.** Member views require authentication; this audit ran from
  source. `assets/README.md` specifies what to capture.
- **Test runs.** Nothing here was executed — no credentials, no seeded
  environment. Every readiness claim is source-verified, and
  `tests/README.md` states each file's actual readiness level.
- **A retention policy.** R14 is blocked on one; the requirement is written,
  the policy is a business decision.
- **A light palette.** V10 specifies how to author one and what proves it
  done; the palette values themselves are design work.
- **Fixes.** No application code was changed in producing this package.
