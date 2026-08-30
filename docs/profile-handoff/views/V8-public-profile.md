# V8 — Public member profile

| | |
| --- | --- |
| **Route** | `/p/[voterId]` |
| **Renders when** | `social_profile` is **on**. With the flag off this route returns 404. |
| **Source** | `src/app/(public)/p/[voterId]/{page.tsx,actions.ts,fan-button.tsx,opengraph-image.tsx,story-card/route.tsx}`, `src/components/share/share-sheet.tsx`, `src/components/vote/profile-vote-panel.tsx` |
| **Diagram** | [`V8-public-profile.svg`](../assets/diagrams/V8-public-profile.svg) |
| **Screenshot** | `IMG-V8-a` (desktop), `IMG-V8-b` (mobile) — not captured, see [assets](../assets/README.md) |
| **Findings** | [P4](../findings.md#p4--view-as-visitor-is-a-one-way-trip), [X2](../findings.md#x2--fan-vs-watch-one-concept-two-names), [S2](../findings.md#s2--share-card-design), [S4](../findings.md#s4--social-icon-set), [S5](../findings.md#s5--mobile-share-affordance-is-unclear) |
| **Tests** | [`V8-public-profile.spec.ts`](../tests/e2e/V8-public-profile.spec.ts) |

## What it does today

The same hero and timeline components as V2, rendered for a visitor. Fans list
and count, a fan toggle requiring an account, a live-entry vote panel
(`loadLiveEntries` → `profile-vote-panel.tsx`), a share sheet offering native
share / copy link / download card, an OpenGraph image and a 1080x1920 story card.

The Watching count is deliberately absent — that is owner-private activity.

**This route carries most of the capabilities an earlier review reported
missing.** They are unreachable while the flag is off, not absent.

## Requirements

- **RQ-V8-1** An owner previewing their own public profile must be able to
  return, and must be told they are in a preview.
- **RQ-V8-2** The relationship a visitor forms with a member has exactly one
  name across profile, competition pages and digest email. (REQ-10)
- **RQ-V8-3** Renaming that relationship must not alter what the underlying rows
  mean — `api/cron/fan-digest` consumes them.
- **RQ-V8-4** Owner-private data must never render here. (mirrors `AC-V2-05`)
- **RQ-V8-5** Brand marks stay inline SVG using `currentColor`. (REQ-05)
- **RQ-V8-6** Every action must be identifiable before it is activated,
  including at mobile widths.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V8-01` | An owner arriving from "View as visitor" sees a persistent indication they are previewing, with a control returning to `/me`. | P4 | `T-AC-V8-01` |
| `AC-V8-02` | A visitor who is not the owner sees no preview strip and no return control. | P4 | `T-AC-V8-02` |
| `AC-V8-03` | One term names the member relationship everywhere it appears; digest email and competition pages agree with the profile. | X2 | `T-AC-V8-03` |
| `AC-V8-04` | The story card renders the agreed composition at 1080x1920 and downloads with a sensible filename. | S2 | `T-AC-V8-04` (visual) |
| `AC-V8-05` | Social marks render from the agreed icon set, inline, with no raw hex and no external font. | S4 | `T-AC-V8-05` |
| `AC-V8-06` | At mobile widths the share control carries a text label, not a bare glyph. | S5 | `T-AC-V8-06` (visual) |
| `AC-V8-07` | The Watching count does not appear on this page for any viewer. | — (regression guard) | `T-AC-V8-07` |

## Notes

Every criterion here requires the flag on. With it off the route 404s and the
whole file is untestable — state the flag path in any report (REQ-03).
