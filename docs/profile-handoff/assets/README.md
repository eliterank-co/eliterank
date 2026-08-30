# Image assets

Two kinds of asset live here, and they serve different purposes.

## `diagrams/` — structural wireframes (present)

One SVG per view, generated from the component tree by
[`make-diagrams.py`](make-diagrams.py). Each block is a real region of the
rendered page; the tags on the right pin findings to the region they occur on,
so a diagram doubles as a map from finding ID to screen location.

```bash
python3 make-diagrams.py     # regenerate all nine
```

These are **not visual mocks**. They describe structure and ownership, not
spacing, colour or type. Regenerate them when a view's structure changes so the
finding pins stay accurate.

| Asset | View |
| --- | --- |
| [`V1-me-dashboard.svg`](diagrams/V1-me-dashboard.svg) | [V1](../views/V1-me-dashboard.md) |
| [`V2-me-social-profile.svg`](diagrams/V2-me-social-profile.svg) | [V2](../views/V2-me-social-profile.md) |
| [`V3-profile-editor.svg`](diagrams/V3-profile-editor.svg) | [V3](../views/V3-profile-editor.md) |
| [`V4-contestant.svg`](diagrams/V4-contestant.svg) | [V4](../views/V4-contestant.md) |
| [`V5-vote-records.svg`](diagrams/V5-vote-records.svg) | [V5](../views/V5-vote-records.md) |
| [`V6-watching.svg`](diagrams/V6-watching.svg) | [V6](../views/V6-watching.md) |
| [`V7-settings.svg`](diagrams/V7-settings.svg) | [V7](../views/V7-settings.md) |
| [`V8-public-profile.svg`](diagrams/V8-public-profile.svg) | [V8](../views/V8-public-profile.md) |
| [`V9-contestant-public.svg`](diagrams/V9-contestant-public.svg) | [V9](../views/V9-contestant-public.md) |

## `screenshots/` — capture target (empty)

**No screenshots are included, and this is a limitation of how the audit ran,
not an oversight.** Every member view requires authentication; this review was
produced from source without credentials, so nothing could be captured. The one
exception is the profile editor, which the owner supplied during review — those
images are in the review thread, not in this folder.

Capture them once and the links below resolve. Until then, the view documents
name each expected file and say it is missing.

### Naming

`IMG-<view>-<letter>[-<state>].png` — for example `IMG-V3-a.png`,
`IMG-V8-b-mobile.png`. The letter is the order the shot appears in its view
document.

### What to capture

| Asset | View | Shot | Flag |
| --- | --- | --- | --- |
| `IMG-V1-a` | V1 | Full page, signed in, non-host member | **off** |
| `IMG-V1-b` | V1 | Stat tile row, close crop — evidence for D1/D2/D3 | **off** |
| `IMG-V2-a` | V2 | Full page, member with fans and timeline events | **on** |
| `IMG-V2-b` | V2 | Sidebar, showing the empty Interests panel — G1 | **on** |
| `IMG-V3-a` | V3 | Editor, full page (owner-supplied set covers this) | either |
| `IMG-V3-b` | V3 | Connect section, close crop — P1 and S1 | either |
| `IMG-V3-c` | V3 | Saved intro video showing the black frame — P2 | either |
| `IMG-V4-a` | V4 | Contestant tab, single-competition contestant | **off** |
| `IMG-V4-b` | V4 | Contestant tab, eliminated contestant — G4 | **off** |
| `IMG-V5-a` | V5 | `/me/votes` | **off** |
| `IMG-V5-b` | V5 | `/me/transactions` | **off** |
| `IMG-V5-c` | V5 | `/me/history` for a member who has hosted — P3 | **off** |
| `IMG-V6-a` | V6 | `/me/watching` with rows | **off** |
| `IMG-V7-a` | V7 | `/me/settings` full page — G5 | **off** |
| `IMG-V8-a` | V8 | `/p/[voterId]` desktop, arrived via "View as visitor" — P4 | **on** |
| `IMG-V8-b` | V8 | Same page at 390px wide — S5 | **on** |
| `IMG-V8-c` | V8 | Downloaded story card — S2 | **on** |
| `IMG-V9-a` | V9 | Contestant public page during an open round — S6 | either |

### How to capture

Set the flag path explicitly first (see [requirements](../requirements.md) §1),
then confirm which path you are on before shooting. A screenshot that does not
record its flag state is not usable as evidence.

```js
// in the browser console, before loading the page
document.cookie = 'ui_override=social_profile=on; path=/'   // or =off
```

Full-page capture, 1440px wide for desktop and 390px for mobile. Redact any
email address or other personal data belonging to a real member before
committing — this repository is public.
