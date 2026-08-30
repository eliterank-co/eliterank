# V10 — Light theme (workstream)

| | |
| --- | --- |
| **Scope** | Every surface in V1–V9, plus the app shell they render in |
| **Repos** | `eliterank-registry` (brand contract + registry components) → `eliterank-app` (semantic layer + surfaces) → `eliterank-infra` (mirror copy + design-doc updates) |
| **Design sources** | `design/brand-contract.json` (v1 — identical in registry, app, infra; verified byte-for-byte at this audit) · `eliterank-infra/docs/rebuild/INVARIANTS.md` · `…/DESIGN-PROMPT.md` |
| **Tests** | [`V10-light-theme.spec.ts`](../tests/e2e/V10-light-theme.spec.ts), [`light-theme-tokens.test.ts`](../tests/unit/light-theme-tokens.test.ts) |

## Where theming stands today (verified at `c2f45dd`)

**There is no light palette anywhere in the four repos.** The requirement is
to **author** one, not to adopt one:

- `eliterank-app/src/app/globals.css:238` — `html { color-scheme: dark; }`.
  No `prefers-color-scheme` branch, no `data-theme` attribute, anywhere in
  `src/` (`.css`, `.ts`, `.tsx` all grepped).
- `design/brand-contract.json` v1 defines a single (dark) palette of 16
  `--brand-*` primitives + status derivations. All three copies (registry,
  app, infra) are identical.
- `eliterank-registry/src/app/globals.css:43` — the registry's own showcase
  is `color-scheme: dark` too; registry components consume dark-mapped
  aliases (`--color-bg`, `--color-fg`, …).
- `eliterank-infra/docs/rebuild/DESIGN-PROMPT.md:177` ("we are dark-only;
  document this — no light mode in v1") and `CLAUDE-DESIGN-PROMPT.md:222`
  ("don't ship a half-finished light theme") deferred light mode
  deliberately. This workstream is the owner overriding that deferral —
  update those docs as part of the work.
- The only "light" prior art is the embed widget's host-supplied override of
  four variables (`src/lib/embed/theme.ts`, keys `bg/surface/text/accent`) —
  a per-host color injection, not a product theme. It is out of scope here
  but must keep working.

## Token architecture (what exists, what the light theme plugs into)

The app's `globals.css` is already layered for this:

1. **Brand primitives** — `--brand-ink`, `--brand-surface`,
   `--brand-surface-raised`, `--brand-line`, `--brand-line-soft`,
   `--brand-gold`, `--brand-gold-muted`, `--brand-text`,
   `--brand-text-muted`, `--brand-text-faint`, `--brand-on-gold`, and the
   Mineral Jewel status five (`--brand-success/info/error/warning/neutral`)
   (globals.css:11-45).
2. **Derived status surfaces** — `--status-*-surface/border/foreground` are
   `color-mix()` expressions over the primitives (globals.css:29-43), so they
   recompute automatically when the primitives change. Verify, don't assume:
   12%-tints tuned on ink may need ratio changes on paper.
3. **Semantic aliases** — `--color-bg-app`, `--color-surface-1..3`,
   `--color-text-cream/subtle/faint`, `--gold-primary`/`--gold-text`,
   `--color-gold-line(-strong)`, shadcn tokens, `--color-status-*(-soft/bg)`
   (globals.css:109-194). Components consume only this layer (and Tailwind
   arbitrary values over it).
4. **The legacy-port bridge block** (globals.css:85-107) — 16 `--legacy-*`
   vars. Eleven are `color-mix()`/`var()` expressions over the primitives and
   inherit a re-valued palette for free (visual check still required). Five
   do not: three are hardcoded `oklch()` tier literals
   (`--legacy-tier-platinum/silver/bronze`, globals.css:87-89 — they need
   their own light values or a written theme-invariant classification), and
   two are motion curves (theme-neutral).

So the light theme is, structurally: **a second set of values for layer 1**
(published as brand-contract v2), plus a re-audit of layers 2–4, plus the
resolution mechanism, plus eliminating hardcoded colors in components.

## Hardcoded-color debt on the profile surfaces

29 instances at `c2f45dd` across `src/components/profile`,
`src/components/share`, `profile-vote-module.tsx`, the `/me` pages, and
`/p/[voterId]` — e.g. `bg-black/40…/90` scrims throughout
`featured-gallery.tsx` (lines 65-167) and the modals
(`competition-detail-sheet.tsx:33`, `share-card-modal.tsx:89`), the literal
teal-navy gradient at `me/page.tsx:123`, `rgba(212,175,55,…)` gold tints at
`me/page.tsx:582` and `header.tsx:69`, `rgba(245,241,232,…)` text at
`me/page.tsx:263`. Each is either tokenized or explicitly classified
**theme-invariant** (a lightbox scrim may legitimately stay black — the
classification must be written, per REQ-06).

## Viewer resolution (requirement)

Three states: explicit light, explicit dark, and system default.

- An explicit choice is stamped on the root element (e.g.
  `data-theme="light"|"dark"` — an example, not a mandate; the marker is
  app-team-owned); with no choice, `prefers-color-scheme` decides.
- `color-scheme` must track the resolved theme (form controls, scrollbars,
  UA rendering) — the current unconditional `color-scheme: dark` goes. The
  resolved `color-scheme` on the root is the observable the e2e tests assert.
- Where the choice lives (cookie, account preference, both) and where the
  toggle sits in the UI is **app-team-owned** (requirements §1 spirit);
  the requirement is only that the three states exist, that an explicit
  choice wins over system, and that first paint does not flash the wrong
  theme.

## Acceptance criteria

| ID | Criterion | Verified by |
| --- | --- | --- |
| `AC-V10-01` | The light palette is published as a brand-contract revision in `eliterank-registry/design/brand-contract.json`, and the app and infra copies are byte-identical to it (mirror step in the same change). | `T-AC-V10-01` (unit: parity check runs now; the v2-declaration check is post-fix, skipped until the palette lands) |
| `AC-V10-02` | Theme resolution: explicit choice beats system preference in both directions; with no choice, `prefers-color-scheme` decides; the root's `color-scheme` matches the resolved theme; no wrong-theme flash on first paint. | `T-AC-V10-02a/b/c` (e2e: `emulateMedia` × explicit choice matrix) |
| `AC-V10-03` | Complete coverage: every token consumed by any component has a defined value in both themes — no color defined only in one. The token census is scripted, not eyeballed. | `T-AC-V10-03` (unit: scripted census of `var(--…)` consumption vs. both definition sets — post-fix, skipped until the light block lands) |
| `AC-V10-04` | Contrast holds in both themes: ≥4.5:1 body, ≥3:1 large text (`eliterank-infra/docs/rebuild/DESIGN-PROMPT.md:171`, `CLAUDE-DESIGN-PROMPT.md:216`; INVARIANTS item 30 carries the gold-split rule), including the gold split — light needs its own two-token gold answer (`#e9d5a1` on white fails at ≈1.4:1; the split may inverse: darker gold for body, richer gold for display). Measured, with the pairs listed. | Manual sign-off over a contrast measurement script — the script is authored with the palette work and is not shipped in this packet |
| `AC-V10-05` | The hardcoded-color census on profile surfaces goes from 29 to 0-or-classified: every instance is a token reference or carries a `/* theme-invariant: reason */` marker; a lint/unit check keeps it there. | `T-AC-V10-05` (unit grep census — post-fix, skipped until the cleanup lands) |
| `AC-V10-06` | Status colors remain status-only and legible in light: the `-soft` on-dark text tints get on-light counterparts; no status hue is used decoratively in either theme. | Manual (visual pass, `IMG-V10-b`) |
| `AC-V10-07` | Every view V1–V9 passes a numbered light-theme walkthrough: readable, gold-accented, no dark-baked artifacts (black scrims where they shouldn't be, invisible borders, white-on-white). Steps in the [manual checklist](../tests/manual/verification-checklist.md). | Manual |
| `AC-V10-08` | The toggle's placement and persistence are decided and recorded by the app team (settings page is the natural home — note V7/R19 and R3: settings discoverability matters here). | Manual + `T-AC-V10-02b` |

## Sequencing (gating conditions, no timelines)

1. **Palette authoring** — light values for the 16 primitives + gold-split
   answer; brand-contract v2 in the registry. Gates everything.
2. **Mirror + semantic re-audit** — copy to app/infra; verify `color-mix`
   derivations on the light ground; extend the registry showcase to render
   both themes.
3. **Resolution mechanism** — app-owned; lands with AC-V10-02's e2e.
4. **Component debt** — AC-V10-05's census to zero; runs in parallel with 2.
5. **Verification** — contrast script, walkthrough, screenshots.
