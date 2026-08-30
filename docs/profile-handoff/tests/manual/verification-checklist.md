# Verification checklist

Sign-off sheet for hand-off. A finding is **closed** when every criterion it
maps to passes and its row here is signed.

Record the flag path for every row (REQ-03). A result without it is not
evidence.

## Before you start

- [ ] Confirmed whether the `feature_flags` row for `social_profile` exists
      (**not** just the `ui_override` cookie). Recorded here: ................
- [ ] Fixture accounts seeded — see [tests/README.md](../README.md#preconditions)
- [ ] Test environment base URL recorded: ................

---

## Automated

Run first; these need no judgement.

| Criterion | Test | Flag | Result | Notes |
| --- | --- | --- | --- | --- |
| `AC-V3-01` | `T-AC-V3-01` (unit + e2e) | either | ☐ | pasted URL → handle |
| `AC-V3-02` | `T-AC-V3-02` | either | ☐ | error names the field |
| `AC-V3-03` | `T-AC-V3-03` (unit) | n/a | ☐ | parity with contestant editor |
| `AC-V3-04` | `T-AC-V3-04` | either | ☐ | video save reports no error |
| `AC-V3-06` | `T-AC-V3-06` | either | ☐ | interests editable, or panel removed |
| `AC-V1-01` | `T-AC-V1-01` | off | ☐ | no hardcoded tier |
| `AC-V1-02` | `T-AC-V1-02` | off | ☐ | real win count |
| `AC-V1-03` | `T-AC-V1-03` | off→on | ☐ | agrees with hero Crowns |
| `AC-V1-04` | `T-AC-V1-04` | off | ☐ | watch tile matches `/me/watching` |
| `AC-V1-05` | `T-AC-V1-05` | off | ☐ | labels stable across roles |
| `AC-V2-01` | `T-AC-V2-01` | on | ☐ | host org named in hero |
| `AC-V2-02` | `T-AC-V2-02` | on | ☐ | open bonus tasks on own profile |
| `AC-V2-05` | `T-AC-V2-05` | on | ☐ | **guard** — should pass today |
| `AC-V4-01` | `T-AC-V4-01` | off | ☐ | tier label present |
| `AC-V4-02` | `T-AC-V4-02` | off | ☐ | eliminated keeps tier |
| `AC-V4-03` | `T-AC-V4-03` | off | ☐ | tier per competition |
| `AC-V5-01` | `T-AC-V5-01` | off | ☐ | hosting appears in history |
| `AC-V5-02` | `T-AC-V5-02` | off | ☐ | role on every entry |
| `AC-V5-03` | `T-AC-V5-03` | off | ☐ | one surface, paid as filter |
| `AC-V5-05` | `T-AC-V5-05` | off | ☐ | ledger framing preserved |
| `AC-V6-01` | `T-AC-V6-01` | off→on | ☐ | counts agree |
| `AC-V6-02` | `T-AC-V6-02` | off | ☐ | **guard** — should pass today |
| `AC-V7-01` | `T-AC-V7-01` | off | ☐ | password/email one step away |
| `AC-V7-03` | `T-AC-V7-03` | off | ☐ | **gated on `AC-V7-06`** |
| `AC-V7-04` | `T-AC-V7-04` | off | ☐ | **gated on `AC-V7-06`** |
| `AC-V7-05` | `T-AC-V7-05` | off | ☐ | **gated on `AC-V7-06`** |
| `AC-V8-01` | `T-AC-V8-01` | on | ☐ | owner can return |
| `AC-V8-02` | `T-AC-V8-02` | on | ☐ | visitor sees no preview strip |
| `AC-V8-03` | `T-AC-V8-03` | on | ☐ | one relationship term |
| `AC-V8-04` | `T-AC-V8-04` | on | ☐ | story card 200 + PNG |
| `AC-V8-05` | `T-AC-V8-05` | on | ☐ | no raw hex in social marks |
| `AC-V8-07` | `T-AC-V8-07` | on | ☐ | **guard** — should pass today |
| `AC-V9-01` | `T-AC-V9-01` | either | ☐ | vote affordance present |
| `AC-V9-02` | `T-AC-V9-02` | either | ☐ | disabled state explains itself |

---

## Visual — needs a person

Capture the matching screenshot from
[assets/README.md](../../assets/README.md) as evidence for each.

| Criterion | Check | Flag | Asset | Result |
| --- | --- | --- | --- | --- |
| `AC-V3-05` | Saved intro video shows a poster frame, never black | either | `IMG-V3-c` | ☐ |
| `AC-V3-08` | "Link" and "Pinned Link" tell apart at a glance; placeholders differ | either | `IMG-V3-b` | ☐ |
| `AC-V2-03` | Hero avatar at agreed size; identity text left-aligned | on | `IMG-V2-a` | ☐ |
| `AC-V8-04` | Story card composition matches the agreed design | on | `IMG-V8-c` | ☐ |
| `AC-V8-06` | Share control labelled at 390px, not a bare glyph | on | `IMG-V8-b` | ☐ |

Also confirm across both themes and the unstamped system default (REQ-07):

- [ ] Light
- [ ] Dark
- [ ] System default (no explicit theme set)

---

## Written decisions — not code

These close when a document exists, not when a test passes.

| Criterion | Decision needed | Owner | Result |
| --- | --- | --- | --- |
| `AC-V7-06` | **Retention policy** — per role, what is erased, tombstoned, retained, and on what basis. **Gates `AC-V7-03`, `04`, `05`.** | | ☐ |
| `AC-V7-02` | Phone number in v2: implement, or record as dropped with the SMS consequence noted | | ☐ |
| `AC-V5-04` | Votes received: fields, ordering, and whether voter identity is shown to the contestant | | ☐ |
| `AC-V3-07` | Age and video prompts: implement, or record as intentional drops | | ☐ |
| `AC-V8-03` | Relationship term — "fan" or "watch" — applied everywhere in one pass | | ☐ |

---

## Sign-off

| | |
| --- | --- |
| Verified by | |
| Environment | |
| `feature_flags` row present | ☐ yes ☐ no |
| Findings closed | ....... of 22 |
| Findings deferred, with reason | |
