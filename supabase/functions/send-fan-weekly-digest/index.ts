import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * send-fan-weekly-digest — Weekly performance digest for contestants and their fans.
 *
 * For every active contestant in every non-draft / non-completed competition,
 * build a stats snapshot and email it to:
 *   - the contestant themselves (always — the "performance update" they opted
 *     into when they entered the competition)
 *   - each of their fans whose contestant_fans.email_weekly_updates is true
 *
 * Designed to be invoked on a weekly cron — Friday 10am CST (16:00 UTC). The
 * function is idempotent by design: running it twice on the same day will
 * send two emails, but running it once per week is the intended schedule.
 *
 * Trigger options:
 *   - Cron via pg_cron + pg_net (see migration 042_fan_weekly_digest_cron.sql)
 *   - Manual invocation: POST with the service role key. Body options:
 *       { dry_run: true }   build the recipient list without sending
 *       { offset, limit }   dispatch only that slice of the recipient queue
 *
 * Every recipient costs one invocation of send-onesignal-email, and Supabase
 * rate-limits per function: an unpaced run sends the first ~60 emails and then
 * fails the rest with "RateLimitError: Rate limit exceeded for function". Fans
 * queue behind their contestant, so they absorbed nearly all of that loss. The
 * dispatcher below paces sends, retries rate-limited ones honouring the
 * server's retry-after hint, and returns `summary.next_offset` when it stops
 * early so the caller can resume without exceeding the wall-clock limit.
 *
 * Required Supabase secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_URL              — e.g. https://eliterank.co (used for self-digest
 *                          unsubscribe link → /notifications settings page)
 * Optional:
 *   DIGEST_SEND_INTERVAL_MS — ms between sends (default 250)
 *   DIGEST_MAX_RUNTIME_MS   — stop and return next_offset after this (default 110000)
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Competition {
  id: string
  name: string | null
  slug: string | null
  status: string
  winners_split_by_gender: boolean | null
  organization: { slug: string | null } | null
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
  contestant_id: string
  contestant_name: string
  recipient: 'self' | 'fan'
  to_email: string
  status: 'sent' | 'skipped' | 'failed'
  reason?: string
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

    // Optional { dry_run } for manual sanity-checks, { offset, limit } to
    // dispatch one slice of the recipient queue (see the resume note above).
    let dryRun = false
    let offset = 0
    let limit: number | null = null
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        dryRun = !!body?.dry_run
        const parsedOffset = Number(body?.offset)
        if (Number.isFinite(parsedOffset) && parsedOffset > 0) offset = Math.floor(parsedOffset)
        const parsedLimit = Number(body?.limit)
        if (Number.isFinite(parsedLimit) && parsedLimit > 0) limit = Math.floor(parsedLimit)
      } catch {
        // Empty body / non-JSON — treat as normal run.
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const now = new Date()

    // 1. Active competitions (exclude draft, archive, completed).
    const { data: competitions, error: compErr } = await supabase
      .from('competitions')
      .select('id, name, slug, status, winners_split_by_gender, organization:organizations(slug)')
      .not('status', 'in', '(draft,archive,completed)')

    if (compErr) throw new Error(`competitions fetch: ${compErr.message}`)
    if (!competitions || competitions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active competitions', results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const compIds = (competitions as Competition[]).map(c => c.id)
    const compById = new Map<string, Competition>(
      (competitions as Competition[]).map(c => [c.id, c]),
    )

    // 2. Voting rounds for those competitions.
    const { data: rounds, error: roundsErr } = await supabase
      .from('voting_rounds')
      .select('competition_id, round_order, start_date, end_date')
      .in('competition_id', compIds)

    if (roundsErr) throw new Error(`voting_rounds fetch: ${roundsErr.message}`)

    const roundsByComp = new Map<string, VotingRound[]>()
    for (const r of (rounds || []) as VotingRound[]) {
      if (!roundsByComp.has(r.competition_id)) roundsByComp.set(r.competition_id, [])
      roundsByComp.get(r.competition_id)!.push(r)
    }

    // 3. Upcoming events (date >= today, not completed), earliest per competition.
    const today = now.toISOString().slice(0, 10)
    const { data: events, error: eventsErr } = await supabase
      .from('events')
      .select('competition_id, name, date')
      .in('competition_id', compIds)
      .gte('date', today)
      .neq('status', 'completed')
      .order('date', { ascending: true })

    if (eventsErr) throw new Error(`events fetch: ${eventsErr.message}`)

    const nextEventByComp = new Map<string, UpcomingEvent>()
    for (const e of (events || []) as UpcomingEvent[]) {
      if (!nextEventByComp.has(e.competition_id)) nextEventByComp.set(e.competition_id, e)
    }

    // 4. Active contestants in those competitions.
    const { data: contestants, error: contestantsErr } = await supabase
      .from('contestants')
      .select('id, name, email, user_id, competition_id, rank, trend, votes, status, gender')
      .in('competition_id', compIds)
      .eq('status', 'active')
      // Stable order: `offset` indexes into the queue built from this list, so
      // a resumed invocation must rebuild it in exactly the same order.
      .order('id', { ascending: true })

    if (contestantsErr) throw new Error(`contestants fetch: ${contestantsErr.message}`)

    if (!contestants || contestants.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No active contestants', results: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const contestantIds = (contestants as Contestant[]).map(c => c.id)

    // Live standing rank per contestant: position by votes WITHIN their gender
    // when the competition splits winners by gender, or overall otherwise.
    // Mirrors the public leaderboard / finalize_voting_round and replaces the
    // global, host-curated contestants.rank column.
    const rankById = new Map<string, number>()
    const rosterByComp = new Map<string, Contestant[]>()
    for (const c of contestants as Contestant[]) {
      if (!rosterByComp.has(c.competition_id)) rosterByComp.set(c.competition_id, [])
      rosterByComp.get(c.competition_id)!.push(c)
    }
    const assignRanks = (list: Contestant[]) => {
      list.sort((a, b) => (b.votes || 0) - (a.votes || 0))
      list.forEach((c, i) => rankById.set(c.id, i + 1))
    }
    for (const [compId, roster] of rosterByComp) {
      if (compById.get(compId)?.winners_split_by_gender) {
        assignRanks(roster.filter(c => c.gender === 'male'))
        assignRanks(roster.filter(c => c.gender === 'female'))
        assignRanks(roster.filter(c => c.gender !== 'male' && c.gender !== 'female'))
      } else {
        assignRanks(roster)
      }
    }

    // 5. Fans for those contestants with opt-in still on. contestant_fans.user_id
    // references auth.users (not profiles), so PostgREST cannot embed the
    // profile relation here — we fetch fan emails in the bulk profiles lookup
    // below instead.
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

    // 6. Profile emails for contestants (fallback when contestants.email is
    // empty) and fans (always). Fetch in one bulk query.
    const userIdsNeedingEmail = new Set<string>()
    for (const c of contestants as Contestant[]) {
      if (c.user_id) userIdsNeedingEmail.add(c.user_id)
    }
    for (const f of (fans || []) as FanRow[]) {
      userIdsNeedingEmail.add(f.user_id)
    }

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

    // 7. Build the full recipient queue (contestant + their opted-in fans).
    //    Nothing is sent here — the queue is built in one deterministic pass so
    //    that `offset` means the same thing across resumed invocations.
    type QueueEntry =
      | { kind: 'send'; payload: Record<string, unknown>; label: SendResult }
      | { kind: 'skip'; label: SendResult }

    const queue: QueueEntry[] = []

    for (const contestant of contestants as Contestant[]) {
      const competition = compById.get(contestant.competition_id)
      if (!competition) continue

      const votingRoundEnd = pickVotingRoundEnd(
        roundsByComp.get(contestant.competition_id) || [],
        now,
      )
      const nextEvent = nextEventByComp.get(contestant.competition_id)

      const orgSlug = competition.organization?.slug || 'most-eligible'
      const competitionUrl = competition.slug
        ? `${appUrl}/${orgSlug}/${competition.slug}`
        : `${appUrl}`
      const profileUrl = contestant.user_id
        ? `${appUrl}/profile/${contestant.user_id}`
        : competitionUrl

      const sharedPayload = {
        type: 'fan_weekly_digest',
        contestant_name: contestant.name,
        competition_name: competition.name || 'Most Eligible',
        competition_id: contestant.competition_id,
        competition_url: competitionUrl,
        profile_url: profileUrl,
        rank: rankById.get(contestant.id) ?? null,
        trend: contestant.trend,
        total_votes: contestant.votes,
        voting_round_end: votingRoundEnd,
        next_event_name: nextEvent?.name || null,
        next_event_date: nextEvent?.date || null,
      }

      // 7a. The contestant themselves.
      const contestantEmail = contestant.email
        || (contestant.user_id ? profileEmailByUserId.get(contestant.user_id) : null)
          || null
      if (contestantEmail) {
        queue.push({
          kind: 'send',
          payload: { ...sharedPayload, to_email: contestantEmail, is_self: true },
          label: { contestant_id: contestant.id, contestant_name: contestant.name, recipient: 'self', to_email: contestantEmail, status: 'sent' },
        })
      } else {
        queue.push({
          kind: 'skip',
          label: {
            contestant_id: contestant.id,
            contestant_name: contestant.name,
            recipient: 'self',
            to_email: '',
            status: 'skipped',
            reason: 'no email on file',
          },
        })
      }

      // 7b. Each subscribed fan.
      const fanRows = fansByContestant.get(contestant.id) || []
      for (const fan of fanRows) {
        const fanEmail = profileEmailByUserId.get(fan.user_id) || null
        if (!fanEmail) {
          queue.push({
            kind: 'skip',
            label: {
              contestant_id: contestant.id,
              contestant_name: contestant.name,
              recipient: 'fan',
              to_email: '',
              status: 'skipped',
              reason: 'fan has no profile email',
            },
          })
          continue
        }
        queue.push({
          kind: 'send',
          payload: { ...sharedPayload, to_email: fanEmail, is_self: false, fan_id: fan.id },
          label: { contestant_id: contestant.id, contestant_name: contestant.name, recipient: 'fan', to_email: fanEmail, status: 'sent' },
        })
      }
    }

    // 8. Dispatch the requested slice, paced so we stay under the per-function
    //    rate limit and retrying the ones that trip it anyway.
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

    const slice = queue.slice(offset, limit ? offset + limit : undefined)
    let processed = 0
    let stoppedEarly = false

    for (const entry of slice) {
      if (processed > 0 && Date.now() - startedAt > maxRuntimeMs) {
        stoppedEarly = true
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

    const consumed = offset + processed
    const nextOffset = consumed < queue.length ? consumed : null

    const summary = {
      competitions: competitions.length,
      contestants: contestants.length,
      recipients: queue.length,
      offset,
      processed,
      next_offset: nextOffset,
      stopped_early: stoppedEarly,
      rate_limited: rateLimitHits,
      sent: results.filter(r => r.status === 'sent').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'failed').length,
    }

    return new Response(
      JSON.stringify({ success: true, dry_run: dryRun, summary, results, timestamp: now.toISOString() }),
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
