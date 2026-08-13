# EliteRank Legacy — Agent Operating Rules

This is the **legacy** EliteRank app, also known as "Most Eligible" (origin
`eliterank-co/eliterank`). **It is live in production**: real users, real
money, active competitions. It is still actively shipping.

It is **not** the v2 rebuild (`eliterank-co/eliterank-infra`). **Do not use the
GitHub org to tell them apart** — this repo was transferred out of the personal
`mosteligibleapp` account on 2026-08-13, so both projects now sit under
`eliterank-co` along with five more repos sharing the `eliterank` prefix.

Identify by the Supabase project ref, which is unambiguous: legacy is
`jioblcflgpqcfdmzjnto`, v2 is `dhiipdxsspmvaifvfffb`. The old
`mosteligibleapp/eliterank` URL still redirects, so a stale remote keeps
working without warning you it is stale.

## Project isolation (highest priority)

This repo and `~/development/eliterank-workplace/` (the v2 rebuild) must never
modify each other. `eliterank` is a strict prefix of `eliterank-workplace`, so
a mistyped or globbed path silently lands in the wrong project.

`.claude/hooks/guard-cross-project.sh` enforces this as a `PreToolUse` hook:

- Writing a file under the v2 workplace → **ask**.
- A Bash command that mutates anything under the v2 workplace → **ask**. This
  includes `git -C <path> push`, shell redirects, `rm`/`mv`, `npm`, `supabase`
  and `vercel`.
- Referencing the v2 Supabase project `dhiipdxsspmvaifvfffb` → **ask**. This
  project is `jioblcflgpqcfdmzjnto`; the two databases are not interchangeable.
- A `supabase` subcommand that mutates a remote without naming this repo's ref
  → **ask**. Covers `db push`, `db reset`, `db remote commit`,
  `migration up|repair`, `functions deploy|delete`, `secrets set|unset`, `link`.
- Reading across the boundary is allowed and stays unprompted.

Only the owner can approve a crossing. Do not route around the hook, and do not
treat one approval as standing permission for the next crossing.

## Database binding

This repo owns exactly one Supabase project: **`jioblcflgpqcfdmzjnto`**
("EliteRank", live production). The v2 project is `dhiipdxsspmvaifvfffb`. Both
sit in the same Vercel-managed org, so the org does not tell them apart — only
the ref does.

**The CLI is intentionally unlinked and must stay that way.** `supabase/config.toml`
exists only to anchor the CLI's project root here; its `project_id` is a local
identifier and does not pin the remote. Without that file the CLI climbed to
`$HOME` and adopted the link state of an unrelated project in a different org,
so `supabase db push` targeted the wrong production database.
Because no link exists here, `--linked` commands now fail closed with "Cannot
find project ref". Do not run `supabase link` to make that error go away.

Edge functions deploy through `.github/workflows/deploy-edge-functions.yml`
with an explicit `--project-ref`. Migrations are deliberately excluded from CI
and require human review with an explicitly named target. For reads, prefer the
MCP server in `.mcp.json` — it is pinned to this project and `read_only=true`.

## Working rules

- This app serves production traffic. Inspect current code and `git status`
  before changing anything, and make the smallest change that fixes the issue.
- Work on a branch and open a PR. Everything on `main` here arrives via PR.
  Never commit directly to `main`.
- `main` moves fast — several merges a day. `git fetch` at the start of every
  session and before opening a PR; a branch cut in the morning is stale by
  afternoon.
- Do not push, deploy, or change repository settings unless explicitly asked.
- Match the existing stack. This is Vite + React 18 (SPA), an inline `styles`
  object sourced from `src/styles/theme.js`, and Supabase edge functions. Do
  **not** introduce Next.js, Server Actions, Tailwind utility classes on page
  components, or any other v2 pattern.
- Only `VITE_`-prefixed environment variables are safe for client code. Note
  that `vite.config.js` sets `envPrefix: ['VITE_', 'SUPABASE_']`, so anything
  named `SUPABASE_*` is also exposed to the browser bundle — never put a
  service-role key behind that prefix.
- Secrets belong in Supabase edge-function secrets or Vercel env, never in the
  repo. This repository is currently public.
