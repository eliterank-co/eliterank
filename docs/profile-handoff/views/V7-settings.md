# V7 — Settings and account

| | |
| --- | --- |
| **Routes** | `/me/settings` — with `/account` (crossover) holding password and email |
| **Renders when** | `social_profile` **off** (tab bar) |
| **Source** | `src/app/(public)/(member)/me/settings/{page.tsx,actions.ts,digest-toggle.tsx,account-danger-zone.tsx}`, `src/lib/account-deletion.ts`, `src/experiences/voter/account/` |
| **Diagram** | [`V7-settings.svg`](../assets/diagrams/V7-settings.svg) |
| **Screenshot** | `IMG-V7-a` — not captured, see [assets](../assets/README.md) |
| **Findings** | [G5](../findings.md#g5--password-email-and-phone-are-unreachable-from-the-member-area), [X1](../findings.md#x1--account-deletion-has-no-host-contestant-or-winner-guards) |
| **Tests** | [`V7-settings.spec.ts`](../tests/e2e/V7-settings.spec.ts) |

## What it does today

Three panels: **Profile** (links to `/me/profile`, `/me/history`,
`/me/transactions`), **Notifications** (a weekly digest toggle, with push and
SMS stubbed as "land in a later phase"), and **Sign out**. A danger zone handles
account deletion.

Password and email changing exist as components under
`src/experiences/voter/account/`, reachable only through the legacy-group
`/account` route — which settings does not link to. Phone has no representation
in v2 at all, though legacy collects it and Twilio SMS depends on it.

`src/lib/account-deletion.ts` is entirely execution: cascade, cache
invalidation, storage sweep. It contains no preconditions.

## Requirements

- **RQ-V7-1** Every account control a member needs must be reachable from the
  member area without knowing a legacy URL.
- **RQ-V7-2** Deletion must not be able to destroy a competition result record.
  (REQ-14)
- **RQ-V7-3** A host with a competition that is running, or that has run, must
  not be able to self-serve deletion.
- **RQ-V7-4** An active contestant's deletion requires review rather than
  immediate execution.
- **RQ-V7-5** Every deletion refusal must explain the reason and the route to
  resolution. A blocked control with no explanation is not acceptable.
- **RQ-V7-6** Guards are implemented **after** the retention policy is written,
  not before. (REQ-14)

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V7-01` | Password and email changing are reachable from `/me/settings` in one step. | G5 | `T-AC-V7-01` |
| `AC-V7-02` | A written decision exists on phone number: implemented in v2, or recorded as dropped with the SMS consequence noted. | G5 | Manual — [checklist](../tests/manual/verification-checklist.md) |
| `AC-V7-03` | A host with an active or previously-run competition attempting deletion is refused, with a reason and a route to resolution. | X1 | `T-AC-V7-03` |
| `AC-V7-04` | An active contestant attempting deletion enters a review path rather than immediate execution. | X1 | `T-AC-V7-04` |
| `AC-V7-05` | Deleting a past winner's account leaves the competition result record intact and attributable per the retention policy. | X1 | `T-AC-V7-05` |
| `AC-V7-06` | A retention policy document exists, naming per role what is erased, tombstoned and retained, and on what basis. | X1 | Manual — **gates `AC-V7-03`–`05`** |

## Notes

`AC-V7-06` gates the three criteria above it. Implementing guards before the
policy exists encodes an answer nobody chose — see REQ-14.

This work overlaps open compliance items in the legacy repo:
[#611](https://github.com/eliterank-co/eliterank/issues/611) and
[#585](https://github.com/eliterank-co/eliterank/issues/585). Coordinate rather
than duplicate.
