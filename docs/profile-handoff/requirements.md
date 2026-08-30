# Global requirements

Constraints every fix in this package must satisfy, regardless of which view it
touches. View-specific requirements live in [`views/`](views/).

---

## 1. The `social_profile` flag

**REQ-01 — Never flip the flag in code.**
`src/lib/ui-flags.ts` defaults `social_profile` to off, and the comment above it
is explicit that the default is load-bearing: turning it on in code reaches
every visitor exactly as creating the row would, which consumes a release gate
without the owner walkthrough running. Flip it by creating the `feature_flags`
row — reviewable and instantly reversible.

**REQ-02 — Know which surface you are testing.**
Resolution order is `ui_override` cookie → `feature_flags` row → off.

```
# Force v3 on for your browser only (does not affect production):
document.cookie = 'ui_override=social_profile=on; path=/'
# Force it off:
document.cookie = 'ui_override=social_profile=off; path=/'
```

A cookie override makes your browser disagree with production. Before reporting
"fixed" or "still broken", confirm which path you were on.

**REQ-03 — State the flag path in every bug report and PR.**
`D1`–`D3` cannot reproduce with the flag on; `P4`, `X2`, `S2`, `S6` cannot
reproduce with it off. A report that omits the flag state is not actionable.

---

## 2. Design system

**REQ-04 — v2 uses its own tokens.** This is a Next.js app with CSS custom
properties (`--gold-primary`, `--color-surface-1`, `--color-text-cream`,
`--color-gold-line`). Do not import the legacy `src/styles/theme.js` object or
its inline-style pattern; the two stacks are deliberately different.

**REQ-05 — No raw hex.** Reference tokens. The existing profile components hold
this line, including the hand-inlined brand SVGs, which use `currentColor`
specifically to stay token-driven.

**REQ-06 — Gold is the only accent.** Status colours (success, warning, error)
are for status only, never decoration.

**REQ-07 — Both themes.** Any new surface must resolve in light, dark, and the
unstamped system default.

---

## 3. Data honesty

**REQ-08 — No placeholder that reads as a fact.** A hardcoded tier, a
hardcoded count, or a label describing a different quantity than the one shown
is worse than an omission. Where a real number is unavailable, omit the element.
This rule already has precedent in the codebase: the "Live now" card drops its
close date and prize rather than rendering "TBD" beside "$0", and the watch-list
quick action dropped its count rather than keep a hardcoded "0 saved".

**REQ-09 — A label must name what is counted.** If a tile says "Markets
watched", it counts the watch list, not competitions voted in.

**REQ-10 — One concept, one name.** "Fan" and "watch" must not both refer to
the same relationship across profile, competition pages and digest email.

---

## 4. Error handling

**REQ-11 — Validation errors name the field.** A server action that rejects
input must return enough for the client to mark which input failed. `invalid_input`
alone is not sufficient for a multi-field form.

**REQ-12 — Accept what you advertise.** If a placeholder says "@handle or full
URL", the validator accepts both. Two editors writing the same columns must
apply the same rules.

**REQ-13 — Never report failure for work that succeeded.** Where an interlock
blocks an action, disable the control or queue the action; do not surface the
interlock as an error after the underlying work has already committed.

---

## 5. Records and privacy

**REQ-14 — Competition results are durable.** Deleting an account must not
destroy the record of who won a competition. What is erased, tombstoned or
retained per role is a business decision — see `X1` — and must be written down
before guards are implemented.

**REQ-15 — Compliance overlap.** Deletion work touches open compliance items in
this repo: [#611](https://github.com/eliterank-co/eliterank/issues/611) (PII
lockdown, migration drift) and
[#585](https://github.com/eliterank-co/eliterank/issues/585) (Official Rules
acceptance). Coordinate rather than duplicate.

---

## 6. Testing

**REQ-16 — Every acceptance criterion is provable.** Each `AC-*` must be
verifiable by an automated test or a numbered manual step. No criterion reads
"looks good".

**REQ-17 — Unit-test what does not need auth.** Validation and normalization
logic is testable without a session; that coverage should not wait on E2E
infrastructure.

**REQ-18 — E2E specs declare their flag state.** Every Playwright spec sets the
`ui_override` cookie explicitly rather than inheriting ambient state.

---

## 7. Out of scope

- Flipping `social_profile` on. That is a release decision.
- Retiring the `(legacy)` crossover route group.
- Legacy-app (`eliterank-co/eliterank`) code changes. Findings reference legacy
  only as the parity baseline.
- Building the "votes received" feature. `X3` scopes it; the build is separate.
