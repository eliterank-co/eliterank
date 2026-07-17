import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * send-host-broadcast
 *
 * Lets a competition's host (or co-host / super-admin) send ONE message to a
 * whole audience — all contestants, all nominees, or everyone. Each reachable
 * recipient gets:
 *   - an in-app notification (bell) — recipients with a linked account
 *   - an email previewing the message (send-onesignal-email `host_message`)
 *   - a push notification (fire-and-forget) — recipients with an account
 *
 * Anti-spam: at most one broadcast per competition per 7 days. Every send is
 * recorded in host_messages; the limit is checked against that ledger, so it
 * cannot be bypassed from the client.
 *
 * Body: {
 *   competition_id: string,
 *   audience: 'contestants' | 'nominees' | 'everyone',
 *   subject: string,
 *   message: string,
 * }
 * Returns (200):
 *   { success: true, audience, total, sent: { in_app, email, push }, next_allowed_at }
 *   { success: false, rate_limited: true, next_allowed_at, error }   // weekly limit hit
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const VALID_AUDIENCES = ['contestants', 'nominees', 'everyone'] as const
type Audience = (typeof VALID_AUDIENCES)[number]

interface Recipient {
  name: string
  email: string | null
  userId: string | null
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const competitionId: string | undefined = body.competition_id
    const audience: Audience = body.audience
    const subject = (body.subject || '').trim()
    const message = (body.message || '').trim()

    if (!competitionId || !subject || !message || !VALID_AUDIENCES.includes(audience)) {
      return new Response(
        JSON.stringify({ error: 'competition_id, audience (contestants|nominees|everyone), subject, and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cap lengths so a runaway payload can't be blasted out.
    if (subject.length > 150 || message.length > 2000) {
      return new Response(
        JSON.stringify({ error: 'Subject must be ≤150 and message ≤2000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

    // Identify the caller from the JWT. Refuse anonymous callers.
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace(/^Bearer\s+/i, '')
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Invalid session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const callerId = userData.user.id

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Fetch the competition + verify it exists.
    const { data: competition, error: compError } = await supabase
      .from('competitions')
      .select('id, name, host_id')
      .eq('id', competitionId)
      .single()

    if (compError || !competition) {
      return new Response(
        JSON.stringify({ error: 'Competition not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Authorize: caller must be the host, a co-host, or a super-admin.
    let authorized = competition.host_id === callerId
    if (!authorized) {
      const { data: cohost } = await supabase
        .from('competition_co_hosts')
        .select('user_id')
        .eq('competition_id', competitionId)
        .eq('user_id', callerId)
        .maybeSingle()
      authorized = !!cohost
    }
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('first_name, last_name, is_super_admin')
      .eq('id', callerId)
      .maybeSingle()
    if (!authorized) {
      authorized = callerProfile?.is_super_admin === true
    }
    if (!authorized) {
      return new Response(
        JSON.stringify({ error: 'Only the host of this competition can message its audience.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Weekly rate limit — refuse if this competition already broadcast in the
    // last 7 days. Checked against the ledger so it can't be bypassed.
    const cutoff = new Date(Date.now() - WEEK_MS).toISOString()
    const { data: recent } = await supabase
      .from('host_messages')
      .select('created_at')
      .eq('competition_id', competitionId)
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (recent) {
      const nextAllowedAt = new Date(new Date(recent.created_at).getTime() + WEEK_MS).toISOString()
      return new Response(
        JSON.stringify({
          success: false,
          rate_limited: true,
          next_allowed_at: nextAllowedAt,
          error: 'You can only message your audience once per week.',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hostName =
      `${callerProfile?.first_name || ''} ${callerProfile?.last_name || ''}`.trim() ||
      competition.name ||
      'Your host'
    const competitionName = competition.name || 'the competition'
    const competitionUrl = `${appUrl}/c/${competition.id}`

    // -- Resolve the audience into a de-duplicated recipient list -------------
    const recipients: Recipient[] = []

    if (audience === 'contestants' || audience === 'everyone') {
      const { data: contestants, error: cErr } = await supabase
        .from('contestants')
        .select('name, email, user_id, profile:profiles!user_id(email)')
        .eq('competition_id', competitionId)
      if (cErr) {
        console.error('Failed to load contestants:', cErr)
      } else {
        for (const c of contestants || []) {
          const anyC = c as unknown as { name: string; email?: string | null; user_id?: string | null; profile?: { email?: string | null } | null }
          recipients.push({
            name: anyC.name,
            email: anyC.email || anyC.profile?.email || null,
            userId: anyC.user_id || null,
          })
        }
      }
    }

    if (audience === 'nominees' || audience === 'everyone') {
      // Only nominees still in play — skip declined/rejected and any already
      // converted into a contestant (they're covered by the contestant list).
      const { data: nominees, error: nErr } = await supabase
        .from('nominees')
        .select('name, email, user_id, status, converted_to_contestant_id')
        .eq('competition_id', competitionId)
      if (nErr) {
        console.error('Failed to load nominees:', nErr)
      } else {
        const active = (nominees || []).filter((n) => {
          const anyN = n as unknown as { status?: string | null; converted_to_contestant_id?: string | null }
          const status = (anyN.status || '').toLowerCase()
          if (anyN.converted_to_contestant_id) return false
          if (status === 'declined' || status === 'rejected') return false
          return true
        })

        // Resolve accounts for nominees that have an email but no linked user_id,
        // in a single query, so nominees can also receive in-app notifications.
        const emailsNeedingLookup = active
          .map((n) => (n as unknown as { user_id?: string | null; email?: string | null }))
          .filter((n) => !n.user_id && n.email)
          .map((n) => n.email!.toLowerCase())
        const profileByEmail = new Map<string, string>()
        if (emailsNeedingLookup.length > 0) {
          const orFilter = emailsNeedingLookup.map((e) => `email.ilike.${e}`).join(',')
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, email')
            .or(orFilter)
          for (const p of profiles || []) {
            if (p.email) profileByEmail.set(p.email.toLowerCase(), p.id)
          }
        }

        for (const n of active) {
          const anyN = n as unknown as { name: string; email?: string | null; user_id?: string | null }
          const email = anyN.email || null
          const userId = anyN.user_id || (email ? profileByEmail.get(email.toLowerCase()) || null : null)
          recipients.push({ name: anyN.name, email, userId })
        }
      }
    }

    // De-dupe across audiences by account id first, then email.
    const seen = new Set<string>()
    const uniqueRecipients = recipients.filter((r) => {
      const key = r.userId || (r.email ? `email:${r.email.toLowerCase()}` : null)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })

    if (uniqueRecipients.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No reachable recipients for this audience' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. In-app notifications — one row per recipient with an account.
    const notificationRows = uniqueRecipients
      .filter((r) => r.userId)
      .map((r) => ({
        user_id: r.userId,
        type: 'host_message',
        title: subject,
        body: message,
        competition_id: competition.id,
        action_url: `/c/${competition.id}`,
        metadata: { host_name: hostName },
      }))

    let inAppSent = 0
    if (notificationRows.length > 0) {
      const { error: notifError } = await supabase.from('notifications').insert(notificationRows)
      if (notifError) {
        console.error('Failed to insert host_message notifications:', notifError)
      } else {
        inAppSent = notificationRows.length
      }
    }

    // 2. Email previews — one per recipient with an email address.
    const emailTargets = uniqueRecipients.filter((r) => r.email) as (Recipient & { email: string })[]
    const emailResults = await Promise.allSettled(
      emailTargets.map((r) =>
        fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            type: 'host_message',
            to_email: r.email,
            to_name: r.name,
            competition_id: competition.id,
            competition_name: competitionName,
            competition_url: competitionUrl,
            host_name: hostName,
            subject,
            message,
          }),
        }).then(async (res) => {
          if (!res.ok) {
            const detail = await res.text().catch(() => '')
            throw new Error(`email ${res.status}: ${detail}`)
          }
          return true
        })
      )
    )
    const emailSent = emailResults.filter((r) => r.status === 'fulfilled').length
    emailResults.forEach((r) => {
      if (r.status === 'rejected') console.warn('host_message email failed:', r.reason)
    })

    // 3. Push notifications — fire-and-forget for recipients with an account.
    let pushAttempted = 0
    for (const r of uniqueRecipients) {
      if (!r.userId) continue
      pushAttempted++
      fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          user_id: r.userId,
          type: 'generic',
          title: subject,
          body: message,
          url: `/c/${competition.id}`,
          competition_id: competition.id,
          competition_name: competitionName,
          data: { competition_id: competition.id, type: 'host_message' },
        }),
      }).catch((err) => console.warn('host_message push error (non-blocking):', err))
    }

    // Record the broadcast — this is what the weekly limit is enforced against.
    const sentAt = new Date()
    const { error: ledgerError } = await supabase.from('host_messages').insert({
      competition_id: competition.id,
      sender_id: callerId,
      audience,
      subject,
      body: message,
      recipient_count: uniqueRecipients.length,
      created_at: sentAt.toISOString(),
    })
    if (ledgerError) {
      // The message already went out; log but don't fail the response.
      console.error('Failed to record host_messages ledger row:', ledgerError)
    }

    const nextAllowedAt = new Date(sentAt.getTime() + WEEK_MS).toISOString()

    return new Response(
      JSON.stringify({
        success: true,
        audience,
        total: uniqueRecipients.length,
        sent: { in_app: inAppSent, email: emailSent, push: pushAttempted },
        next_allowed_at: nextAllowedAt,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('send-host-broadcast error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
