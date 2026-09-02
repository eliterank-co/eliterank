import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Escape relationship-derived values before interpolating them into HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * send-photobooth-photo — Sends Lucky Disco photo booth strip via OneSignal email.
 *
 * Required Supabase secrets:
 *   ONESIGNAL_APP_ID     — OneSignal App ID
 *   ONESIGNAL_API_KEY    — OneSignal REST API Key
 */

export interface PhotoBoothEmailRequest {
  to_email: string
  photo_urls: string[]  // Array of individual branded photo URLs
  photo_url?: string    // Legacy single URL (backwards compat)
  nominee_name?: string
}

export function buildPhotoEmail(photoUrls: string[], nomineeName?: string): { subject: string; body: string } {
  const subject = nomineeName
    ? `Your St. Patrick's Day photos with ${nomineeName} 🍀 Lucky Disco × Most Eligible`
    : `Your St. Patrick's Day photos 🍀 Lucky Disco × Most Eligible`

  const photosHtml = photoUrls.map((url, i) => `
    <div style="margin:0 auto 16px;text-align:center;">
      <img src="${escapeHtml(url)}" alt="Photo ${i + 1}" width="600" style="width:100%;height:auto;border-radius:8px;display:block;margin:0 auto;" />
    </div>
  `).join('')

  const body = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <meta name="color-scheme" content="dark">
      <meta name="supported-color-schemes" content="dark">
    </head>
    <body style="margin:0;padding:0;background-color:#060a06;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#060a06" style="background-color:#060a06;">
        <tr><td align="center" style="padding:0;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#060a06" style="width:100%;max-width:600px;background-color:#060a06;">
            <tr><td bgcolor="#060a06" style="padding:16px;background-color:#060a06;font-family:Arial,Helvetica,sans-serif;">
        <div style="text-align:center;padding:32px 0 16px;">
          <span style="font-size:14px;letter-spacing:0.3em;color:#00ff6a;font-weight:bold;">LUCKY DISCO × MOST ELIGIBLE</span>
        </div>
        <div style="text-align:center;">
          <h1 style="color:#fff;font-size:24px;margin:0 0 8px;">Your Photos 🍀</h1>
          <p style="color:rgba(255,255,255,.6);font-size:14px;margin:0 0 24px;">
            ${nomineeName ? `Featuring ${escapeHtml(nomineeName)} — ` : ''}Thanks for stopping by the photo booth!
          </p>
          <p style="color:rgba(255,255,255,.4);font-size:12px;margin:0 0 16px;">
            Long press each photo to save it to your camera roll
          </p>
          ${photosHtml}
          <div style="text-align:center;margin:24px 0;">
            <a href="https://www.instagram.com/mosteligiblechi/" style="display:inline-block;padding:14px 32px;background:#00ff6a;color:#060a06;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;">
              Follow @mosteligiblechi
            </a>
          </div>
        </div>
        <div style="text-align:center;padding:24px 0;border-top:1px solid rgba(0,255,106,.15);margin-top:32px;">
          <a href="https://eliterank.co" style="color:#00ff6a;font-size:12px;text-decoration:none;">eliterank.co</a>
          <p style="color:rgba(255,255,255,.3);font-size:11px;margin-top:8px;">
            You're receiving this because you used the photo booth at Lucky Disco × Most Eligible — St. Patrick's Day 2026.
          </p>
        </div>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `

  return { subject, body }
}

/**
 * Ensure the email address has a OneSignal subscription and return its
 * subscription ID. Creates the user+subscription if it doesn't exist.
 */
async function ensureEmailSubscription(
  appId: string,
  apiKey: string,
  email: string,
): Promise<{ subscriptionId: string | null; error?: string }> {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Key ${apiKey}`,
  }

  // 1. Try to look up existing user by external_id (we use email as external_id)
  try {
    const lookupRes = await fetch(
      `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(email)}`,
      { headers },
    )

    if (lookupRes.ok) {
      const userData = await lookupRes.json()
      const emailSub = userData?.subscriptions?.find(
        (s: { type?: string; token?: string }) =>
          s.type === 'Email' && s.token?.toLowerCase() === email.toLowerCase()
      )
      if (emailSub?.id) {
        console.log('Found existing OneSignal subscription:', emailSub.id)
        return { subscriptionId: emailSub.id }
      }
    }
  } catch (lookupErr) {
    console.warn('OneSignal user lookup failed:', lookupErr)
  }

  // 2. Create user with email subscription
  const createPayload = {
    properties: {
      tags: { source: 'photobooth' },
    },
    identity: {
      external_id: email,
    },
    subscriptions: [{
      type: 'Email',
      token: email,
      enabled: true,
    }],
  }

  try {
    const createRes = await fetch(`https://api.onesignal.com/apps/${appId}/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify(createPayload),
    })

    const createResult = await createRes.json()

    const emailSub = createResult?.subscriptions?.find(
      (s: { type?: string; token?: string }) =>
        s.type === 'Email' && s.token?.toLowerCase() === email.toLowerCase()
    )

    if (emailSub?.id) {
      return { subscriptionId: emailSub.id }
    }

    // If 409 conflict, retry lookup
    if (createRes.status === 409) {
      const retryLookup = await fetch(
        `https://api.onesignal.com/apps/${appId}/users/by/external_id/${encodeURIComponent(email)}`,
        { headers },
      )
      if (retryLookup.ok) {
        const retryData = await retryLookup.json()
        const retrySub = retryData?.subscriptions?.find(
          (s: { type?: string; token?: string }) =>
            s.type === 'Email' && s.token?.toLowerCase() === email.toLowerCase()
        )
        if (retrySub?.id) {
          return { subscriptionId: retrySub.id }
        }
      }
    }

    return { subscriptionId: null, error: `No subscription ID in response` }
  } catch (createErr) {
    return { subscriptionId: null, error: String(createErr) }
  }
}

if (Deno.env.get('DENO_TESTING') !== '1') {
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const appId = Deno.env.get('ONESIGNAL_APP_ID')
    const apiKey = Deno.env.get('ONESIGNAL_API_KEY')

    if (!appId || !apiKey) {
      return new Response(
        JSON.stringify({ error: 'Email service not configured' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: PhotoBoothEmailRequest = await req.json()
    console.log('send-photobooth-photo called:', JSON.stringify({ to_email: body.to_email, photo_url: body.photo_url }))

    // Support both photo_urls array and legacy photo_url string
    const photoUrls = body.photo_urls || (body.photo_url ? [body.photo_url] : [])

    if (!body.to_email || photoUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'to_email and photo_urls are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { subject, body: htmlBody } = buildPhotoEmail(photoUrls, body.nominee_name)

    const { subscriptionId, error: subError } = await ensureEmailSubscription(appId, apiKey, body.to_email)

    const oneSignalPayload: Record<string, unknown> = {
      app_id: appId,
      email_subject: subject,
      email_body: htmlBody,
      email_from_name: 'Most Eligible',
      // From the authenticated sending subdomain (mail.eliterank.co) so the
      // From domain matches DKIM — exact DMARC alignment, no "via" in Gmail.
      // Replies route to info@eliterank.co via the OneSignal sender's Reply-To.
      email_from_address: 'info@mail.eliterank.co',
    }

    if (subscriptionId) {
      oneSignalPayload.include_subscription_ids = [subscriptionId]
    } else {
      console.warn('No subscription ID, falling back to email_tokens. Error:', subError)
      oneSignalPayload.include_email_tokens = [body.to_email]
    }

    const osResponse = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey}`,
      },
      body: JSON.stringify(oneSignalPayload),
    })

    const osResult = await osResponse.json()
    console.log('OneSignal response:', JSON.stringify({ status: osResponse.status, id: osResult?.id, recipients: osResult?.recipients }))

    if (!osResponse.ok || osResult?.recipients === 0) {
      // Retry with email_token fallback
      if (subscriptionId) {
        const fallbackPayload = { ...oneSignalPayload, include_email_tokens: [body.to_email] }
        delete (fallbackPayload as Record<string, unknown>).include_subscription_ids

        const fallbackRes = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${apiKey}` },
          body: JSON.stringify(fallbackPayload),
        })
        const fallbackResult = await fallbackRes.json()

        if (fallbackRes.ok && fallbackResult?.recipients > 0) {
          return new Response(
            JSON.stringify({ success: true, onesignal_id: fallbackResult.id }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      return new Response(
        JSON.stringify({ error: 'Email delivery failed', details: osResult }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, onesignal_id: osResult.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in send-photobooth-photo:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
}
