# Findings

24 findings (R1–R24), all verified against `eliterank-co/eliterank-app` at
`c2f45dd`. Severity is about consequence, not effort. Every finding links to
the view it lives on and the acceptance criteria that close it. The old→new
mapping and the resolved list are at the bottom.

Class key: **Defect** reproduces from source · **Policy** blocked on a written
decision · **Product** a capability the product owes its users · **Craft**
design and clarity. Counts: 13 defect · 3 policy · 5 product/decision ·
3 craft.

---

## R1 — Becoming a fan is impossible on the redesigned profile
**Class:** Defect (regression) · **View:** [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-01`

The fan toggle worked before #158 and its code still exists — it is simply no
longer mounted anywhere. A visitor sees the fan community card and the "Fans"
count but has no way to join it.

```
src/app/(public)/p/[voterId]/fan-button.tsx   FanButton + toggleFan intact.
Zero imports of FanButton anywhere in src/ at c2f45dd (the only reference
  outside the file is a comment in the legacy crossover page).
src/components/profile/profile-page-view.tsx  renders InterestsAndFans
  (avatar stack, count, owner-only "Invite Fans") — no visitor toggle.
```

**Fix.** Mount a fan CTA in the redesigned layout — hero actions row or the
fan community card — reusing `FanButton`/`toggleFan`. The fan rows drive
`api/cron/fan-digest`; this is a re-mount, not a data change.

---

## R2 — The bonus-task checklist can never show progress, and shows the wrong tasks on a second live round
**Class:** Defect · **View:** [V2](views/V2-member-profile.md) · **Closes with:** `AC-V2-01`, `AC-V2-02`

#158 put the forward-looking checklist on the owner's live-round module — the
right call. Two bugs undercut it:

```
src/app/(public)/(member)/me/_v3/page-v3.tsx:39-48
  tasks load only for liveEntries[0].competitionId, and every task maps to
  { …, completed: false }  (line 46) — completion is hardcoded.
src/components/vote/profile-vote-module.tsx:67-71
  the single bonusTasks array renders inside entries.map(...), so a member
  live in two competitions sees competition #1's tasks under both rounds.
```

Result: "0/N Done" forever, a progress bar stuck at 0%, and strike-through
styling that no state can trigger — plus cross-competition task bleed.

**Fix.** Join the member's approved bonus submissions against
`listActiveBonusTasks` per competition, and key the task list by entry.
REQ-07, REQ-08.

---

## R3 — The profile experience demotes all member navigation to the avatar menu
**Class:** Craft (discoverability) · **View:** [V2](views/V2-member-profile.md) · **Closes with:** `AC-V2-03`

The member layout drops its header **and tab bar** for every `/me/*` route
when the profile experience is active. The destinations stay reachable — the
app-shell avatar menu links all of them, in both experiences, at all widths —
but what was first-class tab navigation becomes dropdown-only.

```
src/app/(public)/(member)/me/layout.tsx:76-81
  if (await getUiFlag('social_profile')) return bare container — no MeHeader,
  no MeTabs, for all children (settings, votes, watching, contestant included).
src/experiences/voter/chrome/menu.ts:182-194
  buildV2Menu links /me/votes, /me/watching, /me/history, /me/transactions,
  /me/settings (+ /me/contestant for contestants). Rendered on every route
  through the app shell: (public)/layout.tsx:16 → AppNav (shell/nav.tsx:43)
  → HeaderWidgets (shell/header-widgets.tsx:20,44) → the avatar dropdown.
src/app/(public)/(member)/me/_components/tabs.tsx:19-26
  the dashboard experience's tab bar — surface-level nav for /me/votes,
  /me/watching, /me/settings; gone under the profile experience.
src/components/nav/thumb-bar.tsx:15-20
  mobile bar links /me, /discover, /notifications, /me/profile — nothing else.
```

Settings, My votes, and Watching sit two interactions away (open avatar menu
→ click), and the profile page body itself offers only "Edit Profile".
Reachability holds; discoverability of the primary member destinations is the
finding.

**Fix.** A design decision, recorded: either surface navigation on the
profile experience (a compact nav row, quick links, per-page headers), or an
explicit decision that the avatar menu is the intended primary navigation for
member destinations. `AC-V2-03` guards the reachability floor either way.

---

## R4 — The editor captures fields the profile never renders
**Class:** Defect · **Views:** [V3](views/V3-profile-editor.md), [V2](views/V2-member-profile.md) · **Closes with:** `AC-V3-03`

Three fields round-trip through the editor and the data layer, then hit a
dead end in the redesigned layout:

```
LinkedIn — collected (profile-edit.tsx:578), validated and saved
  (src/lib/actions/profile.ts:82,116), served (public-profile.ts:92) —
  and never rendered: src/components/profile/profile-hero.tsx renders chips
  for instagram, tiktok, twitter (X), website, pinned link only (113-178).
Cover image — editor upload field (profile-edit.tsx:444); the only renderer
  was the pre-#158 hero (src/components/profile/hero.tsx:128-129), which is
  now dead code. ProfilePageView never touches profile.coverImage.
Occupation — stored and served on PublicProfile; the new hero takes headline,
  not occupation (profile-hero.tsx props).
```

A member who fills these in sees them vanish. That is a data-honesty failure
in the opposite direction from R6/R7: real data, silently dropped.

**Fix.** For each field: render it in the new layout, or remove it from the
editor and the payload. Per field, that is a product decision — record it.
LinkedIn is presumably a straight omission (the icon-chip pattern is in the
same file); cover image and occupation need an actual call given the
single-axis design has no cover slot.

---

## R5 — Save errors are fieldless raw codes
**Class:** Defect · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-01`

The normalization half of the old P1 is fixed — `extractSocialHandle`
(`src/lib/actions/profile.ts:39-58`) accepts pasted URLs for all four
networks. What remains is the error contract:

```
src/lib/actions/profile.ts:100
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
src/experiences/voter/profile/profile-edit.tsx:760-768
  {error && … Couldn't save: {error}}   — the raw code renders verbatim.
```

A member who trips any validation rule sees `Couldn't save: invalid_input`
with no field marked. Other codes (`pinned_link_must_be_http_url`,
`profile_update_failed`) also print raw.

**Fix.** Return per-field errors from `saveOwnProfile`; map codes to human
copy in the form (the media path already has `MEDIA_ERROR_COPY` at
profile-edit.tsx:125 — extend the pattern). REQ-11.

---

## R6 — "Gold member" is hardcoded for every member
**Class:** Defect · **View:** [V1](views/V1-me-dashboard.md) · **Closes with:** `AC-V1-01`

Unchanged since the prior audit; reproduces verbatim in two places.

```
src/app/(public)/(member)/me/page.tsx:111
  <Stat label="Member tier" value="Gold" highlight />
src/app/(public)/(member)/me/_components/header.tsx:75
  ♔ Gold member    — literal badge in the member-area header.
```

**Fix.** Derive tier from something real, or remove both until a tier model
exists. REQ-07.

---

## R7 — "Active wins" is hardcoded to zero for non-hosts
**Class:** Defect · **View:** [V1](views/V1-me-dashboard.md) · **Closes with:** `AC-V1-02`, `AC-V1-03`

```
src/app/(public)/(member)/me/page.tsx:107-109
  label={isHost ? 'Orgs owned' : 'Active wins'}
  value={isHost ? orgs.length.toString() : '0'}
```

A crowned member is shown zero wins, and the tile changes meaning by role.
The real number now exists twice over: `loadTrackRecord(...).crownsCount` and
`loadMemberProfileExtras(...).counts.crowns` both count crowned entries from
`loadPerformance`.

**Fix.** Wire the tile to the crown count; give hosts a separate tile.
REQ-07.

---

## R8 — "Markets watched" counts something else
**Class:** Defect · **Views:** [V1](views/V1-me-dashboard.md), [V6](views/V6-watching.md) · **Closes with:** `AC-V1-04`, `AC-V6-01`

Half-fixed since the prior audit: the quick-action card is now real
(`me/page.tsx:195-199` shows `listMyWatching().length` as "N saved"). The stat
tile above it still reports distinct competitions the member has *voted in*:

```
src/lib/data/voter.ts:188-196
  const markets = new Set(data.map(v => v.competition_id))  — rows from votes;
  returned as marketsWatched.
src/app/(public)/(member)/me/page.tsx:102-104
  <Stat label="Markets watched" value={stats.marketsWatched…} />
```

The same page can therefore show "Markets watched: 4" beside "0 saved".

**Fix.** Rename the tile to "Competitions voted in", or point it at
`listMyWatching`. Every watching number across the app (tile, quick action,
hero "Watching" count) must agree on its source. REQ-08.

---

## R9 — The story-card modal shares no card, and lets anyone be a WINNER
**Class:** Defect · **Views:** [V2](views/V2-member-profile.md), [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-03`, `AC-V8-04`, `AC-V8-05`

#158's `ShareCardModal` is a good frame with three honesty gaps:

```
src/components/share/share-card-modal.tsx
  - The "card" is a styled DOM preview; there is no image generation and no
    download. "Share Story" calls navigator.share with title/text/url only —
    despite the copy "Share your official 9:16 story card to Instagram,
    TikTok or X". The real 1080×1920 renderer exists at
    src/app/(public)/p/[voterId]/story-card/route.tsx and is reachable only
    through the separate ShareSheet's "Download card".
  - roleOptions renders all five tabs (NOMINATED / CONTESTANT / VOTING OPEN /
    HOST / WINNER) for every member; nothing checks the record. REQ-10.
  - competitionTitle defaults to the literal "Most Eligible"
    (share-card-modal.tsx:38) — a brand name rendered as fact when no
    competition is passed.
```

The hero also carries two overlapping share affordances — the gold "Story
Card" button (this modal) and the "Share" ShareSheet — with different
capabilities and no signposting.

**Fix.** Make the modal's share/download path emit the actual story-card
image (the route exists); constrain role tabs to states the member's record
supports; drop the "Most Eligible" fallback; converge on one share surface or
name the difference.

---

## R10 — Concluded hosted competitions read "CLOSES <past date>"
**Class:** Defect · **Views:** [V2](views/V2-member-profile.md), [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-06`

```
src/lib/data/track-record.ts:210
  dates: comp.voting_ends_at
    ? `CLOSES ${new Date(comp.voting_ends_at).toLocaleDateString(…)}`
    : "CONCLUDED",
```

Any hosted competition with a `voting_ends_at` — which is every competition
that ran — shows "CLOSES Aug 12" forever, including long after it closed.
Competed entries handle this correctly ("LIVE ROUND"/"CONCLUDED" by phase,
line 169); hosted entries never check the phase or compare the date to now.

**Fix.** Same phase/date logic as competed entries. REQ-07.

---

## R11 — Every below-top-10 result is labelled "FINALIST"
**Class:** Defect · **Views:** [V2](views/V2-member-profile.md), [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-07`

```
src/lib/data/track-record.ts:65-75
  derivePlacementLabel: WINNER / 2ND / 3RD / TOP 5 / TOP 10 … else "FINALIST".
src/lib/data/track-record.ts:57-63
  deriveTier: …placement <= 5 → bronze, else "finalist".
```

The medals grid restored achievement framing — the right direction, and
"Eliminated" no longer appears anywhere in the track record. But the fallback
overshoots: a contestant eliminated in round 1 of a 200-person field is
labelled "FINALIST" on a section titled **Verified** Track Record. An
inflated claim on a verification surface is the same class of problem as a
hardcoded "Gold".

**Fix.** Label the fallback by what is known — round reached
(`roundsReached` is already threaded for live entries) or "COMPETED" — and
reserve FINALIST for entries that actually reached a final. The exact ladder
is a product decision; "the label never claims more than the record shows"
is the requirement. REQ-07. Coordinate with R18 so both surfaces share one
ladder.

---

## R12 — Competition history omits hosting
**Class:** Defect · **View:** [V5](views/V5-vote-records.md) · **Closes with:** `AC-V5-01`

The profile's track record now includes hosted competitions
(`track-record.ts:84-113` reads `organization_members`) — but `/me/history`
still builds from votes and watch subscriptions only:

```
src/lib/data/voter-history.ts:103,161
  sources: votes, notify_me_subscriptions. No organization-membership branch.
```

A host sees their competitions on their profile but not in their own history
page.

**Fix.** Add the org-membership source with a role on each entry, or fold
`/me/history` into the track record and retire the page. Share the lookup
`loadTrackRecord` already has.

---

## R13 — "View as visitor" is still a one-way trip
**Class:** Defect · **View:** [V2](views/V2-member-profile.md) · **Closes with:** `AC-V2-04`

Mostly fixed: the owner strip now has an in-place **Preview Mode** toggle
(`profile-page-view.tsx:94-100`) that flips the page to the visitor render
without leaving `/me`. But the strip *also* keeps a "View as visitor" link to
`/p/[voterId]` (lines 87-92), and that page still has no way back:

```
src/app/(public)/p/[voterId]/page.tsx:64
  isOwner={false}   — unconditionally; the page never checks whether the
  session's voter id matches, so no return affordance can render.
```

**Fix.** Either drop the redundant link (Preview Mode covers the need), or
resolve ownership on `/p/[voterId]` and render a return strip.

---

## R14 — Account deletion has no host, contestant, or winner guards
**Class:** Policy · **View:** [V7](views/V7-settings.md) · **Closes with:** `AC-V7-03`, `AC-V7-04`, `AC-V7-05`, `AC-V7-06`

Unchanged since the prior audit. The deletion module is entirely execution —
cascade, cache invalidation, storage sweep:

```
src/lib/account-deletion.ts — finalizeAccountDeletion et al.; no precondition
  blocks a host mid-competition, no approval path for an active contestant,
  no retention carve-out for a past winner.
src/app/(public)/(member)/me/settings/account-danger-zone.tsx:25
  the only surfaced ownership failure is 'organization_lookup_failed', which
  verifies during deletion rather than blocking it.
```

Deleting a past winner destroys the result record the platform exists to
certify.

**Blocked on** a written retention policy naming, per role, what is erased,
tombstoned, and retained. Guards follow from that document. Retention
carve-outs will need schema work — that lands in `eliterank-infra`
migrations, coordinated with the PII work already open there. REQ-14.

---

## R15 — "Fans" and "Watching" still coexist as concepts
**Class:** Policy · **Views:** [V2](views/V2-member-profile.md), [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-02`

The redesign made the collision more visible, not less: the hero counts row
renders **Fans** and **Watching** side by side
(`profile-hero.tsx:183-218`), and the fan community card sits at the bottom
of the same page. They are different relationships (fan = follows this
member; watching = member's own saved competitions) wearing labels that read
as one.

**Blocked on** the naming decision. Apply it across profile, competition
pages, and the digest email in one pass; the fan rows drive
`api/cron/fan-digest`, so this is a label-layer change only. Resolve together
with R1 (the toggle re-mount fixes the mechanism; this fixes the words).
REQ-09.

---

## R16 — Votes cast and votes received belong in one ledger
**Class:** Policy · **View:** [V5](views/V5-vote-records.md) · **Closes with:** `AC-V5-02`, `AC-V5-03`

Unchanged: `/me/transactions` is the vote history filtered to paid —

```
src/app/(public)/(member)/me/transactions/page.tsx:27-33
  getMyVoteHistory(session.userId, 100) … filter(amountPaidCents > 0)
```

— and votes *received* exist nowhere in the member area, despite the profile
now rendering per-entry vote totals.

**Blocked on** the shape: one "My Votes" surface with cast and received as
sections, paid as a filter. Received votes are net-new scope (who voted, for
which entry, whether voter identity is ever shown).

---

## R17 — Interests still cannot be set
**Class:** Product · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-06`

The misleading half of the old finding is gone — the interests card renders
only when tags exist (`interests-and-fans.tsx:32`), so no empty panel points
at a missing control. But the control is still missing:

```
src/experiences/voter/profile/profile-edit.tsx:303
  // Interests do not yet have an editor; preserve the loaded value.
src/lib/actions/profile.ts:84-86 — interests round-trip unchanged.
src/lib/data/taxonomy-tags.ts — #158 added the approved-tag taxonomy and
  cleanTagLabel; the render side is ready.
```

For any member without imported tags, the interests feature does not exist.

**Fix.** Ship the editor (chip picker over the taxonomy), or decide interests
are out and remove the payload field and card.

---

## R18 — The contestant tab still reads "Eliminated" as the whole story
**Class:** Product · **View:** [V4](views/V4-contestant.md) · **Closes with:** `AC-V4-01`, `AC-V4-02`

The profile's medals grid frames every result as an achievement; the
contestant self-service tab does not:

```
src/app/(public)/(member)/me/contestant/page.tsx:175-182
  Lifetime votes | Placement #n | Status: 'Eliminated' | 'Active'
src/components/contestants/tier-badge.tsx — exists, unused on this surface.
```

One product, two framings of the same result — and the harsher one is on the
page the contestant themselves manages.

**Fix.** Reuse the track-record tier/label derivation (or `tier-badge`) on
this tab so both surfaces tell the same story. Coordinate the label ladder
with R11.

---

## R19 — Password, email, and phone are unreachable from the member area
**Class:** Product · **View:** [V7](views/V7-settings.md) · **Closes with:** `AC-V7-01`, `AC-V7-02`

Unchanged: settings offers profile links, a digest toggle, sign-out, and the
danger zone. No link to `/account` (where password/email management lives, in
the crossover group); phone has no representation; "Push and SMS preferences
land in a later phase" is still the stub copy
(`src/app/(public)/(member)/me/settings/page.tsx`).

The settings page itself is reachable in both experiences through the
app-shell avatar menu (`menu.ts:194`; R3 tracks the discoverability of that
placement) — but from settings, password and email are still a dead end.

**Fix.** Link `/account` from settings now; fold those sections in when the
crossover retires. Phone needs a product decision — SMS notification plans
depend on it.

---

## R20 — Age on the profile is an undecided product question
**Class:** Product decision · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-07`

The redesigned hero shows a city badge and headline — no age, and birthdate
is deliberately outside the editor (`src/lib/actions/profile.ts:5`). The
prior packet framed this as a parity gap with the old product; that framing
is retired. What remains owed is the decision itself: **does a member's age
appear on their public profile?** It touches 18+ eligibility handling, so it
should be decided deliberately and recorded, whichever way it goes.

**Fix.** A recorded decision. If "no", this closes with a line in the
product notes; if "yes", it becomes an editor + hero + privacy scope.

---

## R21 — Host identity on the profile: decide whether the track record is enough
**Class:** Product decision · **View:** [V2](views/V2-member-profile.md) · **Closes with:** `AC-V2-05`

Partially superseded: hosting is now visible — the track record renders
hosted entries with a Host badge and a "N Hosted" count
(`profile-page-view.tsx:167-175`, `track-record-view.tsx:59-65`). The hero
itself still carries no host identity (no organization name near the name).

**Fix.** Decide: is track-record placement sufficient host identity, or does
the hero name the organization? If the latter, `loadTrackRecord` already
fetches org membership — pass it up rather than adding a second lookup.

---

## R22 — "Link" and "Pinned Link" are still indistinguishable in the editor
**Class:** Craft · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-05`

Unchanged since the prior audit:

```
src/experiences/voter/profile/profile-edit.tsx:591-623
  "Link"        placeholder https://yourwebsite.com   → globe icon chip
  "Pinned Link" placeholder https://yourlink.com      → labelled hero CTA
  "Pinned Link Label" — the button text, unexplained.
```

**Fix.** Relabel to what each produces — "Website", and "Featured link" with
its label described as button text — or drop one.

---

## R23 — Dead profile components left behind by the redesign
**Class:** Craft · **View:** [V2](views/V2-member-profile.md) · **Closes with:** `AC-V2-06`

#158 replaced components without retiring them, and the survivors are traps —
two of them export the same name:

```
src/components/profile/hero.tsx       exports ProfileHero — dead (the live one
  is profile-hero.tsx; both export `ProfileHero`); also the only renderer the
  cover image ever had (R4).
src/components/vote/profile-vote-panel.tsx  — no consumers.
src/app/(public)/p/[voterId]/fan-button.tsx — no consumers (R1: should be
  re-mounted, not deleted).
```

**Fix.** After R1 and the R4 decisions land: delete `hero.tsx` and
`profile-vote-panel.tsx` (with their tests), or mark them with a deprecation
note naming the replacement. An import of the wrong `ProfileHero`
type-checks today.

---

## R24 — The editor's video preview still paints a black frame
**Class:** Defect · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-04`

The public profile's black-frame bug is fixed — `FeaturedGallery` posters the
video with the avatar (`featured-gallery.tsx:78`). The shared preview
component the **editor** (and the Classic crossover view) render was not
touched:

```
src/components/profile/panels.tsx:104-112
  <video src={video} controls loop playsInline preload="metadata" …>
  — no poster attribute.
Consumers: profile-edit.tsx:697 (editor preview), profile-view.tsx:358
  (crossover profile).
```

A member who uploads a video still sees a black tile in the editor they just
used, then a correct poster on their profile.

**Fix.** Same poster fallback in `panels.tsx`. One-line class of fix; the
criterion is that no surface renders an unpostered `<video>`.

---

# Resolved since the prior audit

Fixed by `6b665a8` (#158) unless noted. Recorded so nobody re-files them.

| Old ID | Was | Resolution |
| --- | --- | --- |
| P1 (normalization half) | Pasted social URLs rejected | `extractSocialHandle` normalizes all four networks server-side (`src/lib/actions/profile.ts:39-58`). Residual error contract → **R5**. |
| P2 (profile render half) | Intro video renders black | `FeaturedGallery` posters with the avatar (`featured-gallery.tsx:78`). Editor preview residual → **R24**. The "save reports failure" half did not reproduce at `c2f45dd`: Save is disabled and relabelled "Updating media…" during media commits (`profile-edit.tsx:773-786`, unchanged since `3f6de99` — the prior packet overstated this half). |
| P3 (profile half) | No hosting anywhere in member surfaces | Track record consolidates competed + hosted (`track-record.ts:84-113,180-220`). `/me/history` residual → **R12**. |
| P4 (mechanism) | View-as-visitor one-way | In-place Preview Mode toggle (`profile-page-view.tsx:94-100`). Redundant one-way link residual → **R13**. |
| G3 (visibility) | Bonus tasks visible only after the fact | Checklist now on the owner live-round module (`profile-vote-module.tsx:146-210`). Correctness defects → **R2**. |
| G4 (framing) | Achievement framing gone | Medals grid with gold/silver/bronze tiers and WINNER/2ND/3RD/TOP-N labels (`track-record.ts:57-75`, `track-record-view.tsx`). Residuals → **R11**, **R18**. |
| G1 (empty panel) | Interests panel misleads when empty | Card renders only when tags exist (`interests-and-fans.tsx:32`). Editor residual → **R17**. |
| G2 (visibility) | Host role invisible on profile | Hosted entries + "N Hosted" count in track record. Hero decision → **R21**. |
| S3 | Avatar small, text alignment | 136px avatar with gold ring (`profile-hero.tsx:55`). The "left-align" half of the old criterion is retired: the shipped design is deliberately centered single-axis, and specs follow the design. |
| S4 (icon quality) | Ad-hoc social icon set | Token-driven inline-SVG chips in the hero (`profile-hero.tsx:113-166`). LinkedIn omission → **R4**. |
| S5 | Mobile share affordance unlabelled | ShareSheet trigger renders a visible "Share" text label (`share-sheet.tsx:45,95`). |
| S6 | Verify vote path on contestant profile | Verified in source: the contestant public page has its own `ContestantVoteCta` (`/o/…/[contestantSlug]/vote-cta.tsx`), and the profile carries `ProfileVoteModule` with free-vote + vote packs. Guard criterion `AC-V9-01` retained. |
| D3 (quick action half) | Watch-count card mislabelled | Quick action now shows the real `listMyWatching` count (`me/page.tsx:195-199`). Stat tile residual → **R8**. |
