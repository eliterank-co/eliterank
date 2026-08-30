# Member Profile — Handoff Package

Everything needed to verify and fix the new member profile (v2, `eliterank-app`)
against the legacy profile it replaces.

**Audited at:** `eliterank-co/eliterank-app` @ `3f6de99`
**Compared against:** `eliterank-co/eliterank` (this repo — legacy, live production)

---

## Why this lives in the legacy repo

The findings are about `eliterank-app` (v2), but this package was produced from
a branch of the legacy repo and is checked in here so the review, the branch and
the issue history stay together. **Nothing here is application code**, and
nothing here is a v2 pattern being ported into this app — it is documentation
only, so it does not cross the boundary described in the root `CLAUDE.md`.

If the team would rather it live beside the code it describes, move the whole
folder to `eliterank-app/docs/profile-handoff/`. Every internal link is
relative, so the folder survives the move intact.

---

## Start here

| If you are… | Read |
| --- | --- |
| Deciding what to fix first | [`traceability.md`](traceability.md) then [`findings.md`](findings.md) |
| Implementing a fix | The view doc under [`views/`](views/), then its acceptance criteria |
| Verifying a fix | [`tests/manual/verification-checklist.md`](tests/manual/verification-checklist.md) |
| Writing automated coverage | [`tests/README.md`](tests/README.md) |
| Producing screenshots | [`assets/README.md`](assets/README.md) |

---

## Before anything else: resolve the flag

`social_profile` **defaults off** (`src/lib/ui-flags.ts`). It decides which of
two entirely different pages `/me` renders, and therefore which findings are
real:

- **Flag off** — `/me` is a voter dashboard. Findings `D1`–`D3` are the
  shipping experience. `/p/[voterId]` returns 404, so `P4`, `X2`, `S2` and `S6`
  are unreachable rather than broken.
- **Flag on** — `/me` is the v3 social profile. `D1`–`D3` never render at all.

Resolution order is `ui_override` cookie → `feature_flags` row → off. **A cookie
override makes your browser disagree with production.** Confirm the row before
scoping anything.

See [`requirements.md`](requirements.md) §1 for how to check and how to
override for testing.

---

## Contents

```
profile-handoff/
├── README.md                  ← you are here
├── requirements.md            global constraints every fix must satisfy
├── findings.md                the 22 findings, with evidence and fixes
├── traceability.md            finding ↔ view ↔ criterion ↔ test ↔ asset
├── views/                     one document per surface (V1–V9)
├── assets/
│   ├── README.md              screenshot capture spec
│   ├── diagrams/              structural wireframes, one per view
│   └── screenshots/           capture target (empty — see assets/README.md)
└── tests/
    ├── README.md              how to run, what needs auth, what needs the flag
    ├── unit/                  runnable today, no auth
    ├── e2e/                   Playwright, needs a signed-in session
    └── manual/                verification checklist for hand-off sign-off
```

---

## ID scheme

Stable identifiers, used everywhere so any two documents can be cross-checked.

| Prefix | Meaning | Example |
| --- | --- | --- |
| `V1`–`V9` | View (one surface) | `V3` = profile editor |
| `P`, `D`, `X`, `G`, `S` | Finding class — defect, dashboard defect, policy, gap, craft | `P1` |
| `AC-V3-02` | Acceptance criterion, numbered within its view | `AC-V3-02` |
| `T-AC-V3-02` | The test that proves that criterion | `T-AC-V3-02` |
| `IMG-V3-a` | An image asset for that view | `IMG-V3-a` |

A finding is **closed** when every acceptance criterion it maps to passes, and
the manual checklist row for it is signed off.

---

## The nine views

| ID | Surface | Route | Findings |
| --- | --- | --- | --- |
| [V1](views/V1-me-dashboard.md) | Member dashboard (flag **off**) | `/me` | D1, D2, D3 |
| [V2](views/V2-me-social-profile.md) | Social profile v3 (flag **on**) | `/me` | G1, G2, G3, S3 |
| [V3](views/V3-profile-editor.md) | Profile editor | `/me/profile` | P1, P2, S1, G1, G6 |
| [V4](views/V4-contestant.md) | Contestant self-service | `/me/contestant` | G4 |
| [V5](views/V5-vote-records.md) | Votes, transactions, history | `/me/votes`, `/me/transactions`, `/me/history` | P3, X3, D3 |
| [V6](views/V6-watching.md) | Watch list | `/me/watching` | D3 |
| [V7](views/V7-settings.md) | Settings and account | `/me/settings` | G5, X1 |
| [V8](views/V8-public-profile.md) | Public member profile | `/p/[voterId]` | P4, X2, S2, S4, S5 |
| [V9](views/V9-contestant-public.md) | Contestant public profile | `/o/…/[contestantSlug]` | S6 |

---

## What this package does not contain

- **Screenshots.** Every member view requires authentication, and this audit ran
  without credentials. `assets/diagrams/` holds structural wireframes derived
  from source instead; `assets/README.md` specifies exactly which screenshots to
  capture and how to name them so they slot into the existing links.
- **A retention policy.** Finding `X1` is blocked on one. The requirement is
  written; the policy itself is a business decision, not an engineering artifact.
- **Fixes.** No application code was changed in producing this package.
