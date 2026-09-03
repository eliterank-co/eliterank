# EliteRank — legacy app ("Most Eligible")

> **This is the LEGACY app, and it is LIVE IN PRODUCTION.** It serves real
> users, real money, and active competitions, and it is still shipping.
>
> - **This repo:** origin `eliterank-co/eliterank` — Vite + React SPA.
> - **Not to be confused with:** the v2 rebuild in
>   `~/development/eliterank-workplace/` (`eliterank-co/eliterank-infra`,
>   Next.js 16 App Router).
> - **The GitHub org no longer tells them apart.** This repo was transferred
>   out of the personal `mosteligibleapp` account on 2026-08-13, so legacy and
>   v2 now both live under `eliterank-co` — alongside `eliterank-shared`,
>   `-registry`, `-admin`, `-marketing`, `-app` and `-infra`. Seven repos share
>   the `eliterank` prefix; the org is worthless as a discriminator and
>   `git remote -v` alone will not save you.
>
>   **Identify by the Supabase project ref instead — that is unambiguous:**
>
>   | | ref | |
>   | --- | --- | --- |
>   | **legacy (here)** | `jioblcflgpqcfdmzjnto` | `eliterank-co/eliterank` |
>   | v2 | `dhiipdxsspmvaifvfffb` | `eliterank-co/eliterank-infra` |
>
>   Note the old `mosteligibleapp/eliterank` URL still redirects, so a stale
>   remote keeps working and will not warn you that it is stale.
> - Changes here reach production users. Do not treat this as a scratch or
>   reference checkout, and do not port v2 patterns in wholesale — the two
>   stacks are deliberately different.
>
> Local-only branch `codex/legacy-prod-cutover-hardening` holds an unpushed
> security containment commit that is still gated on the owner. Do not push it
> without asking — this is a public repository.

## Project isolation (enforced by a hook)

This repo and the v2 workplace must not touch each other. The directory names
differ by one suffix — `eliterank` is a strict prefix of `eliterank-workplace`
— so a careless path lands in the wrong project. It has already happened: v2
rebuild docs were found sitting untracked in this checkout, and 11 v2 worktrees
were created in the shared parent directory.

`.claude/hooks/guard-cross-project.sh` (a `PreToolUse` hook on
`Bash|Write|Edit|NotebookEdit`) enforces the boundary:

- **ASK** — writing any file under `~/development/eliterank-workplace/`.
- **ASK** — a Bash command that mutates anything there (`rm`, `mv`, redirects,
  `git commit|push|checkout|…`, `npm`, `supabase`, `vercel`), including the
  `git -C <path> <verb>` form.
- **ASK** — any command referencing the v2 Supabase project
  `dhiipdxsspmvaifvfffb`. This project is `jioblcflgpqcfdmzjnto`. The two
  databases are **not** interchangeable.
- **Allowed** — reading across the boundary (`cat`, `grep`, `git log`).
  Comparing legacy behaviour against v2 is legitimate and stays friction-free.

"ASK" means the owner decides. An agent may not cross on its own judgment. Do
not work around the hook; if it fires, stop and confirm what you actually
intend.

**Never** port v2 patterns into this app on sight. This is a Vite + React SPA
with inline theme-object styling; v2 is Next.js 16 with Server Actions, Cache
Components and Tailwind. They are deliberately different stacks.

## Database binding — this repo owns exactly one Supabase project

| Project | Ref | |
| --- | --- | --- |
| **EliteRank** | `jioblcflgpqcfdmzjnto` | **this repo — legacy, LIVE PRODUCTION** |
| eliterank-v2 | `dhiipdxsspmvaifvfffb` | the v2 rebuild. Not ours. |

Both live in the Vercel-managed org `vercel_icfg_lyg3FulioaO6x0mK5H4MDBD9`, so
the org does **not** discriminate between them. Only the ref does.

### The CLI is deliberately unlinked — that is the safety property

`supabase/config.toml` exists for one reason: to anchor the CLI's project root
to this repo. Without it, the CLI walked *up* the tree looking for a
`supabase/config.toml`, reached `$HOME`, found `~/supabase/config.toml`, and
adopted that project's link state — an unrelated project in a different org. A
`supabase db push` from this repo would have pushed this app's migrations into
somebody else's production database.

`project_id` in that file is only a local identifier; it does **not** pin the
remote. The remote target lives in `supabase/.temp/project-ref`, which is
gitignored and intentionally absent. So `--linked` commands fail closed:

```
$ supabase migration list --linked
Cannot find project ref. Have you run supabase link?
```

Keep it that way. **Do not run `supabase link` to clear that error.**

### How database changes actually reach production

- **Edge functions** — automatically, via
  `.github/workflows/deploy-edge-functions.yml` on push to `main`. It passes an
  explicit `--project-ref "$SUPABASE_PROJECT_REF"` (repo secret), so CI is
  correctly targeted and was never exposed to the ambient-link problem.
- **Migrations** — never automatically. That workflow deliberately excludes
  them because they need human review. Apply them with an explicitly named
  target, not from ambient link state.
- **Inspection / reads** — the Supabase MCP server in `.mcp.json` is pinned to
  `project_ref=jioblcflgpqcfdmzjnto` with `read_only=true`. Prefer it; it
  cannot write and cannot reach v2.

The guard hook asks before any `supabase` subcommand that mutates a remote
without naming this repo's ref: `db push`, `db reset`, `db remote commit`,
`migration up|repair`, `functions deploy|delete`, `secrets set|unset`, `link`.

### Unresolved: three migration directories

`supabase/` holds `migrations/` (136 files — the sequence whose newest entries
track recent commits), `migrations_archive/` (42), and `migrations_new/` (4, a
consolidated-schema/seed/scale-prep experiment). Nothing in the repo declares
which is authoritative. Do not apply anything from `migrations_new/` or
`migrations_archive/` without confirming with the owner first. Related open
issue: #611 (migration-drift audit).

## Tech Stack
- **Frontend:** React 18 + Vite (SPA, not Next.js)
- **Backend:** Supabase (auth, DB, edge functions, realtime)
- **Notifications:** OneSignal (email + push + SMS via Twilio)
- **Hosting:** Vercel
- **Twilio phone:** +18666203168

## Supabase Project (IMPORTANT)
- **ALWAYS use the `EliteRank` Supabase project** — ref/ID **`jioblcflgpqcfdmzjnto`** (region us-west-2).
- **NEVER use the `eliterank-v2` project** (ref `dhiipdxsspmvaifvfffb`) or any other project on the account (`job-tracker`, `referralnetwork`).
- Every Supabase operation — migrations, SQL, edge functions, logs, advisors — must target project ref `jioblcflgpqcfdmzjnto`.

## Styling
- **Use inline styles with the JS theme object** from `src/styles/theme.js`
- Import `colors`, `spacing`, `typography`, `borderRadius`, `transitions` etc. from the theme
- Do NOT use Tailwind utility classes for page components — Tailwind is only configured for the design system showcase
- Define a `styles` object at the top of the file and reference it in JSX via `style={styles.xxx}`
- Follow existing patterns in `src/pages/NotificationsPage.jsx` or `src/pages/PrivacyPage.jsx`

## Brand & Design Rules
- **Vibe:** Dark + Gold luxury. Premium, exclusive feel. Gold accents on deep dark backgrounds. Minimal color variety.
- **Colors:** Use ONLY colors from `src/styles/theme.js`. No hardcoded hex values in CSS or inline styles — reference theme tokens or CSS variables. Rare exceptions allowed only when noted in a comment.
- **Primary accent:** Gold (`colors.gold.primary` / `--color-primary`). This is the ONLY accent color for CTAs, highlights, labels, and interactive elements.
- **Status colors only for status:** Green/red/yellow/blue from `colors.status` are ONLY for success/error/warning/info states. Never use them decoratively.
- **Accent colors (purple, pink, cyan):** Exist in the theme but should NOT be used for new UI. They are reserved for tier badges and data visualization only.
- **New sections/cards:** Use the standard neutral card style (`--color-bg-secondary` background, `--color-border` border). Do NOT invent new gradient/color combos for each feature.
- **Fonts:** System fonts only (`-apple-system` / SF Pro stack + monospace). Never add Google Fonts or custom display fonts.
- **Typography:** Use existing `typography.fontSize` scale. Do not introduce new sizes or override with raw px/rem values.
- **Spacing:** Use existing `spacing` tokens. Do not hardcode pixel values for padding/margins.
- **When in doubt:** Match the nearest existing component. Look at Timeline, HostCard, or stat-card patterns before designing anything new.

## Project Structure
- `src/pages/` — Page components (lazy-loaded)
- `src/features/` — Feature modules (auth, entry, profile, settings, etc.)
- `src/components/` — Shared components (ui, layout, modals, common)
- `src/styles/theme.js` — Design tokens (colors, spacing, typography, etc.)
- `src/routes/index.jsx` — React Router v6 route definitions
- `src/stores/` — Zustand state management
- `src/contexts/` — React contexts (notifications, etc.)
- `supabase/functions/` — Supabase Edge Functions (Deno/TypeScript)
- `supabase/migrations/` — Database migrations

## Edge Functions
- `send-onesignal-email` — Branded transactional emails via OneSignal
- `send-push-notification` — Push notifications via OneSignal
- `send-nomination-invite` — Orchestrates nomination flow (email + push + in-app)
- `notify-nominator` — Notifies nominator when nominee accepts/declines
- `check-competition-events` — Scheduled: detects competition phase changes
- `create-payment-intent` — Stripe payment intents
- `stripe-webhook` — Stripe webhook handler
- `set-nominee-password` — Password setup during claim flow
- `generate-ai-post` — AI content generation

## Planning Language — No Timelines

**Strict rule:** internal planning docs, prompts, roadmaps, and setup
guides use **named phases and milestones only**. Never use hours, days,
weeks, months, "today/tomorrow," week-numbered roadmaps, or duration
estimates. Phases progress when gating conditions are met, not on a
clock.

- ❌ "Day 0 / Day 1 / wk5–wk6 / takes ~4 hours / 3–7 business days"
- ✅ "Pre-flight / Scaffolding / Phase 2: Schema / Stripe Connect approval gates Phase 4 — submit during Pre-flight"

Marketing copy that ships to users (e.g. "paid every Friday") is
business logic, not project planning, and may include time references
when the owner explicitly wants them in brand voice. Confirm before
keeping any user-facing time reference; default to removing.

## Key Conventions
- Edge functions use `serve()` from Deno std, with CORS headers and JSON responses
- Fire-and-forget pattern for non-critical notifications (push, SMS) using `.catch()`
- Supabase service role key for edge function DB access
- Lazy-load all pages with `React.lazy()` + `SuspenseWrapper`
- Use `useNavigate()` for navigation, not `<Link>` for programmatic nav
