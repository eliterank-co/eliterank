import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * send-fan-weekly-digest — Weekly performance digest for contestants and their fans.
 *
 * For every active contestant in a competition that is due, build a stats
 * snapshot and email it to:
 *   - the contestant themselves (the "performance update" they opted into when
 *     they entered the competition)
 *   - each of their fans whose contestant_fans.email_weekly_updates is true
 *
 * SCHEDULING — each competition sends at 10 AM in ITS OWN timezone.
 *
 * This used to be one platform-wide send on a Friday-10AM-Chicago cron, which
 * meant a Vancouver competition emailed its fans at 8 AM and a Toronto one at
 * 11 AM. Now the workflow invokes this function HOURLY and the function decides
 * who is due, from each competition's own local clock:
 *
 *   timezone  = competitions.timezone when the host set one, otherwise derived
 *               from the competition's city/state, otherwise America/Chicago
 *   due       = local Friday, local hour >= 10
 *
 * Exactly-once delivery is therefore the ledger's job, not the cron's:
 * fan_digest_sends holds one row per (competition, local send week), and a
 * competition whose row is completed is skipped. That also buys delay
 * tolerance — the window stays open through local Saturday, so a late runner
 * still sends instead of silently missing the week (which is what the old
 * wall-clock cron gate did on 2026-08-28).
 *
 * If the ledger table has not been migrated yet the function stays SAFE rather
 * than clever: it falls back to an exact `local hour == 10` match, which the
 * hourly cron still turns into exactly one send per competition per week — it
 * just loses the catch-up window. See the migration note below.
 *
 * DELIVERY — every recipient costs one invocation of send-onesignal-email, and
 * Supabase rate-limits per function: an unpaced run sends the first ~60 emails
 * and then fails the rest with "RateLimitError: Rate limit exceeded for
 * function" (thrown, not a 429 response). Fans queue behind their contestant,
 * so they absorbed nearly all of that loss. Sends are paced, rate-limited ones
 * are retried honouring the server's retry-after hint, and a run that reaches
 * its time budget records its cursor and reports `resume: true`.
 *
 * Trigger options:
 *   - Hourly via .github/workflows/fan-weekly-digest.yml
 *   - Manual invocation: POST with the service role key. Body options:
 *       { dry_run: true }        build the recipient list without sending
 *       { competition_id: uuid } this competition only, ignoring the schedule
 *       { force: true }          ignore the ledger (re-send a completed week)
 *
 * Required Supabase secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_URL              — e.g. https://eliterank.co (used for self-digest
 *                          unsubscribe link → /notifications settings page)
 * Optional:
 *   DIGEST_SEND_INTERVAL_MS — ms between sends (default 250)
 *   DIGEST_MAX_RUNTIME_MS   — stop and report resume after this (default 110000)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Local hour and weekday a competition's digest goes out, in its own zone. */
const SEND_HOUR = 10
const SEND_WEEKDAY = 5 // Friday (0 = Sunday)

interface Organization {
  name: string | null
  slug: string | null
  default_theme_primary: string | null
}

interface City {
  name: string | null
  state: string | null
}

interface Competition {
  id: string
  name: string | null
  slug: string | null
  status: string
  city: string | null
  timezone: string | null
  theme_primary: string | null
  winners_split_by_gender: boolean | null
  organization: Organization | null
  city_ref: City | null
}

interface VotingRound {
  competition_id: string
  round_order: number
  start_date: string | null
  end_date: string | null
}

interface UpcomingEvent {
  competition_id: string
  name: string
  date: string
}

interface Contestant {
  id: string
  name: string
  email: string | null
  user_id: string | null
  competition_id: string
  rank: number | null
  trend: 'up' | 'down' | 'same' | null
  votes: number | null
  status: string
  gender: string | null
}

interface FanRow {
  id: string
  user_id: string
  contestant_id: string
  email_weekly_updates: boolean
}

interface SendResult {
  competition_id: string
  contestant_id: string
  contestant_name: string
  recipient: 'self' | 'fan'
  to_email: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
}

/**
 * US state / Canadian province code → IANA zone, used when a host has not set
 * competitions.timezone explicitly. cities.state is a 2-char code, which is all
 * we have to go on.
 *
 * States that straddle two zones are mapped to the one holding the larger
 * population, so the value is a sensible DEFAULT and not a claim of accuracy —
 * a host in Pensacola or El Paso sets competitions.timezone and that wins. The
 * ambiguous ones: FL, TX, TN, KY, IN, MI, ND, SD, NE, KS, OR, ID.
 */
const STATE_TIMEZONES: Record<string, string> = {
  // Eastern
  CT: 'America/New_York', DC: 'America/New_York', DE: 'America/New_York',
  FL: 'America/New_York', GA: 'America/New_York', IN: 'America/New_York',
  KY: 'America/New_York', MA: 'America/New_York', MD: 'America/New_York',
  ME: 'America/New_York', MI: 'America/New_York', NC: 'America/New_York',
  NH: 'America/New_York', NJ: 'America/New_York', NY: 'America/New_York',
  OH: 'America/New_York', PA: 'America/New_York', RI: 'America/New_York',
  SC: 'America/New_York', VA: 'America/New_York', VT: 'America/New_York',
  WV: 'America/New_York',
  // Central
  AL: 'America/Chicago', AR: 'America/Chicago', IA: 'America/Chicago',
  IL: 'America/Chicago', KS: 'America/Chicago', LA: 'America/Chicago',
  MN: 'America/Chicago', MO: 'America/Chicago', MS: 'America/Chicago',
  ND: 'America/Chicago', NE: 'America/Chicago', OK: 'America/Chicago',
  SD: 'America/Chicago', TN: 'America/Chicago', TX: 'America/Chicago',
  WI: 'America/Chicago',
  // Mountain
  CO: 'America/Denver', ID: 'America/Denver', MT: 'America/Denver',
  NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
  AZ: 'America/Phoenix', // no DST
  // Pacific / other US
  CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', OR: 'America/Los_Angeles',
  WA: 'America/Los_Angeles',
  AK: 'America/Anchorage', HI: 'Pacific/Honolulu',
  PR: 'America/Puerto_Rico',
  // Canada
  ON: 'America/Toronto', QC: 'America/Toronto', NS: 'America/Halifax',
  NB: 'America/Halifax', PE: 'America/Halifax', NL: 'America/St_Johns',
  MB: 'America/Winnipeg', SK: 'America/Regina', AB: 'America/Edmonton',
  BC: 'America/Vancouver', YT: 'America/Whitehorse', NT: 'America/Yellowknife',
  NU: 'America/Iqaluit',
}

const DEFAULT_TIMEZONE = 'America/Chicago'

/** True when `zone` is a zone this runtime can actually format. */
function isUsableTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(new Date())
    return true
  } catch {
    return false
  }
}

/**
 * The zone a competition's digest clock runs on. An explicit host choice wins;
 * 'UTC' is treated as "never set" because that is the column default from
 * migration 051 and only a host who opened the double-vote-days panel has ever
 * changed it — honouring it literally would move live competitions to a 5 AM
 * Chicago send.
 */
function resolveTimezone(comp: Competition): { timezone: string; source: string } {
  const explicit = (comp.timezone || '').trim()
  if (explicit && explicit !== 'UTC' && isUsableTimezone(explicit)) {
    return { timezone: explicit, source: 'competition.timezone' }
  }
  const state = (comp.city_ref?.state || '').trim().toUpperCase()
  const fromState = STATE_TIMEZONES[state]
  if (fromState) return { timezone: fromState, source: `city.state:${state}` }
  return { timezone: DEFAULT_TIMEZONE, source: 'default' }
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/** Calendar weekday / hour / date as observed in `timeZone`. */
function localParts(now: Date, timeZone: string): { weekday: number; hour: number; date: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const get = (type: string) => parts.find(p => p.type === type)?.value || ''
  return {
    weekday: WEEKDAY_INDEX[get('weekday')] ?? 0,
    // hour12:false yields '24' for midnight in some ICU versions.
    hour: Number(get('hour')) % 24,
    date: `${get('year')}-${get('month')}-${get('day')}`,
  }
}

/**
 * The local Friday a given local date belongs to — the ledger key. Saturday
 * belongs to the Friday before it, which is what makes the catch-up window
 * land on the same row instead of opening a second one.
 */
function weekAnchor(localDate: string, weekday: number): string {
  const daysBack = (weekday - SEND_WEEKDAY + 7) % 7
  const d = new Date(`${localDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - daysBack)
  return d.toISOString().slice(0, 10)
}

/**
 * Is this competition due?
 *
 * With the ledger: from local Friday 10:00 through the end of local Saturday.
 * The wide window is deliberate — the ledger stops a double send, so the only
 * thing a late run can do is deliver late instead of not at all.
 *
 * Without the ledger: the exact hour only. A wide window with nothing recording
 * what already went out would re-email every fan on every hourly tick.
 */
function isDue(parts: { weekday: number; hour: number }, ledgerAvailable: boolean): boolean {
  if (!ledgerAvailable) return parts.weekday === SEND_WEEKDAY && parts.hour === SEND_HOUR
  if (parts.weekday === SEND_WEEKDAY) return parts.hour >= SEND_HOUR
  return parts.weekday === (SEND_WEEKDAY + 1) % 7
}

function pickVotingRoundEnd(rounds: VotingRound[], now: Date): string | null {
  const sorted = [...rounds].sort((a, b) => a.round_order - b.round_order)
  // Current round: now is between start and end
  const current = sorted.find(r => {
    if (!r.start_date || !r.end_date) return false
    return new Date(r.start_date) <= now && new Date(r.end_date) >= now
  })
  if (current?.end_date) return current.end_date
  // Otherwise: next upcoming round
  const next = sorted.find(r => r.start_date && new Date(r.start_date) > now)
  return next?.end_date || null
}

/** Only a literal hex colour may reach an inline style attribute. */
function safeHexColor(value: string | null | undefined): string | null {
  const v = (value || '').trim()
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

    if (!supabaseUrl || !serviceKey) {
      return new Response(
        JSON.stringify({ error: 'Service not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    let dryRun = false
    let onlyCompetitionId: string | null = null
    let force = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        dryRun = !!body?.dry_run
        force = !!body?.force
        if (typeof body?.competition_id === 'string' && body.competition_id.trim()) {
          onlyCompetitionId = body.competition_id.trim()
        }
      } catch {
        // Empty body / non-JSON — treat as a normal scheduled run.
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const now = new Date()

    // -- 1. Active competitions, with everything the clock and the copy need --
    const { data: competitions, error: compErr } = await supabase
      .from('competitions')
      .select(`
        id, name, slug, status, city, timezone, theme_primary, winners_split_by_gender,
        organization:organizations(name, slug, default_theme_primary),
        city_ref:cities(name, state)
      `)
      .not('status', 'in', '(draft,archive,completed)')
      .order('id', { ascending: true })

    if (compErr) throw new Error(`competitions fetch: ${compErr.message}`)

    let allCompetitions = (competitions || []) as unknown as Competition[]
    if (onlyCompetitionId) {
      allCompetitions = allCompetitions.filter(c => c.id === onlyCompetitionId)
    }

    // -- 2. Is the schedule ledger available? ---------------------------------
    // Edge functions auto-deploy on merge; migrations do not. So this function
    // has to run correctly against a database that has not been migrated yet,
    // and must degrade toward sending LESS, never more.
    let ledgerAvailable = true
    {
      const probe = await supabase.from('fan_digest_sends').select('id').limit(1)
      if (probe.error) {
        ledgerAvailable = false
        console.warn(
          `fan_digest_sends unavailable (${probe.error.message}) — falling back to exact-hour scheduling. ` +
          'Apply migration 20260830000000_126_fan_digest_schedule.sql to enable the catch-up window.',
        )
      }
    }

    // -- 3. Which competitions are due right now, on their own clocks? --------
    interface DueCompetition {
      competition: Competition
      timezone: string
      timezoneSource: string
      weekStart: string
      localDate: string
      localHour: number
    }

    const due: DueCompetition[] = []
    const notDue: Array<Record<string, unknown>> = []

    for (const competition of allCompetitions) {
      const { timezone, source } = resolveTimezone(competition)
      const parts = localParts(now, timezone)
      const weekStart = weekAnchor(parts.date, parts.weekday)

      // A manual { competition_id } send bypasses the clock but not the ledger
      // (pass force:true for that) so an ops re-run cannot silently double-send.
      const scheduled = onlyCompetitionId ? true : isDue(parts, ledgerAvailable)
      if (!scheduled) {
        notDue.push({
          competition_id: competition.id,
          name: competition.name,
          timezone,
          local_time: `${parts.date} ${String(parts.hour).padStart(2, '0')}:00`,
        })
        continue
      }
      due.push({
        competition,
        timezone,
        timezoneSource: source,
        weekStart,
        localDate: parts.date,
        localHour: parts.hour,
      })
    }

    if (due.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No competitions due',
          ledger_available: ledgerAvailable,
          summary: { competitions_due: 0, sent: 0, skipped: 0, failed: 0, resume: false },
          not_due: notDue,
          timestamp: now.toISOString(),
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // -- 4. Paced dispatcher --------------------------------------------------
    const sendIntervalMs = Number(Deno.env.get('DIGEST_SEND_INTERVAL_MS')) || 250
    const maxRuntimeMs = Number(Deno.env.get('DIGEST_MAX_RUNTIME_MS')) || 110_000
    const MAX_ATTEMPTS = 4
    const MAX_BACKOFF_MS = 30_000
    const MAX_PACING_MS = 1_000
    const startedAt = Date.now()

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    const isRateLimited = (status: number, text: string) =>
      status === 429 || /rate ?limit/i.test(text)

    // The limit reports its own wait, inline in the message:
    // "RateLimitError: Rate limit exceeded for function. Retry after 11417ms."
    // Honour it — blind exponential backoff caps below that and keeps failing.
    const retryAfterFromText = (text: string): number | null => {
      const match = text.match(/retry after\s+(\d+)\s*ms/i)
      if (match) return Math.min(Number(match[1]), MAX_BACKOFF_MS)
      return null
    }

    const retryAfterFromResponse = (res: Response, text: string): number | null => {
      const header = res.headers.get('retry-after')
      if (header) {
        const secs = Number(header)
        if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_BACKOFF_MS)
      }
      return retryAfterFromText(text)
    }

    const results: SendResult[] = []
    let rateLimitHits = 0
    // Pacing widens whenever we get rate-limited: the exact ceiling is not
    // documented, so back off into a rate the project actually tolerates.
    let pacingMs = sendIntervalMs

    type QueueEntry =
      | { kind: 'send'; payload: Record<string, unknown>; label: SendResult }
      | { kind: 'skip'; label: SendResult }

    const dispatch = async (entry: Extract<QueueEntry, { kind: 'send' }>) => {
      if (dryRun) {
        results.push({ ...entry.label, status: 'sent', reason: 'dry_run' })
        return
      }
      let lastReason = 'no attempt made'
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const res = await fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(entry.payload),
          })
          if (res.ok) {
            results.push({
              ...entry.label,
              status: 'sent',
              ...(attempt > 1 ? { reason: `sent on attempt ${attempt}` } : {}),
            })
            return
          }
          const text = await res.text()
          lastReason = `${res.status} ${text.slice(0, 200)}`
          if (isRateLimited(res.status, text)) {
            rateLimitHits++
            pacingMs = Math.min(pacingMs + 100, MAX_PACING_MS)
            if (attempt < MAX_ATTEMPTS) {
              const wait = retryAfterFromResponse(res, text) ?? Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)
              // Jitter so a burst of retries does not re-collide.
              await sleep(wait + Math.floor(Math.random() * 250))
              continue
            }
          }
          // Non-rate-limit failure (bad address, template error): do not retry.
          break
        } catch (err) {
          // The per-function rate limit surfaces HERE, as a thrown
          // RateLimitError on the outbound invocation rather than an HTTP
          // response — which is exactly how 308 of 368 sends were lost on
          // 2026-08-21 — so the retry-after hint has to be honoured on this
          // path too, not just on a non-ok response.
          const message = String(err)
          lastReason = message.slice(0, 200)
          if (isRateLimited(0, message)) {
            rateLimitHits++
            pacingMs = Math.min(pacingMs + 100, MAX_PACING_MS)
          }
          if (attempt < MAX_ATTEMPTS) {
            const wait = retryAfterFromText(message) ?? Math.min(1000 * 2 ** attempt, MAX_BACKOFF_MS)
            await sleep(wait + Math.floor(Math.random() * 250))
            continue
          }
        }
      }
      results.push({ ...entry.label, status: 'failed', reason: lastReason })
    }

    // -- 5. Work each due competition ----------------------------------------
    const perCompetition: Array<Record<string, unknown>> = []
    let resume = false
    let competitionsWorked = 0

    for (const item of due) {
      // Guard on having actually DISPATCHED for a competition already (see
      // competitionsWorked below, incremented at the dispatch loop and nowhere
      // else). Two ways this goes wrong otherwise: an unguarded check returns
      // resume:true having sent nothing when the budget was spent before the
      // first competition, and a check that counted skipped competitions lets
      // a run burn its allowance on rows it only looked at — in both cases the
      // caller re-invokes forever and no fan is ever emailed. Every invocation
      // must dispatch for at least one competition.
      if (competitionsWorked > 0 && Date.now() - startedAt > maxRuntimeMs) {
        resume = true
        break
      }

      const competition = item.competition
      const compId = competition.id

      // 5a. Ledger: has this competition already had its digest this local week?
      let cursor = 0
      let ledgerRowId: string | null = null
      let priorSent = 0
      let priorSkipped = 0
      let priorFailed = 0

      if (ledgerAvailable && !force) {
        const { data: existing, error: ledgerErr } = await supabase
          .from('fan_digest_sends')
          .select('id, next_offset, completed_at, sent, skipped, failed')
          .eq('competition_id', compId)
          .eq('week_start', item.weekStart)
          .maybeSingle()

        if (ledgerErr) throw new Error(`fan_digest_sends read: ${ledgerErr.message}`)

        if (existing?.completed_at) {
          perCompetition.push({
            competition_id: compId,
            name: competition.name,
            timezone: item.timezone,
            week_start: item.weekStart,
            status: 'already_sent',
          })
          continue
        }
        if (existing) {
          ledgerRowId = existing.id
          cursor = existing.next_offset || 0
          priorSent = existing.sent || 0
          priorSkipped = existing.skipped || 0
          priorFailed = existing.failed || 0
        }
      }

      // 5b. This competition's rounds, next event, roster and fans.
      const [roundsRes, eventsRes, contestantsRes] = await Promise.all([
        supabase
          .from('voting_rounds')
          .select('competition_id, round_order, start_date, end_date')
          .eq('competition_id', compId),
        supabase
          .from('events')
          .select('competition_id, name, date')
          .eq('competition_id', compId)
          .gte('date', item.localDate)
          .neq('status', 'completed')
          .order('date', { ascending: true })
          .limit(1),
        supabase
          .from('contestants')
          .select('id, name, email, user_id, competition_id, rank, trend, votes, status, gender')
          .eq('competition_id', compId)
          .eq('status', 'active')
          // Stable order: the ledger cursor indexes into the queue built from
          // this list, so a resumed run must rebuild it in the same order.
          .order('id', { ascending: true }),
      ])

      if (roundsRes.error) throw new Error(`voting_rounds fetch: ${roundsRes.error.message}`)
      if (eventsRes.error) throw new Error(`events fetch: ${eventsRes.error.message}`)
      if (contestantsRes.error) throw new Error(`contestants fetch: ${contestantsRes.error.message}`)

      const contestants = (contestantsRes.data || []) as Contestant[]
      if (contestants.length === 0) {
        perCompetition.push({
          competition_id: compId,
          name: competition.name,
          timezone: item.timezone,
          week_start: item.weekStart,
          status: 'no_active_contestants',
        })
        continue
      }

      const votingRoundEnd = pickVotingRoundEnd((roundsRes.data || []) as VotingRound[], now)
      const nextEvent = ((eventsRes.data || []) as UpcomingEvent[])[0] || null

      // Live standing rank: position by votes WITHIN their gender when the
      // competition splits winners by gender, or overall otherwise. Mirrors the
      // public leaderboard / finalize_voting_round and replaces the global,
      // host-curated contestants.rank column.
      const rankById = new Map<string, number>()
      const assignRanks = (list: Contestant[]) => {
        list.sort((a, b) => (b.votes || 0) - (a.votes || 0))
        list.forEach((c, i) => rankById.set(c.id, i + 1))
      }
      if (competition.winners_split_by_gender) {
        assignRanks(contestants.filter(c => c.gender === 'male'))
        assignRanks(contestants.filter(c => c.gender === 'female'))
        assignRanks(contestants.filter(c => c.gender !== 'male' && c.gender !== 'female'))
      } else {
        assignRanks([...contestants])
      }

      const contestantIds = contestants.map(c => c.id)

      // contestant_fans.user_id references auth.users (not profiles), so
      // PostgREST cannot embed the profile relation here — fan emails come from
      // the bulk profiles lookup below.
      const { data: fans, error: fansErr } = await supabase
        .from('contestant_fans')
        .select('id, user_id, contestant_id, email_weekly_updates')
        .in('contestant_id', contestantIds)
        .eq('email_weekly_updates', true)
        .order('id', { ascending: true })

      if (fansErr) throw new Error(`contestant_fans fetch: ${fansErr.message}`)

      const fansByContestant = new Map<string, FanRow[]>()
      for (const f of (fans || []) as FanRow[]) {
        if (!fansByContestant.has(f.contestant_id)) fansByContestant.set(f.contestant_id, [])
        fansByContestant.get(f.contestant_id)!.push(f)
      }

      // Profile emails for contestants (fallback when contestants.email is
      // empty) and fans (always). One bulk query.
      const userIdsNeedingEmail = new Set<string>()
      for (const c of contestants) if (c.user_id) userIdsNeedingEmail.add(c.user_id)
      for (const f of (fans || []) as FanRow[]) userIdsNeedingEmail.add(f.user_id)

      const profileEmailByUserId = new Map<string, string>()
      if (userIdsNeedingEmail.size > 0) {
        const { data: profiles, error: profilesErr } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', Array.from(userIdsNeedingEmail))
        if (profilesErr) throw new Error(`profiles fetch: ${profilesErr.message}`)
        for (const p of profiles || []) {
          if (p.email) profileEmailByUserId.set(p.id, p.email)
        }
      }

      // 5c. Branding the copy speaks in — the competition's, not the platform's.
      const org = competition.organization
      const orgSlug = org?.slug || 'most-eligible'
      const competitionUrl = competition.slug
        ? `${appUrl}/${orgSlug}/${competition.slug}`
        : appUrl
      const competitionName = competition.name || org?.name || 'EliteRank'
      const cityName = competition.city_ref?.name || competition.city || null
      const brandAccent = safeHexColor(competition.theme_primary)
        || safeHexColor(org?.default_theme_primary)
        || null

      // 5d. Build this competition's recipient queue.
      const queue: QueueEntry[] = []
      for (const contestant of contestants) {
        const profileUrl = contestant.user_id
          ? `${appUrl}/profile/${contestant.user_id}`
          : competitionUrl

        const sharedPayload = {
          type: 'fan_weekly_digest',
          contestant_name: contestant.name,
          competition_name: competitionName,
          competition_id: compId,
          competition_url: competitionUrl,
          competition_city: cityName,
          brand_accent: brandAccent,
          profile_url: profileUrl,
          rank: rankById.get(contestant.id) ?? null,
          trend: contestant.trend,
          total_votes: contestant.votes,
          voting_round_end: votingRoundEnd,
          next_event_name: nextEvent?.name || null,
          next_event_date: nextEvent?.date || null,
        }

        const contestantEmail = contestant.email
          || (contestant.user_id ? profileEmailByUserId.get(contestant.user_id) : null)
            || null
        const baseLabel = {
          competition_id: compId,
          contestant_id: contestant.id,
          contestant_name: contestant.name,
        }

        if (contestantEmail) {
          queue.push({
            kind: 'send',
            payload: { ...sharedPayload, to_email: contestantEmail, is_self: true },
            label: { ...baseLabel, recipient: 'self', to_email: contestantEmail, status: 'sent' },
          })
        } else {
          queue.push({
            kind: 'skip',
            label: { ...baseLabel, recipient: 'self', to_email: '', status: 'skipped', reason: 'no email on file' },
          })
        }

        for (const fan of fansByContestant.get(contestant.id) || []) {
          const fanEmail = profileEmailByUserId.get(fan.user_id) || null
          if (!fanEmail) {
            queue.push({
              kind: 'skip',
              label: { ...baseLabel, recipient: 'fan', to_email: '', status: 'skipped', reason: 'fan has no profile email' },
            })
            continue
          }
          queue.push({
            kind: 'send',
            payload: { ...sharedPayload, to_email: fanEmail, is_self: false, fan_id: fan.id },
            label: { ...baseLabel, recipient: 'fan', to_email: fanEmail, status: 'sent' },
          })
        }
      }

      // 5e. Claim the week before sending, so a crash mid-send cannot come back
      // as a full re-send on the next hourly tick.
      if (ledgerAvailable && !dryRun && !ledgerRowId) {
        const { data: inserted, error: claimErr } = await supabase
          .from('fan_digest_sends')
          .insert({
            competition_id: compId,
            week_start: item.weekStart,
            timezone: item.timezone,
            next_offset: 0,
            recipients: queue.length,
          })
          .select('id')
          .maybeSingle()
        if (claimErr) {
          // Unique violation = another run claimed it between our read and our
          // insert. Yield the week to that run rather than sending twice.
          console.warn(`fan_digest_sends claim for ${compId}: ${claimErr.message}`)
          perCompetition.push({
            competition_id: compId,
            name: competitionName,
            timezone: item.timezone,
            week_start: item.weekStart,
            status: 'claimed_elsewhere',
          })
          continue
        }
        ledgerRowId = inserted?.id || null
      }

      // 5f. Dispatch from the cursor, pacing between sends.
      // Past this point the competition counts as worked: everything above is a
      // lookup or a skip, and only real dispatch may spend the time budget.
      competitionsWorked++
      const beforeCount = results.length
      let processed = 0
      let stoppedEarly = false
      const slice = queue.slice(cursor)

      for (const entry of slice) {
        if (processed > 0 && Date.now() - startedAt > maxRuntimeMs) {
          stoppedEarly = true
          resume = true
          break
        }
        if (entry.kind === 'skip') {
          results.push(entry.label)
          processed++
          continue
        }
        await dispatch(entry)
        processed++
        if (processed < slice.length) await sleep(pacingMs)
      }

      const runResults = results.slice(beforeCount)
      const runSent = runResults.filter(r => r.status === 'sent').length
      const runSkipped = runResults.filter(r => r.status === 'skipped').length
      const runFailed = runResults.filter(r => r.status === 'failed').length
      const newCursor = cursor + processed
      const complete = newCursor >= queue.length

      if (ledgerAvailable && !dryRun && ledgerRowId) {
        const { error: updateErr } = await supabase
          .from('fan_digest_sends')
          .update({
            next_offset: newCursor,
            recipients: queue.length,
            sent: priorSent + runSent,
            skipped: priorSkipped + runSkipped,
            failed: priorFailed + runFailed,
            completed_at: complete ? new Date().toISOString() : null,
          })
          .eq('id', ledgerRowId)
        if (updateErr) console.warn(`fan_digest_sends update for ${compId}: ${updateErr.message}`)
      }

      perCompetition.push({
        competition_id: compId,
        name: competitionName,
        city: cityName,
        timezone: item.timezone,
        timezone_source: item.timezoneSource,
        local_hour: item.localHour,
        week_start: item.weekStart,
        status: complete ? 'complete' : 'partial',
        recipients: queue.length,
        resumed_from: cursor,
        sent: runSent,
        skipped: runSkipped,
        failed: runFailed,
      })

      if (stoppedEarly) break
    }

    const summary = {
      competitions_due: due.length,
      competitions_processed: perCompetition.length,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
      rate_limited: rateLimitHits,
      resume,
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: dryRun,
        ledger_available: ledgerAvailable,
        summary,
        competitions: perCompetition,
        results,
        timestamp: now.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    console.error('send-fan-weekly-digest error:', error)
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
