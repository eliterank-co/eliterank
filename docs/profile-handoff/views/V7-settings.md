# V7 — Settings and account

| | |
| --- | --- |
| **Route** | `/me/settings` |
| **Source** | `me/settings/page.tsx`, `account-danger-zone.tsx`, `src/lib/account-deletion.ts` |
| **Findings** | [R14](../findings.md#r14--account-deletion-has-no-host-contestant-or-winner-guards), [R19](../findings.md#r19--password-email-and-phone-are-unreachable-from-the-member-area) |
| **Tests** | [`V7-settings.spec.ts`](../tests/e2e/V7-settings.spec.ts) |

## What it does today

Read-only identity fields, links to profile/history/transactions, the digest
toggle ("Push and SMS preferences land in a later phase"), sign out, and the
deletion danger zone. No path to password or email management (those live at
`/account` in the crossover group, unlinked from here); phone does not exist
in this stack. Deletion executes with no role guards (R14). The page itself
is reachable in both experiences through the app-shell avatar menu
(`menu.ts:194`); under the profile experience that menu is the only path
(R3, tracked on V2).

## Requirements

- **RQ-V7-1** Every credential a member can hold — password, email, phone —
  is manageable from, or linked from, this page.
- **RQ-V7-2** Deletion is guarded per role according to a written retention
  policy; guards precede execution, not merely verify during it (REQ-14).

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V7-01` | Password and email management are reachable from `/me/settings` (link to `/account` now; folded in when the crossover retires). | R19 | `T-AC-V7-01` |
| `AC-V7-02` | A recorded decision on phone: collected for SMS, or dropped — with the notification plans updated to match. | R19 | Manual |
| `AC-V7-03` | A host with a live competition cannot complete deletion; the block names the competition and the path (transfer/close first). | R14 | `T-AC-V7-03` (gated on `AC-V7-06`) |
| `AC-V7-04` | An active contestant's deletion follows the policy's approval path rather than executing immediately. | R14 | `T-AC-V7-04` (gated) |
| `AC-V7-05` | Deleting a past winner leaves the competition's result record intact per the retention policy (tombstone semantics as written). | R14 | `T-AC-V7-05` (gated) |
| `AC-V7-06` | The retention policy exists in writing: per role, what is erased, tombstoned, retained, on what basis. **Gates 03–05.** Schema changes it requires are specified as `eliterank-infra` migrations. | R14 | Manual |
