# Findings

22 findings. Severity is about consequence, not effort. Every finding links to
the view it lives on and the acceptance criteria that close it.

Class key: **Defect** reproduces from source · **Policy** blocked on a written
decision · **Gap** legacy does it, v2 does not · **Craft** design and clarity ·
**Verify** needs a live check before filing.

---

## P1 — Saving a profile with a pasted social URL fails with a bare error
**Class:** Defect · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-01`, `AC-V3-02`, `AC-V3-03`

Every social field is validated against a handle charset — letters, digits,
period, underscore, hyphen. Paste a full profile URL and the colon and slashes
fail the pattern; the server answers with one generic code naming no field, so
the form can only show a single undifferentiated error.

```
src/lib/actions/profile.ts:38-43
  handle = trimmed string refined against HANDLE_CHARSET,
  applied to instagram, tiktok, linkedin and twitter.
src/lib/actions/profile.ts:76
  if (!parsed.success) return { ok: false, error: 'invalid_input' }
```

The same four networks behave differently one tab away: the contestant editor
(`/me/contestant`) advertises "@yourhandle or full URL" and accepts both. Two
editors, the same columns, opposite rules.

**Fix.** Normalize URL to handle server-side as the contestant form already
does, and return per-field errors. Satisfies REQ-11 and REQ-12.

---

## P2 — Intro video saves with an error, then renders as a black frame
**Class:** Defect · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-04`, `AC-V3-05`

Two independent bugs stacked into one confusing moment: the upload succeeded,
the save reported failure, and the result displays black.

```
src/components/profile/panels.tsx:104
  <video src={video}>  -- no poster attribute.
src/experiences/voter/profile/profile-edit.tsx
  onSubmit refuses while mediaMutationCount > 0:
  "Finish the current media update before saving your profile."
```

The black frame is the missing poster: a `<video>` with no poster paints black
until the first frame decodes. The error is the media interlock — uploads commit
immediately and Save is deliberately blocked during that window, so a Save
landing mid-upload reports failure even though nothing was lost.

**Fix.** Set a poster (avatar, or a frame captured at upload). Then disable Save
while media is in flight, or queue it — do not surface the interlock as an
error. Satisfies REQ-13.

---

## P3 — Competition history omits hosting entirely
**Class:** Defect · **View:** [V5](views/V5-vote-records.md) · **Closes with:** `AC-V5-01`, `AC-V5-02`

A host who has run competitions sees no trace of them in their own history.

```
src/lib/data/voter-history.ts
  getMyCompetitionHistory reads votes (competitions voted in) and
  notify_me_subscriptions (watching).
  There is no organization-membership branch.
```

**Fix.** Add a third source keyed on org membership and carry a role onto each
entry so the list distinguishes hosted, competed and voted. Shares a lookup with
[G2](#g2--host-role-never-appears-on-a-profile).

---

## P4 — "View as visitor" is a one-way trip
**Class:** Defect · **View:** [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-01`, `AC-V8-02`

The v3 profile offers "View as visitor", which navigates to the public page.
That page has no link back and no awareness that the viewer owns it.

```
src/app/(public)/p/[voterId]/page.tsx
  No /me reference anywhere in the file; renders identically for the owner
  and a stranger apart from the fan button.
```

**Fix.** When the viewer resolves to the profile's own voter id, render a return
affordance. A persistent "You are previewing your public profile — Back to your
view" strip beats a bare link: it also explains why the page looks different.

---

## D1 — "Gold member" is hardcoded for every member
**Class:** Defect · **View:** [V1](views/V1-me-dashboard.md) · **Closes with:** `AC-V1-01`

Tier is a string literal in two places. Every member is told they are Gold,
which makes the tier meaningless the moment two people compare notes.

```
src/app/(public)/(member)/me/page.tsx
  <Stat label="Member tier" value="Gold" highlight />
src/app/(public)/(member)/me/_components/header.tsx
  "Gold member" badge, also literal.
```

**Fix.** Derive tier from something real, or remove both until a tier model
exists. REQ-08.

---

## D2 — "Active wins" is hardcoded to zero for non-hosts
**Class:** Defect · **View:** [V1](views/V1-me-dashboard.md) · **Closes with:** `AC-V1-02`, `AC-V1-03`

An actual past winner is shown zero wins. The same tile also changes meaning by
role, so the grid reads differently depending on who is looking.

```
src/app/(public)/(member)/me/page.tsx
  label={isHost ? 'Orgs owned' : 'Active wins'}
  value={isHost ? orgs.length.toString() : '0'}
```

**Fix.** Wire it to the crown count `loadPerformance` already computes — the v3
hero uses exactly that. Give hosts their own tile rather than overloading this
one.

---

## D3 — "Markets watched" counts something else
**Class:** Defect · **Views:** [V1](views/V1-me-dashboard.md), [V6](views/V6-watching.md) · **Closes with:** `AC-V1-04`

The tile labelled "Markets watched" reports distinct competitions the member has
*voted in*. The watch list is a different set, loaded by a different function,
shown on a different tab.

```
src/lib/data/voter.ts:122
  const markets = new Set(data.map(v => v.competition_id))  -- rows from votes.
src/lib/data/watching.ts
  listMyWatching is what /me/watching and the v3 "Watching" count use.
```

**Fix.** Rename to "Competitions voted in", or point it at `listMyWatching`.
REQ-09. Resolve alongside [X3](#x3--votes-cast-and-votes-received-belong-in-one-ledger).

---

## X1 — Account deletion has no host, contestant or winner guards
**Class:** Policy · **View:** [V7](views/V7-settings.md) · **Closes with:** `AC-V7-03`, `AC-V7-04`, `AC-V7-05`

The deletion module is entirely execution — cascade, cache invalidation, storage
sweep. None of the protections the product needs exist.

```
src/lib/account-deletion.ts
  finalizeAccountDeletion, finalizeDeletedOrganizationStorage,
  hasPendingDeletedOrganizationStorage.
  No precondition blocks a host mid-competition, no approval path for an
  active contestant, no retention carve-out for a past winner.
src/app/(public)/(member)/me/settings/account-danger-zone.tsx:25
  Only ownership check surfaced is organization_lookup_failed, which verifies
  during deletion rather than blocking it.
```

The winner case is the sharp one: deleting a past winner destroys the
competition's result record — the thing the platform exists to certify.

**Blocked on.** A written retention policy naming, per role, what is erased,
tombstoned and retained, on what legal basis. Guards follow from that document;
writing them first bakes in an answer nobody chose. REQ-14, REQ-15.

---

## X2 — Fan vs. watch: one concept, two names
**Class:** Policy · **View:** [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-03`

Becoming a fan already works — it is the visibility that is missing, not the
mechanism.

```
src/app/(public)/p/[voterId]/fan-button.tsx  and  actions.ts
  toggleFan, account required, same rule as voting.
  Reachable only at /p/[voterId], which 404s while social_profile is off.
```

**Blocked on.** Pick the term, then apply it across profile, competition pages
and digest email in one pass. Caution: fan rows drive the digest cron at
`api/cron/fan-digest`, so confirm this is a rename at the label layer and not a
change to what the rows mean. The code records that "Back" was rejected earlier
as fan-funding jargon — keep that reasoning attached to whatever name wins.
REQ-10.

---

## X3 — Votes cast and votes received belong in one ledger
**Class:** Policy · **View:** [V5](views/V5-vote-records.md) · **Closes with:** `AC-V5-03`, `AC-V5-04`

`/me/votes` and `/me/transactions` are two views over the same rows —
transactions is literally the vote history filtered to paid. Votes *received* do
not exist anywhere.

```
src/app/(public)/(member)/me/transactions/page.tsx
  getMyVoteHistory(userId, 100).filter(v => v.amountPaidCents > 0)
No votesReceived concept appears anywhere in the codebase.
```

**Blocked on.** The shape: one "My Votes" surface with cast and received as
sections, paid status as a filter rather than a separate page. Received votes
are net-new and want their own scope — who voted, for which entry, when, and
whether a voter's identity is ever shown to the contestant.

---

## G1 — Interests render but cannot be edited
**Class:** Gap · **Views:** [V2](views/V2-me-social-profile.md), [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-06`

The v3 profile devotes a sidebar panel to Interests. The editor has no field for
it, so for any new member that panel can only ever be empty.

```
src/experiences/voter/profile/profile-edit.tsx
  "Interests do not yet have an editor; preserve the loaded value."
Editor sections: Personal Information, Bio, Connect, Photo Gallery, Intro Video.
```

Legacy is no better — it carries a `handleHobbiesChange` handler with no UI. A
shared gap, not a regression, but v3 makes it visible by giving the empty panel
a heading and empty-state copy pointing at a control that does not exist.

**Fix.** Add the field, or drop the panel and its copy.

---

## G2 — Host role never appears on a profile
**Class:** Gap · **View:** [V2](views/V2-me-social-profile.md) · **Closes with:** `AC-V2-01`

Nothing on the profile marks someone as a host.

```
src/components/profile/hero.tsx -- no role or organization prop.
Host membership loads on the dashboard path only, via listMyOrgs,
and is used to swap a call-to-action.
```

**Fix.** Pass org membership into the hero and render it as identity —
organization name, not a generic badge. Shares a lookup with
[P3](#p3--competition-history-omits-hosting-entirely).

---

## G3 — Bonus tasks are visible only after the fact
**Class:** Gap · **View:** [V2](views/V2-me-social-profile.md) · **Closes with:** `AC-V2-02`

The timeline reports bonuses already earned. The checklist of what remains lives
on the competition page, so a contestant on their own profile is never shown the
actions still open to them.

```
src/lib/data/timeline.ts -- bonus_votes is an event kind, emitted after award.
src/app/(public)/o/[orgSlug]/c/[competitionSlug]/_bonus-tasks-panel.tsx
  -- the actionable checklist, on the competition page.
Legacy renders it on the profile:
  src/features/profile/components/ProfileBonusVotes.jsx
```

**Fix.** Surface open tasks for a member's active entries on their own profile.
This was legacy's strongest earned-vote driver and has no home in v2's member
area.

---

## G4 — Achievement tier framing is gone
**Class:** Gap · **View:** [V4](views/V4-contestant.md) · **Closes with:** `AC-V4-01`, `AC-V4-02`

Legacy labels a contestant by the tier they reached — "Top 50 Contestant",
"Entry Round" — and keeps that label after elimination, so the card reads as a
record of how far someone got. The v2 contestant tab reports a placement number
and a binary status.

```
src/app/(public)/(member)/me/contestant/page.tsx
  Lifetime votes | Placement #n | Status: Active or Eliminated
src/components/contestants/tier-badge.tsx exists, unused on this surface.
Legacy derivation: ProfileView.jsx:190-207 and ProfileCompetitions.jsx,
  from contestants_advance on the surviving round.
```

**Fix.** Reuse the existing tier badge on the contestant tab and in history.
"Eliminated" as a bare status is the harshest possible reading of a result the
legacy app framed as an achievement.

---

## G5 — Password, email and phone are unreachable from the member area
**Class:** Gap · **View:** [V7](views/V7-settings.md) · **Closes with:** `AC-V7-01`, `AC-V7-02`

Settings offers profile links, a digest toggle and sign out. Nothing else.

```
src/app/(public)/(member)/me/settings/page.tsx
  Panels: Profile (links to /me/profile, /me/history, /me/transactions),
  Notifications, Sign out. No link to /account.
Password and email live at src/experiences/voter/account/, reachable only via
  the legacy-group /account route.
Phone has no representation in v2 at all.
Push and SMS are stubbed: "Push and SMS preferences land in a later phase."
```

**Fix.** Link `/account` from settings now; fold those sections into
`/me/settings` when the legacy group retires. Phone needs a decision — legacy
collects it and Twilio SMS depends on it.

---

## G6 — Age, and video prompts, have no v2 equivalent
**Class:** Gap · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-07`

Legacy renders "Chicago, 27" under the name. The v3 hero takes city and
occupation; there is no age, and birthdate sits outside the editor by design.
Legacy's video prompts have no counterpart anywhere in v2.

```
src/features/profile/components/ProfileView.jsx:418
  {city}{age ? ', ' + age : ''}
src/experiences/voter/profile/profile-edit.tsx
  "leaving occupation and birthdate untouched because they are outside
   this editor."
```

**Fix.** Confirm both are intentional drops. Age on a public profile deserves a
deliberate choice rather than an inherited one, given the 18+ work in
[#586](https://github.com/eliterank-co/eliterank/issues/586).

---

## S1 — Pinned Link and Link are indistinguishable in the editor
**Class:** Craft · **View:** [V3](views/V3-profile-editor.md) · **Closes with:** `AC-V3-08`

They sit near each other with near-identical empty placeholders —
`https://yourwebsite.com` against `https://yourlink.com` — and nothing explains
the difference. Underneath they are genuinely different: `website` becomes an
icon in the social row; `pinnedLink` becomes a labelled call-to-action in the
hero, which is why it has a second field for its button text.

**Fix.** Relabel to what each produces — "Website", and "Featured link" with its
label field described as button text — or drop one.

---

## S2 — Share card design
**Class:** Craft · **View:** [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-04`

The card is generated server-side at 1080x1920 for Stories, drawing avatar, name
and crown count.

```
src/app/(public)/p/[voterId]/story-card/route.tsx
  ImageResponse, ShareCard, loadCardFont, loadCrown.  Gated on social_profile.
```

**Fix.** Design work on `ShareCard` alone; the pipeline needs no change. Compare
against the legacy achievement card, which carried tier, competition, city,
season, organization logo and a vote URL — a denser, more branded composition.

---

## S3 — Profile icon size and alignment
**Class:** Craft · **Views:** [V1](views/V1-me-dashboard.md), [V2](views/V2-me-social-profile.md) · **Closes with:** `AC-V2-03`

The avatar reads small, and the text beneath it should be left-aligned rather
than centred.

```
src/app/(public)/(member)/me/_components/header.tsx -- 44x44 avatar.
Hero sizing lives in src/components/profile/hero.tsx.
```

---

## S4 — Social icon set
**Class:** Craft · **View:** [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-05`

The brand marks are hand-inlined SVGs, added because the project's lucide build
dropped its brand icons.

```
src/experiences/voter/profile/profile-view.tsx:41-79
  local TikTokIcon, InstagramIcon, LinkedInIcon, XIcon.
```

**Fix.** Replacing four local components in one file. Keep them inline SVG using
`currentColor` — an external icon font would break REQ-05 and add a network
dependency.

---

## S5 — Mobile share affordance is unclear
**Class:** Craft · **View:** [V8](views/V8-public-profile.md) · **Closes with:** `AC-V8-06`

On mobile the share control reads as an unlabelled icon. The sheet behind it is
good — native share, copy link, download card — but nothing signals that before
the tap.

```
src/components/share/share-sheet.tsx:184-189
```

**Fix.** Give it a text label at mobile widths. The sheet is the strongest
growth surface on the profile and is currently hidden behind a glyph.

---

## S6 — Vote modal on the contestant profile
**Class:** Verify · **View:** [V9](views/V9-contestant-public.md) · **Closes with:** `AC-V9-01`

The vote panel exists and is wired to the public member profile. Confirm it also
renders on the contestant profile, which is a different route.

```
src/components/vote/profile-vote-panel.tsx  <-  loadLiveEntries
  rendered by src/app/(public)/p/[voterId]/page.tsx
Contestant profile is /o/[orgSlug]/c/[competitionSlug]/[contestantSlug]
  -- a separate page.
```

**Fix.** Live check with the flag on before filing; the component may simply
need mounting on the contestant route.

---

## Correction — already built in v3

An earlier pass of this review listed these as missing. That reading treated the
flag-off dashboard as the whole new profile. Recorded so nobody files them twice.

| Capability | Where it lives |
| --- | --- |
| Achievement / share card | Share sheet, downloadable 1080x1920 story card |
| Share profile | Native share, copy link, download — one sheet |
| Fans | Fan list and count in the hero; toggle on the public profile |
| Gallery and intro video | Present; editor is **ahead** of legacy (6 photos, drag-drop, YouTube embed) |
| Competition entries | Timeline: entered, advanced, crowned, out, competing, voted, pick won, watching, reward |
| Bonus votes | Earned bonuses appear as timeline events (only the forward-looking checklist is missing — G3) |
| Inline voting | Vote panel on the public profile, where a visitor votes for you |

v3 is outright ahead of legacy on: display name, cover image, pinned link with
its own label, X handle, and YouTube embed — none of which the legacy editor can
set.
