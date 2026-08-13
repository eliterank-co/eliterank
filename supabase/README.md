# Supabase Setup for EliteRank

> ## ⚠️ Database binding — read first
>
> This repo owns **exactly one** Supabase project:
>
> | Project | Ref | |
> | --- | --- | --- |
> | **EliteRank** | `jioblcflgpqcfdmzjnto` | **this repo — LIVE PRODUCTION** |
> | eliterank-v2 | `dhiipdxsspmvaifvfffb` | the v2 rebuild. Not ours. |
>
> Both are in the same Vercel-managed org, so the org does not tell them apart.
> Only the ref does.
>
> **The CLI here is intentionally unlinked.** `config.toml` anchors the CLI's
> project root to this repo (without it, the CLI climbed to `$HOME` and adopted
> an unrelated project's link state). Its `project_id` is a *local* identifier
> and does not pin the remote — so `--linked` commands fail closed with
> "Cannot find project ref". That is correct. Do not run `supabase link` to
> clear it.
>
> **Migrations are not deployed by CI** and require human review with an
> explicitly named target. Edge functions deploy automatically via
> `.github/workflows/deploy-edge-functions.yml`, which passes `--project-ref`.
>
> **Three migration directories exist** — `migrations/` (136, the sequence that
> tracks recent commits), `migrations_archive/` (42), `migrations_new/` (4, a
> consolidated-schema experiment). Which is authoritative is **not settled**;
> confirm with the owner before applying anything from the latter two. See
> issue #611.
>
> The "Quick Start" below describes standing up a *fresh* project from scratch.
> It is not the procedure for this production database.

## Quick Start

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the database to be ready

### 2. Run Migrations

In the Supabase Dashboard, go to **SQL Editor** and run each migration file in order:

1. `001_initial_schema.sql` - Creates all tables, indexes, and triggers
2. `002_rls_policies.sql` - Sets up Row Level Security policies
3. `003_seed_data.sql` - Adds initial organization data
4. `004_super_admin.sql` - Sets up super admin functions and policies

### 3. Configure Environment Variables

Get your credentials from **Settings > API** in the Supabase Dashboard:

- **Project URL**: `https://your-project-id.supabase.co`
- **Anon/Public Key**: `eyJ...` (the public anon key)

#### For Local Development

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

#### For Vercel Deployment

Add these environment variables in Vercel:

1. Go to your project in Vercel
2. Navigate to **Settings > Environment Variables**
3. Add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key

### 4. Enable Authentication

In Supabase Dashboard:

1. Go to **Authentication > Providers**
2. Enable Email provider (enabled by default)
3. Optionally enable OAuth providers (Google, etc.)

### 5. Set Up a Super Admin

After a user signs up, make them a super admin:

```sql
SELECT set_super_admin('user@email.com');
```

### 6. Deploy Edge Functions (for AI Posts)

The AI-powered news post generation uses Supabase Edge Functions.

#### Prerequisites
- Install Supabase CLI: `npm install -g supabase`
- Login: `supabase login`

#### Set Up Secrets

Name the project explicitly. Do **not** `supabase link` — this repo stays
unlinked on purpose so that an un-targeted command fails instead of guessing
(see the binding note at the top of this file).

```bash
# Set your Anthropic API key
supabase secrets set ANTHROPIC_API_KEY=your-anthropic-api-key \
  --project-ref jioblcflgpqcfdmzjnto
```

#### Deploy Functions

Normally you don't do this by hand: every push to `main` that touches
`supabase/functions/**` deploys all functions via
`.github/workflows/deploy-edge-functions.yml`. That workflow also knows which
functions need `--no-verify-jwt`. Deploy manually only to hotfix ahead of CI,
and pass the ref explicitly:

```bash
# Deploy the AI post generation function
supabase functions deploy generate-ai-post \
  --project-ref jioblcflgpqcfdmzjnto

# Deploy the scheduled event checker
supabase functions deploy check-competition-events \
  --project-ref jioblcflgpqcfdmzjnto
```

#### Set Up 24-Hour Cron Job
Run this SQL to schedule the event checker to run daily:

```sql
-- Enable pg_cron extension (run once)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the check-competition-events function to run daily at midnight UTC
SELECT cron.schedule(
  'check-competition-events-daily',
  '0 0 * * *',  -- Every day at midnight UTC
  $$
  SELECT net.http_post(
    url := 'https://your-project-id.supabase.co/functions/v1/check-competition-events',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('supabase.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Alternatively, use the Supabase Dashboard:
1. Go to **Database > Extensions** and enable `pg_cron`
2. Go to **SQL Editor** and run the schedule command above

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `profiles` | User profiles (auto-created on signup) |
| `organizations` | Competition franchises (Most Eligible, etc.) |
| `competitions` | City competitions |
| `contestants` | Approved contestants in competitions |
| `nominees` | Pending/awaiting nominations |
| `votes` | Vote records |
| `judges` | Competition judges |
| `sponsors` | Competition sponsors |
| `events` | Competition events/schedule |
| `announcements` | Competition announcements |

### User Roles

Roles are determined by context, not stored explicitly:

- **Host**: User who created a competition
- **Contestant**: User approved to compete
- **Nominee**: User who has been nominated
- **Fan**: User who has voted
- **Super Admin**: User with `is_super_admin = true`

### Helper Views

- `user_roles` - Shows all roles for each user
- `admin_dashboard_stats` - Aggregate stats for super admin dashboard

## Troubleshooting

### "Supabase not configured" warning

Make sure:
1. `.env` file exists in project root
2. Variables have `VITE_` prefix
3. Restart the dev server after changing `.env`

### RLS blocking queries

Check that:
1. User is authenticated
2. Correct policies exist for the operation
3. Super admin flag is set if needed

### Connection errors

Verify:
1. Project URL is correct
2. Anon key is valid
3. Network allows connections to Supabase
