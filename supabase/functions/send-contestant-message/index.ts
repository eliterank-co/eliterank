import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * send-contestant-message
 *
 * Lets a competition's host (or co-host / super-admin) send a direct message to
 * one, several, or all of their contestants. Each recipient gets:
 *   - an in-app notification (bell) — only contestants with a linked account
 *   - an email previewing the message (via send-onesignal-email `host_message`)
 *   - a push notification (fire-and-forget) — only contestants with an account
 *
 * Only the host controls who is messaged; the caller is authorized against the
 * competition before anything is sent.
 *
 * Body: {
 *   competition_id: string,
 *   subject: string,
 *   message: string,
 *   contestant_ids?: string[],   // omit/empty → every contestant in the competition
 * }
 * Returns: { success: true, total, sent: { in_app, email, push }, skipped } | { error }
 */

interface MessageRequest {
  competition_id?: string
  subject?: string
  message?: string
  contestant_ids?: string[]
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: MessageRequest = await req.json()
    const competitionId = body.competition_id
    const subject = (body.subject || '').trim()
    const message = (body.message || '').trim()
    const contestantIds = Array.isArray(body.contestant_ids)
      ? body.contestant_ids.filter((id) => typeof id === 'string' && id)
      : []

    if (!competitionId || !subject || !message) {
      return new Response(
        JSON.stringify({ error: 'competition_id, subject, and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cap lengths so a runaway payload can't be blasted out as an email/notification.
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
    let callerProfile: { first_name: string | null; last_name: string | null; is_super_admin: boolean | null } | null = null
    if (!authorized) {
      const { data: cohost } = await supabase
        .from('competition_co_hosts')
        .select('user_id')
        .eq('competition_id', competitionId)
        .eq('user_id', callerId)
        .maybeSingle()
      authorized = !!cohost
    }
    // Fetch the caller's profile (for authorization fallback + sender name).
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('first_name, last_name, is_super_admin')
      .eq('id', callerId)
      .maybeSingle()
    callerProfile = profileRow || null
    if (!authorized) {
      authorized = callerProfile?.is_super_admin === true
    }
    if (!authorized) {
      return new Response(
        JSON.stringify({ error: 'Only the host of this competition can message contestants.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hostName =
      `${callerProfile?.first_name || ''} ${callerProfile?.last_name || ''}`.trim() ||
      competition.name ||
      'Your host'
    const competitionName = competition.name || 'the competition'
    const competitionUrl = `${appUrl}/c/${competition.id}`

    // Resolve the target contestants (with account email fallback via profiles).
    let query = supabase
      .from('contestants')
      .select('id, name, email, user_id, profile:profiles!user_id(email)')
      .eq('competition_id', competitionId)
    if (contestantIds.length > 0) {
      query = query.in('id', contestantIds)
    }
    const { data: contestants, error: contestantsError } = await query

    if (contestantsError) {
      console.error('Failed to load contestants:', contestantsError)
      return new Response(
        JSON.stringify({ error: 'Failed to load contestants' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!contestants || contestants.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No matching contestants to message' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. In-app notifications — one row per contestant that has an account.
    const notificationRows = contestants
      .filter((c) => c.user_id)
      .map((c) => ({
        user_id: c.user_id,
        type: 'host_message',
        title: subject,
        body: message,
        competition_id: competition.id,
        contestant_id: c.id,
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

    // 2. Email previews — one per contestant with a resolvable email address.
    const emailTargets = contestants
      .map((c) => {
        const anyC = c as unknown as { email?: string | null; profile?: { email?: string | null } | null; name: string }
        const email = anyC.email || anyC.profile?.email || null
        return email ? { email, name: c.name } : null
      })
      .filter((t): t is { email: string; name: string } => !!t)

    const emailResults = await Promise.allSettled(
      emailTargets.map((t) =>
        fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            type: 'host_message',
            to_email: t.email,
            to_name: t.name,
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

    // 3. Push notifications — fire-and-forget for contestants with an account.
    let pushAttempted = 0
    for (const c of contestants) {
      if (!c.user_id) continue
      pushAttempted++
      fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          user_id: c.user_id,
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

    return new Response(
      JSON.stringify({
        success: true,
        total: contestants.length,
        sent: { in_app: inAppSent, email: emailSent, push: pushAttempted },
        skipped: contestants.length - emailTargets.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('send-contestant-message error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
