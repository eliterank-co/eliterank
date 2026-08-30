# V2 — Member profile (748px single-axis, owner view)

| | |
| --- | --- |
| **Route** | `/me`, when the profile experience renders |
| **Design of record** | commit `6b665a8` (#158) — single-axis 748px layout, medals grid, live-round dual experience, story cards |
| **Source** | `src/app/(public)/(member)/me/_v3/page-v3.tsx` → `src/components/profile/profile-page-view.tsx` (`profile-hero`, `featured-gallery`, `track-record-view`, `competition-detail-sheet`, `timeline`, `interests-and-fans`), `src/components/vote/profile-vote-module.tsx`, `src/components/share/{share-card-modal,share-sheet}.tsx` |
| **Data** | `loadPublicProfile`, `loadMemberProfileExtras`, `loadLiveEntries`, `loadTrackRecord`, `loadMyTimeline`, `listFansOfVoter`, `listActiveBonusTasks`, `listMyWatching` |
| **Findings** | [R2](../findings.md#r2--the-bonus-task-checklist-can-never-show-progress-and-shows-the-wrong-tasks-on-a-second-live-round), [R3](../findings.md#r3--the-profile-experience-demotes-all-member-navigation-to-the-avatar-menu), [R13](../findings.md#r13--view-as-visitor-is-still-a-one-way-trip), [R21](../findings.md#r21--host-identity-on-the-profile-decide-whether-the-track-record-is-enough), [R23](../findings.md#r23--dead-profile-components-left-behind-by-the-redesign); shared with V8: R9, R10, R11, R15 |
| **Tests** | [`V2-member-profile.spec.ts`](../tests/e2e/V2-member-profile.spec.ts), [`dead-components.test.ts`](../tests/unit/dead-components.test.ts) |

## What it does today

One centered 748px column: owner strip (Preview Mode toggle + "View as
visitor" link) → hero (136px gold-ring avatar, city badge, headline, clamped
bio, social chips, pinned link, counts row Fans/Crowns/Competitions/Watching,
Story Card + Edit Profile + Share) → live-round module (owner: "Your Live
Standing" + bonus-task checklist with progress bar; the visitor dual lives on
V8) → "Photos + intro" gallery with lightbox → "Verified Track Record"
medals grid (row layout ≤2 entries, 4-column grid 3+, tier rings, filter tabs
when hosting exists, detail sheet per entry) → collapsible Timeline →
Interests chips + Fan community card → story-card modal.

The layout drops the member-area header and tabs (`me/layout.tsx:76-81`) —
by design for the duplicate name. Member destinations (Settings, My votes,
Watching, …) stay reachable through the app-shell avatar menu
(`menu.ts:182-194`), but what was tab-level navigation becomes dropdown-only
(R3 — reachability holds, discoverability is the question), and the page body
itself offers only "Edit Profile".

## Requirements

- **RQ-V2-1** Every count and state on this page derives from the member's
  record (REQ-07, REQ-08): checklist completion from submissions, task lists
  keyed per competition, story-card roles from real standing.
- **RQ-V2-2** The rest of the member area is reachable from this page without
  typing a URL (holds today via the avatar menu), and the placement of that
  navigation is a recorded design decision, not an accident of the layout
  change.
- **RQ-V2-3** Owner-only modules (Watching count, bonus checklist) never
  render for a visitor or in Preview Mode (REQ-15) — while the owner strip
  itself stays in Preview Mode, because it hosts the only exit.
- **RQ-V2-4** One component per concern: superseded profile components are
  retired, not left exporting colliding names.

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V2-01` | A contestant with an approved bonus submission sees that task checked, the "N/N Done" fraction and progress bar reflecting it. | R2 | `T-AC-V2-01` |
| `AC-V2-02` | A member live in two competitions sees each round's own task list under its own module — no cross-competition bleed. | R2 | `T-AC-V2-02` |
| `AC-V2-03` | **Guard + decision:** from the profile experience at `/me`, Settings, My votes, and Watching each remain reachable by visible UI in ≤2 interactions (today: avatar menu → item), on desktop and mobile widths — and the demotion of these destinations from tabs to a dropdown is either reversed or recorded as the intended design. | R3 | `T-AC-V2-03` (guard) + Manual (decision) |
| `AC-V2-04` | Leaving the owner view for the public render always has a visible way back — either the one-way `/p/…` link is gone (Preview Mode remains), or `/p/[voterId]` recognises its owner and renders a return affordance. | R13 | `T-AC-V2-04` |
| `AC-V2-05` | A recorded decision on host identity in the hero (track record sufficient vs. org named in hero), implemented as decided. | R21 | Manual |
| `AC-V2-06` | `src/components/profile/hero.tsx` and `src/components/vote/profile-vote-panel.tsx` are deleted or carry a deprecation note; no two files export `ProfileHero`. | R23 | `T-AC-V2-06` (unit, post-fix — skipped until the R23 cleanup lands) |
| `AC-V2-07` | **Guard:** in Preview Mode, the Watching count, bonus checklist, and Edit affordance are absent while the owner strip (with Exit Preview) remains; on `/p/[voterId]` the owner strip is absent too (checked by `T-AC-V8-08`). | — | `T-AC-V2-07` |
