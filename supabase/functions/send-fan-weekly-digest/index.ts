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
 *   - Manual invocation: POST with the service role key, optional { dry_run: true }
 *     returns the build summary without sending.
 *
 * Required Supabase secrets:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_URL              — e.g. https://eliterank.co (used for self-digest
 *                          unsubscribe link → /notifications settings page)
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

    // Optional { dry_run: true } for manual sanity-checks without sending.
    let dryRun = false
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        dryRun = !!body?.dry_run
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

    // 7. For each contestant, build payload and dispatch.
    const results: SendResult[] = []

    const sendOne = async (payload: Record<string, unknown>, label: SendResult) => {
      if (dryRun) {
        results.push({ ...label, status: 'sent', reason: 'dry_run' })
        return
      }
      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify(payload),
        })
        if (!res.ok) {
          const text = await res.text()
          results.push({ ...label, status: 'failed', reason: `${res.status} ${text.slice(0, 200)}` })
          return
        }
        results.push({ ...label, status: 'sent' })
      } catch (err) {
        results.push({ ...label, status: 'failed', reason: String(err).slice(0, 200) })
      }
    }

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

      // 7a. Send to the contestant themselves.
      const contestantEmail = contestant.email
        || (contestant.user_id ? profileEmailByUserId.get(contestant.user_id) : null)
          || null
      if (contestantEmail) {
        await sendOne(
          {
            ...sharedPayload,
            to_email: contestantEmail,
            is_self: true,
          },
          { contestant_id: contestant.id, contestant_name: contestant.name, recipient: 'self', to_email: contestantEmail, status: 'sent' },
        )
      } else {
        results.push({
          contestant_id: contestant.id,
          contestant_name: contestant.name,
          recipient: 'self',
          to_email: '',
          status: 'skipped',
          reason: 'no email on file',
        })
      }

      // 7b. Send to each subscribed fan.
      const fanRows = fansByContestant.get(contestant.id) || []
      for (const fan of fanRows) {
        const fanEmail = profileEmailByUserId.get(fan.user_id) || null
        if (!fanEmail) {
          results.push({
            contestant_id: contestant.id,
            contestant_name: contestant.name,
            recipient: 'fan',
            to_email: '',
            status: 'skipped',
            reason: 'fan has no profile email',
          })
          continue
        }
        await sendOne(
          {
            ...sharedPayload,
            to_email: fanEmail,
            is_self: false,
            fan_id: fan.id,
          },
          { contestant_id: contestant.id, contestant_name: contestant.name, recipient: 'fan', to_email: fanEmail, status: 'sent' },
        )
      }
    }

    const summary = {
      competitions: competitions.length,
      contestants: contestants.length,
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
