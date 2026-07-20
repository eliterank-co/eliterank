import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * notify-contestant-promoted — Emails a nominee once they've been converted
 * into an official contestant, branded with the specific competition they
 * joined.
 *
 * Sends the branded `contestant_promoted` email (via send-onesignal-email) and,
 * for contestants with a linked account, fires a push notification
 * (fire-and-forget). It does NOT create the in-app notification — the client
 * approval flow (`approveNominee`) already inserts a `nomination_approved`
 * notification, so creating one here would duplicate it.
 *
 * Called from the client right after a nominee is approved, and also usable for
 * a competition-wide backfill (e.g. announce all current contestants at once).
 *
 * Body (one of):
 *   { contestant_id: string }
 *     — email a single freshly-promoted contestant.
 *   { competition_id: string, contestant_ids?: string[] }
 *     — email every active contestant in the competition, or just the given
 *       ids. Use this to notify "all users converted from nominee to
 *       contestant" for a competition in one call.
 *
 * Returns: { success, total, sent, failed, skipped }
 */

// ── TEMPORARY test gate ─────────────────────────────────────────────────────
// While validating the promotion email, restrict sends to specific
// competition(s). Any contestant outside the allow-list is skipped (never
// emailed). To open this up to ALL competitions, either:
//   • set the CONTESTANT_PROMOTED_ALLOWED_COMPETITIONS env var to "*" (or "all"), or
//   • change TEST_ALLOWED_COMPETITION_IDS below to [] and redeploy.
// The env var (comma-separated competition ids) overrides the constant.
const TEST_ALLOWED_COMPETITION_IDS = ['8efc92dc-caaf-4014-be41-6f4470c97675'] // Host Message Test

function allowedCompetitionIds(): string[] {
  const env = Deno.env.get('CONTESTANT_PROMOTED_ALLOWED_COMPETITIONS')
  if (typeof env === 'string' && env.trim() !== '') {
    const v = env.trim()
    if (v === '*' || v.toLowerCase() === 'all') return [] // explicit: allow all
    return v.split(',').map(s => s.trim()).filter(Boolean)
  }
  return TEST_ALLOWED_COMPETITION_IDS
}

// Empty allow-list means "no restriction" (all competitions permitted).
function isCompetitionAllowed(compId: string | null | undefined): boolean {
  const allow = allowedCompetitionIds()
  if (allow.length === 0) return true
  return !!compId && allow.includes(compId)
}

interface PromotedRequest {
  contestant_id?: string
  competition_id?: string
  contestant_ids?: string[]
}

interface ContestantRow {
  id: string
  name: string | null
  email: string | null
  user_id: string | null
  status: string | null
  competition: {
    id: string
    name: string | null
    slug: string | null
    season: number | null
    city: { name: string | null } | null
    organization: { slug: string | null } | null
  } | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: PromotedRequest = await req.json()
    const { contestant_id, competition_id, contestant_ids } = body
    console.log('notify-contestant-promoted called:', JSON.stringify({
      contestant_id,
      competition_id,
      contestant_ids_count: Array.isArray(contestant_ids) ? contestant_ids.length : 0,
    }))

    if (!contestant_id && !competition_id) {
      return new Response(
        JSON.stringify({ error: 'contestant_id or competition_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Test gate: when called for a whole competition, bail early if it's not
    // on the allow-list. (contestant_id mode is gated per-row below, once we've
    // resolved which competition the contestant belongs to.)
    if (competition_id && !contestant_id && !isCompetitionAllowed(competition_id)) {
      console.log(`Competition ${competition_id} not on the allow-list — skipping`)
      return new Response(
        JSON.stringify({ success: true, total: 0, sent: 0, failed: 0, skipped: 0, gated: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Resolve which contestants to notify. In every mode we pull the joined
    // competition so the email is branded with the competition they joined.
    let query = supabase
      .from('contestants')
      .select('id, name, email, user_id, status, competition:competitions(id, name, slug, season, city:cities(name), organization:organizations(slug))')

    if (contestant_id) {
      query = query.eq('id', contestant_id)
    } else {
      query = query.eq('competition_id', competition_id!).eq('status', 'active')
      if (Array.isArray(contestant_ids) && contestant_ids.length > 0) {
        query = query.in('id', contestant_ids)
      }
    }

    const { data: contestants, error: fetchError } = await query.returns<ContestantRow[]>()

    if (fetchError) {
      console.error('Failed to fetch contestants:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch contestants', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!contestants || contestants.length === 0) {
      return new Response(
        JSON.stringify({ success: true, total: 0, sent: 0, failed: 0, skipped: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let sent = 0
    let failed = 0
    let skipped = 0

    for (const contestant of contestants) {
      // Can't email someone with no address on file.
      if (!contestant.email) {
        console.log(`Skipping contestant ${contestant.id} — no email on file`)
        skipped++
        continue
      }

      const competition = contestant.competition

      // Test gate: only email contestants whose competition is on the allow-list.
      if (!isCompetitionAllowed(competition?.id)) {
        console.log(`Skipping contestant ${contestant.id} — competition ${competition?.id} not on the allow-list`)
        skipped++
        continue
      }

      const competitionName = competition?.name || 'Most Eligible'
      const cityName = competition?.city?.name || ''

      // Public competition pages live at /:orgSlug/:competitionSlug (a bare
      // /c/:id is NOT a real route). A promoted contestant with a linked
      // account gets their profile page as the CTA — that resolves regardless
      // of the competition's publish status; others fall back to the
      // competition page.
      const orgSlug = competition?.organization?.slug || 'most-eligible'
      const competitionUrl = competition?.slug
        ? `${appUrl}/${orgSlug}/${competition.slug}`
        : appUrl
      const profileUrl = contestant.user_id
        ? `${appUrl}/profile/${contestant.user_id}`
        : competitionUrl

      // Branded email — the send-onesignal-email function records this in
      // email_logs (keyed by competition_id) for the host's Email Activity tab.
      const emailBody = {
        type: 'contestant_promoted',
        to_email: contestant.email,
        to_name: contestant.name || 'Contestant',
        contestant_name: contestant.name || undefined,
        competition_name: competitionName,
        competition_id: competition?.id,
        city_name: cityName,
        competition_url: competitionUrl,
        profile_url: profileUrl,
      }

      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(emailBody),
        })

        if (emailRes.ok) {
          sent++
        } else {
          const errResult = await emailRes.json().catch(() => ({}))
          console.warn(`Email failed for contestant ${contestant.id}:`, JSON.stringify(errResult))
          failed++
        }
      } catch (emailErr) {
        console.warn(`Email error for contestant ${contestant.id} (non-blocking):`, emailErr)
        failed++
      }

      // Push notification for contestants with a linked account (fire-and-forget).
      if (contestant.user_id) {
        fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: contestant.user_id,
            type: 'nomination_approved',
            title: "You're officially in!",
            body: `You're now a contestant in ${competitionName}. Tap to view your profile.`,
            url: `/profile/${contestant.user_id}`,
            competition_name: competitionName,
            competition_id: competition?.id,
            data: { contestant_id: contestant.id, competition_id: competition?.id },
          }),
        }).catch(err => console.warn('Push notification error (non-blocking):', err))
      }
    }

    console.log('notify-contestant-promoted done:', JSON.stringify({
      total: contestants.length,
      sent,
      failed,
      skipped,
    }))

    return new Response(
      JSON.stringify({ success: true, total: contestants.length, sent, failed, skipped }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in notify-contestant-promoted:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
