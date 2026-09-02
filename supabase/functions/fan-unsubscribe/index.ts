import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * fan-unsubscribe — One-click unsubscribe endpoint for the weekly fan digest.
 *
 * GET /fan-unsubscribe?token=<fan_id>.<hmac_hex>[&action=resubscribe]
 *
 * The token is an HMAC-SHA256(fan_id) signature. Verifying the signature
 * authenticates the request without requiring the user to log in, which is
 * the whole point of a one-click email unsubscribe.
 *
 * Updates contestant_fans.email_weekly_updates for the identified row and
 * returns a branded HTML confirmation page with a one-click resubscribe link.
 *
 * Required Supabase secrets:
 *   SUPABASE_URL                  — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY     — Service role key (needed to update rows
 *                                   without a user JWT)
 *   FAN_UNSUBSCRIBE_SECRET        — HMAC secret, must match the secret used
 *                                   by send-onesignal-email when generating
 *                                   the unsubscribe link
 *   APP_URL                       — e.g. https://eliterank.co
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function verifyToken(token: string | null, secret: string): Promise<string | null> {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return null
  const fanId = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = await hmacHex(fanId, secret)
  return constantTimeEqual(sig, expected) ? fanId : null
}

function htmlResponse(body: string, status = 200): Response {
  // Encode the body explicitly as UTF-8 bytes so the response has a
  // deterministic Content-Length and the browser has no reason to sniff
  // as anything other than the declared text/html; charset=utf-8.
  const bytes = new TextEncoder().encode(body)
  const headers = new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
  headers.set('Content-Type', 'text/html; charset=utf-8')
  return new Response(bytes, { status, headers })
}

function renderPage(args: {
  appUrl: string
  title: string
  heading: string
  message: string
  ctaLabel?: string
  ctaUrl?: string
}): string {
  const { appUrl, title, heading, message, ctaLabel, ctaUrl } = args
  const cta = ctaLabel && ctaUrl
    ? `<div style="text-align:center;margin:24px 0;">
         <a href="${ctaUrl}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#d4a843,#f4d03f);color:#000;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;">${ctaLabel}</a>
       </div>`
    : ''
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} &mdash; EliteRank</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:16px;">
    <div style="text-align:center;padding:32px 0 16px;">
      <span style="font-size:12px;letter-spacing:0.3em;color:#999;">ELITERANK</span>
    </div>
    <div style="text-align:center;padding:24px;">
      <h1 style="color:#d4a843;font-size:26px;margin:0 0 12px;">${heading}</h1>
      <p style="color:#ccc;font-size:15px;line-height:1.5;margin:0 0 16px;">${message}</p>
      ${cta}
    </div>
    <div style="text-align:center;padding:24px 0;border-top:1px solid #333;margin-top:32px;">
      <a href="${appUrl}" style="color:#d4a843;font-size:12px;text-decoration:none;">eliterank.co</a>
    </div>
  </div>
</body>
</html>`
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'
  const secret = Deno.env.get('FAN_UNSUBSCRIBE_SECRET')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!secret || !supabaseUrl || !serviceKey) {
    console.error('fan-unsubscribe: missing env vars')
    return htmlResponse(renderPage({
      appUrl,
      title: 'Error',
      heading: 'Something went wrong',
      message: 'We could not process this unsubscribe link right now. Please try again later.',
    }), 503)
  }

  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const resubscribe = url.searchParams.get('action') === 'resubscribe'

  const fanId = await verifyToken(token, secret)
  if (!fanId) {
    return htmlResponse(renderPage({
      appUrl,
      title: 'Invalid link',
      heading: 'Link expired or invalid',
      message: 'This unsubscribe link could not be verified. You can manage your email preferences after logging in.',
      ctaLabel: 'Go to EliteRank',
      ctaUrl: appUrl,
    }), 400)
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Fetch the fan row + contestant name for the confirmation page
  const { data: fanRow, error: fetchErr } = await supabase
    .from('contestant_fans')
    .select('id, contestant:contestants(name)')
    .eq('id', fanId)
    .maybeSingle()

  if (fetchErr || !fanRow) {
    return htmlResponse(renderPage({
      appUrl,
      title: 'Not found',
      heading: 'Subscription not found',
      message: 'We could not find this fan subscription. It may have already been removed.',
      ctaLabel: 'Go to EliteRank',
      ctaUrl: appUrl,
    }), 404)
  }

  const contestant = Array.isArray(fanRow.contestant)
    ? fanRow.contestant[0]
    : fanRow.contestant
  const contestantName = contestant?.name || 'this contestant'

  const { error: updateErr } = await supabase
    .from('contestant_fans')
    .update({ email_weekly_updates: resubscribe })
    .eq('id', fanId)

  if (updateErr) {
    console.error('fan-unsubscribe: update failed', updateErr)
    return htmlResponse(renderPage({
      appUrl,
      title: 'Error',
      heading: 'Something went wrong',
      message: 'We could not update your preferences right now. Please try again later.',
      ctaLabel: 'Go to EliteRank',
      ctaUrl: appUrl,
    }), 500)
  }

  const functionUrl = `${supabaseUrl}/functions/v1/fan-unsubscribe?token=${encodeURIComponent(token!)}`

  if (resubscribe) {
    return htmlResponse(renderPage({
      appUrl,
      title: 'Resubscribed',
      heading: "You're back in",
      message: `You'll start receiving weekly competition updates for ${contestantName} again.`,
      ctaLabel: 'Go to EliteRank',
      ctaUrl: appUrl,
    }))
  }

  return htmlResponse(renderPage({
    appUrl,
    title: 'Unsubscribed',
    heading: "You've been unsubscribed",
    message: `You will no longer receive weekly competition updates for <strong style="color:#fff;">${contestantName}</strong>. You&rsquo;re still a fan &mdash; this only turned off the email digest. Changed your mind?`,
    ctaLabel: 'Resubscribe',
    ctaUrl: `${functionUrl}&action=resubscribe`,
  }))
})
