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
 *   - a branded email previewing the message (sent directly via OneSignal here,
 *     so this feature never depends on the shared send-onesignal-email function)
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

/** Escape free text so it can never break the email markup or inject HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Branded host-message email — mirrors the dark/gold EliteRank email style. */
function buildHostEmail(params: {
  appUrl: string
  toName: string
  subject: string
  message: string
  hostName: string
  competitionName: string
  competitionUrl: string
}): string {
  const { appUrl, toName, subject, message, hostName, competitionName, competitionUrl } = params
  const messageHtml = escapeHtml(message).replace(/\r?\n/g, '<br>')
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="color-scheme" content="dark">
      <meta name="supported-color-schemes" content="dark">
    </head>
    <body style="margin:0;padding:0;background-color:#0a0a0a;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a" style="background-color:#0a0a0a;">
        <tr><td align="center" style="padding:0;">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a" style="width:100%;max-width:480px;background-color:#0a0a0a;">
            <tr><td bgcolor="#0a0a0a" style="padding:16px;background-color:#0a0a0a;font-family:Arial,Helvetica,sans-serif;">
        <div style="text-align:center;padding:32px 0 16px;">
          <span style="font-size:12px;letter-spacing:0.3em;color:#999;font-family:Arial,sans-serif;">ELITERANK</span>
        </div>
        <div>
          <p style="color:#999;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 4px;text-align:center;">Message from your host</p>
          <h1 style="color:#d4a843;font-size:24px;margin:0 0 8px;text-align:center;">${escapeHtml(subject)}</h1>
          ${competitionName ? `<p style="color:#fff;font-size:15px;font-weight:bold;margin:0 0 16px;text-align:center;">${escapeHtml(competitionName)}</p>` : ''}
          ${toName ? `<p style="color:#ccc;font-size:15px;margin:0 0 12px;">Hi ${escapeHtml(toName)},</p>` : ''}
          <div style="background:#1a1a1a;border-left:3px solid #d4a843;padding:16px 18px;margin:12px 0 8px;border-radius:4px;">
            <p style="color:#eee;font-size:15px;line-height:1.6;margin:0;">${messageHtml}</p>
          </div>
          <p style="color:#999;font-size:13px;margin:16px 0 0;">— Competition Host</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${appUrl}/notifications" style="display:inline-block;padding:14px 32px;background-color:#d4a843;background:linear-gradient(135deg,#d4a843,#f4d03f);color:#000;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;font-family:Arial,sans-serif;">See all notifications</a>
          </div>
          <p style="color:#666;font-size:12px;text-align:center;margin:0;">You're receiving this because you're part of ${escapeHtml(competitionName || 'this competition')}.</p>
        </div>
        <div style="text-align:center;padding:24px 0;border-top:1px solid #333;margin-top:32px;">
          <a href="${appUrl}" style="color:#d4a843;font-size:12px;text-decoration:none;font-family:Arial,sans-serif;">eliterank.co</a>
        </div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `
}

/**
 * Ensure the email address has a OneSignal subscription and return its
 * subscription ID (creating the user+subscription if needed). Targeting by
 * subscription ID is reliable; include_email_tokens silently fails for unknown
 * emails. Copied from send-onesignal-email so host emails deliver the same way.
 */
async function ensureEmailSubscription(appId: string, apiKey: string, email: string): Promise<string | null> {
  const headers = { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` }
  try {
    const lookupRes = await fetch(
      `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(email)}`,
      { headers },
    )
    if (lookupRes.ok) {
      const userData = await lookupRes.json()
      const sub = userData?.subscriptions?.find(
        (s: { type?: string; token?: string }) => s.type === 'Email' && s.token?.toLowerCase() === email.toLowerCase(),
      )
      if (sub?.id) return sub.id
    }
  } catch (err) {
    console.warn('OneSignal lookup failed:', err)
  }

  const createPayload = {
    properties: { tags: { source: 'eliterank' } },
    identity: { external_id: email },
    subscriptions: [{ type: 'Email', token: email, enabled: true }],
  }
  try {
    const createRes = await fetch(`https://api.onesignal.com/apps/${appId}/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createPayload),
    })
    const createResult = await createRes.json()
    const sub = createResult?.subscriptions?.find(
      (s: { type?: string; token?: string }) => s.type === 'Email' && s.token?.toLowerCase() === email.toLowerCase(),
    )
    if (sub?.id) return sub.id
    if (createRes.status === 409) {
      const retry = await fetch(
        `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(email)}`,
        { headers },
      )
      if (retry.ok) {
        const retryData = await retry.json()
        const retrySub = retryData?.subscriptions?.find(
          (s: { type?: string; token?: string }) => s.type === 'Email' && s.token?.toLowerCase() === email.toLowerCase(),
        )
        if (retrySub?.id) return retrySub.id
      }
    }
  } catch (err) {
    console.warn('OneSignal user create failed:', err)
  }
  return null
}

/** Send one host-message email via OneSignal. Returns true on a delivered send. */
async function sendHostEmail(params: {
  appId: string
  apiKey: string
  fromName: string
  subject: string
  html: string
  toEmail: string
}): Promise<boolean> {
  const { appId, apiKey, fromName, subject, html, toEmail } = params
  const subscriptionId = await ensureEmailSubscription(appId, apiKey, toEmail)
  const payload: Record<string, unknown> = {
    app_id: appId,
    email_subject: subject,
    email_body: html,
    email_from_name: fromName,
    // From the authenticated sending subdomain (mail.eliterank.co) so the
    // From domain matches DKIM — exact DMARC alignment, no "via" in Gmail.
    // Replies route to info@eliterank.co via the OneSignal sender's Reply-To.
    email_from_address: 'info@mail.eliterank.co',
    disable_email_click_tracking: true,
  }
  if (subscriptionId) {
    payload.include_subscription_ids = [subscriptionId]
  } else {
    payload.include_email_tokens = [toEmail]
  }
  const res = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Key ${apiKey}` },
    body: JSON.stringify(payload),
  })
  const result = await res.json().catch(() => ({}))
  if (!res.ok || result?.recipients === 0) {
    console.warn('host_message email send failed:', JSON.stringify(result))
    return false
  }
  return true
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
        JSON.stringify({ error: 'Subject must be at most 150 and message at most 2000 characters' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'
    const oneSignalAppId = Deno.env.get('ONESIGNAL_APP_ID')
    const oneSignalApiKey = Deno.env.get('ONESIGNAL_API_KEY')
    const defaultBrand = Deno.env.get('DEFAULT_BRAND_NAME') || 'EliteRank'

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
      .select('id, name, host_id, slug, organization:organizations(slug)')
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
    // Public competition pages live at /:orgSlug/:slug (or /:orgSlug/id/:id).
    // A bare /c/:id is NOT a real route. Default the org slug to 'most-eligible'
    // and fall back to the id-based route when the slug is missing.
    const compForUrl = competition as unknown as { id: string; slug?: string | null; organization?: { slug?: string | null } | null }
    const orgSlug = compForUrl.organization?.slug || 'most-eligible'
    const competitionUrl = `${appUrl}/${orgSlug}/${compForUrl.slug || `id/${compForUrl.id}`}`
    const fromName = (competition.name || '').trim() || defaultBrand

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
        action_url: `/notifications`,
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

    // 2. Email previews — one per recipient with an email address, sent directly
    //    through OneSignal (no dependency on the shared email function).
    const emailTargets = uniqueRecipients.filter((r) => r.email) as (Recipient & { email: string })[]
    let emailSent = 0
    if (oneSignalAppId && oneSignalApiKey && emailTargets.length > 0) {
      const results = await Promise.allSettled(
        emailTargets.map((r) =>
          sendHostEmail({
            appId: oneSignalAppId,
            apiKey: oneSignalApiKey,
            fromName,
            subject,
            html: buildHostEmail({
              appUrl,
              toName: r.name,
              subject,
              message,
              hostName,
              competitionName,
              competitionUrl,
            }),
            toEmail: r.email,
          })
        )
      )
      emailSent = results.filter((res) => res.status === 'fulfilled' && res.value === true).length

      // Best-effort deliverability log so host emails show in the Email Activity tab.
      const logRows = emailTargets.map((r) => ({
        competition_id: competition.id,
        email_type: 'host_message',
        to_email: r.email,
        to_name: r.name,
        status: 'sent',
        delivery_method: 'onesignal',
      }))
      supabase.from('email_logs').insert(logRows).then(({ error }) => {
        if (error) console.warn('email_logs insert failed (non-blocking):', error.message)
      })
    } else if (!oneSignalAppId || !oneSignalApiKey) {
      console.warn('OneSignal credentials missing — host_message emails not sent')
    }

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
          url: `/notifications`,
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
