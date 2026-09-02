import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  isEffectivePromotionStart,
  isWeeklyDigestDue,
  localOccurrenceDate,
  retryAt,
  type PromotionWindow,
} from '../_shared/fan-email-policy.ts'

const headers = { 'Content-Type': 'application/json' }

interface Organization {
  id: string
  name: string
  slug: string
}

interface Competition {
  id: string
  name: string
  slug: string
  status: string
  timezone: string | null
  organization: Organization | Organization[] | null
}

interface Contestant {
  id: string
  name: string
  competition_id: string
  votes: number | null
  trend: 'up' | 'down' | 'same' | null
  gender: string | null
}

interface Fan {
  id: string
  user_id: string
  contestant_id: string
  email_weekly_updates: boolean
}

interface Round {
  id: string
  competition_id: string
  round_order: number
  end_date: string | null
}

interface DeliveryClaim {
  id: string
  payload: Record<string, unknown>
  attempt_count: number
  claim_token: string
}

interface Occurrence {
  kind: 'weekly_digest' | 'round_closing' | 'vote_boost'
  key: string
  roundEnd?: string
  multiplier?: number
}

function one<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] || null : value
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers })
}

/**
 * Rank comes from `mv_leaderboard`, the server-side standing authority
 * (`RANK() OVER (PARTITION BY competition_id ORDER BY votes DESC)`, already
 * filtered to active contestants).
 *
 * This used to sort contestants by `votes` in JavaScript and print the ARRAY
 * INDEX as the rank. That is a second ranking authority, which is this
 * project's most expensive bug shape, and it differs from the view in two ways
 * a reader would notice: the view emits RANK(), so tied vote counts share a
 * position, while an array index silently invents an order between them; and a
 * digest is worse than a screen for this, because an inbox does not re-render
 * when the real board disagrees. V2's digest had exactly this defect and was
 * repaired the same way.
 */
function rankMapFrom(rows: ReadonlyArray<{ contestant_id: string; rank: number | null }>): Map<string, number> {
  const ranks = new Map<string, number>()
  for (const row of rows) {
    if (typeof row.rank === 'number') ranks.set(row.contestant_id, row.rank)
  }
  return ranks
}

function buildOccurrences(
  competition: Competition,
  now: Date,
  rounds: Round[],
  windows: PromotionWindow[],
  doubleDayDates: readonly string[],
): Occurrence[] {
  const timezone = competition.timezone || 'UTC'
  const occurrences: Occurrence[] = []
  if (isWeeklyDigestDue(now, timezone)) {
    occurrences.push({
      kind: 'weekly_digest',
      key: `weekly:${competition.id}:${localOccurrenceDate(now, timezone).date}`,
    })
  }

  const nextDay = now.getTime() + 24 * 60 * 60 * 1000
  for (const round of rounds) {
    if (round.competition_id !== competition.id || !round.end_date) continue
    const end = new Date(round.end_date).getTime()
    if (now.getTime() < end && end <= nextDay) {
      occurrences.push({
        kind: 'round_closing',
        key: `round-closing:${round.id}:${round.end_date}`,
        roundEnd: round.end_date,
      })
    }
  }

  const recentFloor = now.getTime() - 65 * 60 * 1000
  for (const window of windows) {
    const starts = new Date(window.starts_at).getTime()
    if (
      window.competition_id === competition.id
      && starts <= now.getTime()
      && starts >= recentFloor
      && isEffectivePromotionStart(window, windows, {
        dates: doubleDayDates, timezone,
      })
    ) {
      occurrences.push({
        kind: 'vote_boost',
        key: `vote-boost:${window.id}:${window.starts_at}:${window.multiplier}`,
        multiplier: window.multiplier,
      })
    }
  }
  return occurrences
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const appUrl = Deno.env.get('APP_URL')
  if (!supabaseUrl || !serviceKey || !appUrl) {
    return json(503, { success: false, error: 'worker_not_configured' })
  }

  let body: { dry_run?: boolean; now?: string; batch_size?: number } = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is a normal scheduler invocation.
  }
  const dryRun = body.dry_run === true
  // A caller-supplied clock exists for TESTING a past or future occurrence
  // without sending anything. It is honoured on dry runs only: once dispatch
  // is enabled in production, an arbitrary `now` would let any authenticated
  // caller queue deliveries for occurrence windows the wall clock has
  // passed — bounded by the gates, but still an unearned queueing lever.
  // Real sends always use the machine clock.
  const now = dryRun && body.now ? new Date(body.now) : new Date()
  if (Number.isNaN(now.getTime())) return json(400, { success: false, error: 'invalid_now' })
  const batchSize = Math.min(100, Math.max(1, Math.trunc(body.batch_size || 50)))
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  try {
    const { data: dispatchSetting, error: settingError } = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'fan_email_dispatch')
      .maybeSingle()
    if (settingError) throw new Error(`dispatch setting: ${settingError.message}`)
    const dispatchEnabled = dispatchSetting?.value?.enabled === true
    if (!dispatchEnabled && !dryRun) {
      return json(200, { success: true, disabled: true, queued: 0, claimed: 0 })
    }

    const { data: competitionRows, error: competitionError } = await db
      .from('competitions')
      .select('id, name, slug, status, timezone, organization:organizations(id, name, slug)')
      .not('status', 'in', '(draft,archive,completed)')
    if (competitionError) throw new Error(`competitions: ${competitionError.message}`)
    const competitions = (competitionRows || []) as Competition[]
    const competitionIds = competitions.map(competition => competition.id)
    if (competitionIds.length === 0) return json(200, { success: true, queued: 0, claimed: 0 })

    const weekFloor = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const promotionFloor = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString()
    const [
      contestantsResult, fansResult, roundsResult, boostsResult, votesResult,
      standingsResult, doubleDaysResult,
    ] = await Promise.all([
      db.from('contestants')
        .select('id, name, competition_id, votes, trend, gender')
        .in('competition_id', competitionIds)
        .eq('status', 'active'),
      db.from('contestant_fans')
        .select('id, user_id, contestant_id, email_weekly_updates')
        .eq('email_weekly_updates', true),
      db.from('voting_rounds')
        .select('id, competition_id, round_order, end_date')
        .in('competition_id', competitionIds),
      db.from('competition_vote_boosts')
        .select('id, competition_id, starts_at, ends_at, multiplier, cancelled_at')
        .in('competition_id', competitionIds)
        .lte('starts_at', now.toISOString())
        .gt('ends_at', promotionFloor),
      db.from('votes')
        .select('contestant_id, vote_count')
        .in('competition_id', competitionIds)
        .gte('created_at', weekFloor),
      db.from('mv_leaderboard')
        .select('contestant_id, rank')
        .in('competition_id', competitionIds),
      // Compatibility double-vote days are part of the effective multiplier,
      // so a boost-start check that cannot see them announces a 2x on a day
      // that was already 2x.
      db.from('competition_double_days')
        .select('competition_id, date')
        .in('competition_id', competitionIds),
    ])
    for (const [name, result] of [
      ['contestants', contestantsResult], ['fans', fansResult], ['rounds', roundsResult],
      ['boosts', boostsResult], ['weekly votes', votesResult], ['standings', standingsResult],
      ['double days', doubleDaysResult],
    ] as const) {
      if (result.error) throw new Error(`${name}: ${result.error.message}`)
    }

    const contestants = (contestantsResult.data || []) as Contestant[]
    const contestantById = new Map(contestants.map(contestant => [contestant.id, contestant]))
    const fans = ((fansResult.data || []) as Fan[])
      .filter(fan => contestantById.has(fan.contestant_id))
    const fanUserIds = [...new Set(fans.map(fan => fan.user_id))]
    const { data: profiles, error: profileError } = fanUserIds.length > 0
      ? await db.from('profiles').select('id, email').in('id', fanUserIds)
      : { data: [], error: null }
    if (profileError) throw new Error(`profiles: ${profileError.message}`)
    const emailByUser = new Map(
      (profiles || []).filter(profile => profile.email).map(profile => [profile.id, profile.email]),
    )
    const ranks = rankMapFrom(
      (standingsResult.data || []) as ReadonlyArray<{ contestant_id: string; rank: number | null }>,
    )
    const weeklyVotes = new Map<string, number>()
    for (const vote of votesResult.data || []) {
      weeklyVotes.set(vote.contestant_id, (weeklyVotes.get(vote.contestant_id) || 0) + Number(vote.vote_count || 0))
    }

    const rounds = (roundsResult.data || []) as Round[]
    const windows = (boostsResult.data || []) as PromotionWindow[]
    const doubleDayRows = (doubleDaysResult.data || []) as Array<{
      competition_id: string
      date: string
    }>
    const doubleDaysByCompetition = new Map<string, string[]>()
    for (const row of doubleDayRows) {
      const existing = doubleDaysByCompetition.get(row.competition_id)
      if (existing) existing.push(row.date)
      else doubleDaysByCompetition.set(row.competition_id, [row.date])
    }
    const queueRows: Record<string, unknown>[] = []
    for (const competition of competitions) {
      const organization = one(competition.organization)
      // Ambiguous branding or routing is a hard skip; no customer/platform
      // fallback may silently send another organization's identity.
      if (!organization?.id || !organization.name || !organization.slug || !competition.name || !competition.slug) continue
      const competitionUrl = `${appUrl.replace(/\/$/, '')}/${organization.slug}/${competition.slug}`
      const occurrences = buildOccurrences(
        competition, now, rounds, windows,
        doubleDaysByCompetition.get(competition.id) ?? [],
      )
      for (const occurrence of occurrences) {
        for (const contestant of contestants.filter(row => row.competition_id === competition.id)) {
          const purchaseVotesUrl = `${competitionUrl}?voteFor=${encodeURIComponent(contestant.id)}`
          for (const fan of fans.filter(row => row.contestant_id === contestant.id)) {
            const email = emailByUser.get(fan.user_id)
            if (!email) continue
            const providerType = occurrence.kind === 'weekly_digest'
              ? 'fan_weekly_digest'
              : occurrence.kind === 'round_closing'
                ? 'fan_round_closing'
                : 'fan_vote_boost'
            queueRows.push({
              organization_id: organization.id,
              competition_id: competition.id,
              contestant_id: contestant.id,
              fan_id: fan.id,
              recipient_id: fan.user_id,
              recipient_email: email.trim().toLowerCase(),
              message_kind: occurrence.kind,
              occurrence_key: occurrence.key,
              payload: {
                type: providerType,
                to_email: email.trim().toLowerCase(),
                fan_id: fan.id,
                recipient_id: fan.user_id,
                organization_name: organization.name,
                competition_id: competition.id,
                competition_name: competition.name,
                contestant_name: contestant.name,
                competition_url: competitionUrl,
                purchase_votes_url: purchaseVotesUrl,
                rank: ranks.get(contestant.id) || null,
                trend: contestant.trend,
                total_votes: contestant.votes || 0,
                weekly_votes: weeklyVotes.get(contestant.id) || 0,
                voting_round_end: occurrence.roundEnd || null,
                vote_multiplier: occurrence.multiplier || null,
                timezone: competition.timezone || 'UTC',
              },
            })
          }
        }
      }
    }

    if (dryRun) {
      return json(200, {
        success: true,
        dry_run: true,
        dispatch_enabled: dispatchEnabled,
        candidate_deliveries: queueRows.length,
      })
    }

    if (queueRows.length > 0) {
      const { error: queueError } = await db.from('fan_email_deliveries').upsert(queueRows, {
        onConflict: 'recipient_id,contestant_id,message_kind,occurrence_key',
        ignoreDuplicates: true,
      })
      if (queueError) throw new Error(`queue deliveries: ${queueError.message}`)
    }

    const { data: claimRows, error: claimError } = await db.rpc('claim_fan_email_deliveries', {
      p_limit: batchSize,
      p_now: now.toISOString(),
      p_lease: '5 minutes',
    })
    if (claimError) throw new Error(`claim deliveries: ${claimError.message}`)
    const claims = (claimRows || []) as DeliveryClaim[]
    const results: Array<{ id: string; status: string }> = []

    for (const claim of claims) {
      const payload: Record<string, unknown> = { ...claim.payload, delivery_id: claim.id }
      const fanId = String(payload.fan_id || '')
      const recipientId = String(payload.recipient_id || '')
      const recipientEmail = String(payload.to_email || '')
      const [{ data: fan, error: fanError }, { data: profile, error: currentEmailError }] = await Promise.all([
        db.from('contestant_fans')
          .select('id, user_id, email_weekly_updates')
          .eq('id', fanId)
          .eq('user_id', recipientId)
          .maybeSingle(),
        db.from('profiles').select('email').eq('id', recipientId).maybeSingle(),
      ])
      let status = 'failed'
      let providerId: string | null = null
      let errorText: string | null = null
      if (fanError || currentEmailError) {
        errorText = fanError?.message || currentEmailError?.message || 'preflight_failed'
      } else if (!fan?.email_weekly_updates || profile?.email?.trim().toLowerCase() !== recipientEmail) {
        status = 'suppressed'
      } else {
        try {
          const providerResponse = await fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${serviceKey}`,
            },
            body: JSON.stringify(payload),
          })
          const providerBody = await providerResponse.json().catch(() => ({}))
          if (providerResponse.ok && providerBody?.suppressed === true) {
            status = 'suppressed'
          } else if (providerResponse.ok && providerBody?.success === true) {
            status = 'accepted'
            providerId = providerBody.onesignal_id || null
          } else {
            errorText = `${providerResponse.status} ${JSON.stringify(providerBody).slice(0, 800)}`
          }
        } catch (error) {
          errorText = String(error).slice(0, 800)
        }
      }

      const { data: settled, error: settleError } = await db.rpc('settle_fan_email_delivery', {
        p_id: claim.id,
        p_claim_token: claim.claim_token,
        p_status: status,
        p_provider_id: providerId,
        p_error: errorText,
        p_retry_at: status === 'failed' ? retryAt(now, claim.attempt_count) : null,
        p_now: now.toISOString(),
      })
      if (settleError || settled !== true) throw new Error(`settle delivery ${claim.id}: ${settleError?.message || 'claim_lost'}`)
      results.push({ id: claim.id, status })
    }

    return json(200, {
      success: true,
      queued_candidates: queueRows.length,
      claimed: claims.length,
      accepted: results.filter(result => result.status === 'accepted').length,
      suppressed: results.filter(result => result.status === 'suppressed').length,
      failed: results.filter(result => result.status === 'failed').length,
    })
  } catch (error) {
    console.error(JSON.stringify({ event: 'fan_email_worker_failed', error: String(error) }))
    return json(500, { success: false, error: String(error) })
  }
})
