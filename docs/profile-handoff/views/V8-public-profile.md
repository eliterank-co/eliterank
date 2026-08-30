# V8 — Public member profile

| | |
| --- | --- |
| **Route** | `/p/[voterId]` — renders only under the profile experience (404 otherwise); stated factually for reproduction, not as a requirement |
| **Design of record** | commit `6b665a8` (#158) — same `ProfilePageView` as V2, visitor render |
| **Source** | `src/app/(public)/p/[voterId]/page.tsx` (`isOwner={false}`, public timeline), plus `story-card/route.tsx`, `opengraph-image.tsx`, `fan-button.tsx` (unmounted), `actions.ts` |
| **Data** | `loadPublicProfile`, `loadMemberProfileExtras`, `loadLiveEntries`, `loadTrackRecord(voterId, null)`, `loadPublicTimeline`, `listFansOfVoter` |
| **Findings** | [R1](../findings.md#r1--becoming-a-fan-is-impossible-on-the-redesigned-profile), [R9](../findings.md#r9--the-story-card-modal-shares-no-card-and-lets-anyone-be-a-winner), [R10](../findings.md#r10--concluded-hosted-competitions-read-closes-past-date), [R11](../findings.md#r11--every-below-top-10-result-is-labelled-finalist), [R15](../findings.md#r15--fans-and-watching-still-coexist-as-concepts) |
| **Tests** | [`V8-public-profile.spec.ts`](../tests/e2e/V8-public-profile.spec.ts), [`track-record-labels.test.ts`](../tests/unit/track-record-labels.test.ts), [`share-card-fallback.test.ts`](../tests/unit/share-card-fallback.test.ts) |

## What it does today

The visitor render of the 748px layout: hero (no Watching count, no Edit),
the supporter live-round dual ("Vote for {name}", rank/votes, 3×2 vote-pack
grid linking to checkout, free daily vote, competition-page CTA), gallery,
medals grid, public timeline, interests + fan community card — but **no way
to become a fan** (R1). Share affordances: Story Card modal and ShareSheet
(native share / download 1080×1920 card / copy link).

## Requirements

- **RQ-V8-1** A visitor can act on everything the page advertises: fan count
  → fan toggle; "share your official story card" → an actual card.
- **RQ-V8-2** The Verified Track Record never claims more than the record
  shows (REQ-07): honest placement labels, honest dates, roles derived from
  data (REQ-10).
- **RQ-V8-3** Nothing owner-only reaches this render (REQ-15).

## Acceptance criteria

| ID | Criterion | Finding | Verified by |
| --- | --- | --- | --- |
| `AC-V8-01` | A signed-in visitor can become and stop being a fan from this page; signed out, the control routes through sign-in and back. | R1 | `T-AC-V8-01` |
| `AC-V8-02` | After the R15 naming decision: one term for the fan relationship across profile hero, fan card, competition surfaces, and digest email. | R15 | `T-AC-V8-02` |
| `AC-V8-03` | The story-card modal's share/download path emits the rendered 1080×1920 card (the `story-card` route), not just the URL — or its copy stops promising a card. | R9 | `T-AC-V8-03` |
| `AC-V8-04` | Role states offered in the card modal derive from the member's record: WINNER only with a crown, HOST only with an org, VOTING OPEN only with a live entry — and earned states stay offered (a crowned member keeps WINNER). | R9 | `T-AC-V8-04` (negative + positive fixtures) |
| `AC-V8-05` | No brand/competition literal renders as a fallback ("Most Eligible"); absent data omits the line. | R9 | `T-AC-V8-05` (unit, post-fix — skipped until the R9 fix lands) |
| `AC-V8-06` | Hosted track-record entries show "CLOSES …" only while voting is genuinely open; concluded ones read as concluded. | R10 | `T-AC-V8-06` (unit, contract-first) |
| `AC-V8-07` | The placement-label ladder never overstates: FINALIST (or equivalent) only for entries that reached the qualifying stage; the fallback names what is known (round reached / competed). Ladder recorded as a product decision. | R11 | `T-AC-V8-07` (unit, contract-first) + Manual |
| `AC-V8-08` | **Guard:** Watching count, owner strip, bonus checklist, and Edit control are absent from this render. | — | `T-AC-V8-08` |
