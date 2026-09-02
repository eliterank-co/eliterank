import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
 * send-onesignal-email — Sends branded transactional emails via OneSignal.
 *
 * Supports multiple email types:
 *   - nominee_invite:       Branded "You've been nominated!" email to the nominee
 *   - nominee_reminder:     "Finish your profile" reminder for accepted but not onboarded nominees
 *   - nominator_confirm:    "Your nomination was submitted" confirmation to the nominator
 *   - nominee_accepted:     "Your nominee accepted!" notification to the nominator
 *   - nominee_declined:     "Your nominee declined" notification to the nominator
 *   - contestant_promoted:  "You're officially a contestant!" sent to a nominee
 *                          once the host approves them into the competition
 *   - fan_confirmation:     "You're now a fan of X" — sent when a user becomes a fan
 *   - fan_weekly_digest:    Weekly performance update sent to fans and to the contestant themselves
 *   - vote_receipt:         "Thanks for voting!" receipt for paid voters with current rank
 *   - nominations_open_subscriber: "Nominations are open!" blast to users who
 *                          subscribed on the competition's coming-soon page
 *   - subscriber_confirmation: "You're on the list" instant confirmation when
 *                          a user opts in on the coming-soon page
 *
 * The sender display name ("from" name) is the competition the recipient signed
 * up for (competition_name, or looked up from competition_id). Platform-level
 * emails with no competition context fall back to DEFAULT_BRAND_NAME (or
 * "EliteRank").
 *
 * Required Supabase secrets:
 *   ONESIGNAL_APP_ID     — OneSignal App ID
 *   ONESIGNAL_API_KEY    — OneSignal REST API Key
 *   APP_URL              — e.g. https://eliterank.co
 * Optional:
 *   DEFAULT_BRAND_NAME   — sender name for platform-level emails (default "EliteRank")
 */

export interface EmailRequest {
  type: 'nominee_invite' | 'nominee_reminder' | 'self_nominee_reminder' | 'nominator_confirm' | 'nominee_accepted' | 'nominee_declined' | 'account_ready' | 'contestant_promoted' | 'fan_confirmation' | 'fan_weekly_digest' | 'vote_receipt' | 'nominations_open_subscriber' | 'subscriber_confirmation' | 'judge_invite'
  to_email: string
  to_name?: string
  // When set, the send is recorded in email_logs so the host of this
  // competition can see deliverability in the dashboard's Email Activity tab.
  competition_id?: string
  nominee_name?: string
  nominator_name?: string
  competition_name?: string
  city_name?: string
  claim_url?: string
  competition_url?: string
  reason?: string
  gender?: string | null
  nomination_end?: string | null
  nomination_start?: string | null
  nominee_email?: string
  reset_password_url?: string
  contestant_name?: string
  profile_url?: string
  fan_id?: string
  subscriber_id?: string
  unsubscribe_url?: string
  // fan_weekly_digest fields
  rank?: number | null
  trend?: 'up' | 'down' | 'same' | null
  total_votes?: number | null
  voting_round_end?: string | null
  next_event_name?: string | null
  next_event_date?: string | null
  is_self?: boolean
  // vote_receipt fields
  vote_count?: number | null
  amount_paid?: number | null
  purchased_vote_count?: number | null
  was_doubled?: boolean
  signup_url?: string
  is_anonymous?: boolean
  // vote_receipt tax fields (compliant tax receipt — present only when tax was charged)
  currency?: string
  subtotal_amount?: number | null
  tax_amount?: number | null
  tax_rate_pct?: number | null
  tax_label?: string
  receipt_number?: string
  vendor_legal_name?: string
  vendor_tax_number?: string
  vendor_address?: string
}

/**
 * HMAC-SHA256 signed token for one-click unsubscribe links.
 * Format: `<fan_id>.<hex_signature>`. The matching verifier lives in the
 * fan-unsubscribe edge function — both must use FAN_UNSUBSCRIBE_SECRET.
 */
async function signFanToken(fanId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(fanId))
  const sigHex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${fanId}.${sigHex}`
}

// HTML email templates
export function getEmailContent(req: EmailRequest): { subject: string; body: string } {
  const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

  const header = `
    <div style="text-align:center;padding:32px 0 16px;">
      <span style="font-size:12px;letter-spacing:0.3em;color:#999;font-family:Arial,sans-serif;">ELITERANK</span>
    </div>
  `

  // Sender identification + postal address, on EVERY email type.
  //
  // This lives in the shared `footer` (which `wrapper()` applies to all 14
  // cases) rather than in individual templates on purpose. Before this change
  // the entity name and address appeared only in `subscriberLegalFooter`, which
  // exactly 2 of the 14 types called — so the two highest-volume types,
  // nominee_invite and the host broadcast, went out with no identification at
  // all. Per-template inclusion is the thing that failed; the choke point is
  // the fix. Keep it here.
  //
  // NOTE this provides identification and address only. It is NOT an
  // unsubscribe mechanism: opt-out is still limited to fans and subscribers,
  // who have real tokens (fan-unsubscribe / subscriber-unsubscribe). No opt-out
  // state exists for nominees or contestants, so no link is rendered for them —
  // a link that resolves to nothing is worse than none.
  const footer = `
    <div style="text-align:center;padding:24px 0;border-top:1px solid #333;margin-top:32px;">
      <a href="${escapeHtml(appUrl)}" style="color:#d4a843;font-size:12px;text-decoration:none;font-family:Arial,sans-serif;">eliterank.co</a>
      <p style="color:#999;font-size:11px;margin-top:8px;font-family:Arial,sans-serif;">
        You're receiving this because of activity on EliteRank.
      </p>
      <p style="color:#999;font-size:11px;margin:8px 0 0;font-family:Arial,sans-serif;line-height:1.5;">
        EliteRank &middot; 1 W Old State Cap Plz, Ste 805, Springfield, IL 62701
      </p>
    </div>
  `

  // background-color is a SOLID fallback for clients (Outlook) that ignore the
  // gradient — without it the button renders with no background at all.
  const goldButton = (text: string, url: string) => `
    <div style="text-align:center;margin:24px 0;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;background-color:#d4a843;background:linear-gradient(135deg,#d4a843,#f4d03f);color:#000;text-decoration:none;border-radius:8px;font-weight:bold;font-size:16px;font-family:Arial,sans-serif;">
        ${escapeHtml(text)}
      </a>
    </div>
  `

  // Compliance footer for emails sent to coming-soon-page subscribers.
  // CAN-SPAM (US), CASL (Canada), and ePrivacy (EU) all require unsubscribe
  // + sender identity + physical postal address on commercial-adjacent mail.
  // Unsubscribe only. The entity + postal address moved to the shared `footer`
  // above so every type carries them; repeating them here would print the
  // address twice on the two subscriber types.
  const subscriberLegalFooter = (unsubscribeUrl?: string) =>
    unsubscribeUrl
      ? `
    <div style="text-align:center;padding:16px 0 0;margin-top:24px;">
      <p style="color:#999;font-size:11px;margin:0;font-family:Arial,sans-serif;line-height:1.5;">
        You signed up for updates about this competition.
        <a href="${escapeHtml(unsubscribeUrl)}" style="color:#d4a843;text-decoration:underline;">Unsubscribe</a>.
      </p>
    </div>
  `
      : ''

  // The design is light text on a dark card. Clients (Outlook) and reply-quote
  // views strip a <body> background, which would leave light-gray text on white
  // and make it unreadable — so the dark background lives on a <table>/<td>
  // (bgcolor + style), which those clients DO honor, not just the body.
  const wrapper = (content: string) => `
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
        <tr>
          <td align="center" style="padding:0;">
            <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" bgcolor="#0a0a0a" style="width:100%;max-width:480px;background-color:#0a0a0a;">
              <tr>
                <td bgcolor="#0a0a0a" style="padding:16px;background-color:#0a0a0a;font-family:Arial,Helvetica,sans-serif;">
                  ${header}
                  ${content}
                  ${footer}
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `

  switch (req.type) {
    case 'nominee_invite': {
      const nominatorLine = req.nominator_name
        ? `<p style="color:#ccc;font-size:15px;">Nominated by <strong>${escapeHtml(req.nominator_name)}</strong></p>`
        : `<p style="color:#ccc;font-size:15px;">Someone thinks you are an Elite in ${escapeHtml(req.city_name || 'your city')}!</p>`

      const reasonLine = req.reason
        ? `<div style="background:#1a1a1a;border-left:3px solid #d4a843;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <p style="color:#999;font-size:12px;margin:0 0 4px;">Why you were nominated:</p>
            <p style="color:#eee;font-size:14px;margin:0;font-style:italic;">"${escapeHtml(req.reason)}"</p>
          </div>`
        : ''

      // Format deadline if available
      const deadlineLine = req.nomination_end
        ? (() => {
            const d = new Date(req.nomination_end)
            const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
            return `Accept your nomination by <strong>${formatted}</strong> to be considered.`
          })()
        : 'Accept your nomination to be considered.'

      return {
        subject: `You've been nominated${req.competition_name ? ` for ${req.competition_name}` : ''}!`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">You've Been Nominated!</h1>
            ${req.competition_name ? `<p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(req.competition_name)}</p>` : ''}
            ${nominatorLine}
            ${reasonLine}
            <p style="color:#999;font-size:14px;margin-top:16px;">
              ${deadlineLine}
            </p>
            ${goldButton('Accept Your Nomination', req.claim_url || appUrl)}
            <p style="color:#666;font-size:12px;">
              Not interested? Simply ignore this email.
            </p>
          </div>
        `),
      }
    }

    case 'nominee_reminder': {
      return {
        subject: `Finish your profile${req.competition_name ? ` for ${req.competition_name}` : ''}`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">Almost There!</h1>
            ${req.competition_name ? `<p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(req.competition_name)}</p>` : ''}
            <p style="color:#ccc;font-size:15px;">
              You accepted your nomination — now finish setting up your profile to be eligible to compete.
            </p>
            <p style="color:#999;font-size:14px;margin-top:16px;">
              It only takes a minute. Pick up right where you left off.
            </p>
            ${goldButton('Complete Your Profile', req.claim_url || appUrl)}
            <p style="color:#666;font-size:12px;">
              You must complete your profile before you can be approved as a contestant.
            </p>
          </div>
        `),
      }
    }

    case 'self_nominee_reminder': {
      return {
        subject: `You're almost in${req.competition_name ? ` — finish your entry for ${req.competition_name}` : ' — finish your entry'}`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">You're So Close!</h1>
            ${req.competition_name ? `<p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(req.competition_name)}</p>` : ''}
            <p style="color:#ccc;font-size:15px;">
              You started entering but didn't finish your profile. Complete it now so the hosts can review and approve you.
            </p>
            <p style="color:#999;font-size:14px;margin-top:16px;">
              It only takes a minute. Pick up right where you left off.
            </p>
            ${goldButton('Finish My Entry', req.claim_url || appUrl)}
            <p style="color:#666;font-size:12px;">
              Your profile must be complete before you can be approved as a contestant.
            </p>
          </div>
        `),
      }
    }

    case 'judge_invite': {
      return {
        subject: `You've been invited to judge ${req.competition_name || 'Most Eligible'}`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">You've Been Invited to Judge</h1>
            <p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(req.competition_name || 'Most Eligible')}</p>
            <p style="color:#ccc;font-size:15px;">
              You've been selected as a judge${req.city_name ? ` for ${escapeHtml(req.city_name)}` : ''}. Your scores will help decide who advances and who wins.
            </p>
            <p style="color:#999;font-size:14px;margin-top:16px;">
              Set up your account and you'll be able to score contestants when the judging round opens.
            </p>
            ${goldButton('Accept Judging Invite', req.claim_url || appUrl)}
            <p style="color:#666;font-size:12px;">
              If you weren't expecting this, you can ignore the email.
            </p>
          </div>
        `),
      }
    }

    case 'nominator_confirm': {
      const nomineeEmailLine = req.nominee_email
        ? `<p style="color:#999;font-size:13px;margin-top:4px;">We'll send the invite to <strong style="color:#ccc;">${escapeHtml(req.nominee_email)}</strong></p>`
        : ''

      return {
        subject: `Your nomination${req.competition_name ? ` for ${req.competition_name}` : ''} was submitted!`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">Nomination Submitted!</h1>
            ${req.competition_name ? `<p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(req.competition_name)}</p>` : ''}
            <p style="color:#ccc;font-size:15px;">
              You nominated <strong>${escapeHtml(req.nominee_name || 'someone special')}</strong>.
            </p>
            ${nomineeEmailLine}
            <p style="color:#999;font-size:14px;margin-top:16px;">
              We'll reach out to them and let them know they've been nominated. We'll keep you updated on their status.
            </p>
            ${req.competition_url ? goldButton('View Competition', req.competition_url) : ''}
            <p style="color:#999;font-size:13px;margin-top:16px;">
              Share the competition page with your nominee so they know what's at stake!
            </p>
          </div>
        `),
      }
    }

    case 'nominee_accepted': {
      return {
        subject: `${req.nominee_name || 'Your nominee'} accepted their nomination!`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">Nomination Accepted!</h1>
            ${req.competition_name ? `<p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(req.competition_name)}</p>` : ''}
            <p style="color:#ccc;font-size:15px;">
              <strong>${escapeHtml(req.nominee_name || 'Your nominee')}</strong> has accepted their nomination! The team is now reviewing their submission — we'll let you know if they are approved as an official contestant.
            </p>
            ${req.competition_url ? goldButton('View Competition', req.competition_url) : ''}
          </div>
        `),
      }
    }

    case 'nominee_declined': {
      return {
        subject: `Update on your nomination${req.competition_name ? ` for ${req.competition_name}` : ''}`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#999;font-size:28px;margin:0 0 8px;">Nomination Update</h1>
            ${req.competition_name ? `<p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(req.competition_name)}</p>` : ''}
            <p style="color:#ccc;font-size:15px;">
              Unfortunately, <strong>${escapeHtml(req.nominee_name || 'your nominee')}</strong> has decided not to enter the competition at this time.
            </p>
            <p style="color:#999;font-size:14px;margin-top:16px;">
              Know someone else who'd be a great fit? You can still nominate more people!
            </p>
            ${req.competition_url ? goldButton('Nominate Someone Else', req.competition_url) : ''}
          </div>
        `),
      }
    }

    case 'account_ready': {
      const resetUrl = req.reset_password_url || `${appUrl}/login`
      return {
        subject: `Your${req.competition_name ? ` ${req.competition_name}` : ''} account is ready — set your password`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">Your Account is Ready!</h1>
            ${req.competition_name ? `<p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(req.competition_name)}</p>` : ''}
            <p style="color:#ccc;font-size:15px;">
              Hi${req.nominee_name ? ` ${escapeHtml(req.nominee_name.split(' ')[0])}` : ''}! Your EliteRank account has been set up with your nomination details.
            </p>
            <p style="color:#ccc;font-size:15px;margin-top:12px;">
              Set your password below so you can log in, view your profile, and track your progress in the competition.
            </p>
            ${goldButton('Set Your Password', resetUrl)}
            <p style="color:#999;font-size:13px;margin-top:16px;">
              This link expires in 24 hours. If it expires, you can always use "Forgot Password" on the login page.
            </p>
          </div>
        `),
      }
    }

    case 'contestant_promoted': {
      const contestantName = req.contestant_name || req.to_name || ''
      const firstName = contestantName ? contestantName.split(' ')[0] : ''
      const competitionName = req.competition_name || 'the competition'
      const cityLine = req.city_name
        ? `<p style="color:#ccc;font-size:15px;margin-top:4px;">${escapeHtml(req.city_name)}</p>`
        : ''
      const ctaUrl = req.profile_url || req.competition_url || appUrl
      return {
        subject: `You're officially a contestant in ${competitionName}!`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">You're In!</h1>
            <p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(competitionName)}</p>
            ${cityLine}
            <p style="color:#ccc;font-size:15px;margin-top:16px;">
              Congratulations${firstName ? `, ${escapeHtml(firstName)}` : ''}! Your nomination has been approved — you're now an official contestant in <strong>${escapeHtml(competitionName)}</strong>.
            </p>
            <p style="color:#999;font-size:14px;margin-top:16px;">
              Votes are how you climb the ranks. Share your profile, rally your network, and complete bonus tasks to earn extra votes.
            </p>
            ${goldButton('View Your Profile', ctaUrl)}
            <p style="color:#666;font-size:12px;">
              Good luck 🍀
            </p>
          </div>
        `),
      }
    }

    case 'fan_confirmation': {
      const contestantName = req.contestant_name || 'your contestant'
      const competitionLine = req.competition_name
        ? `<p style="color:#ccc;font-size:15px;margin-top:8px;">in <strong>${escapeHtml(req.competition_name)}</strong></p>`
        : ''
      const ctaUrl = req.profile_url || req.competition_url
      const unsubLine = req.unsubscribe_url
        ? `<p style="color:#666;font-size:12px;margin-top:16px;">
             Not interested in weekly updates for ${escapeHtml(contestantName)}?
             <a href="${escapeHtml(req.unsubscribe_url)}" style="color:#999;text-decoration:underline;">Unsubscribe</a>.
           </p>`
        : `<p style="color:#666;font-size:12px;margin-top:16px;">
             You can turn off weekly updates any time from your notification settings.
           </p>`
      return {
        subject: `You're now a fan of ${contestantName}`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">You're a Fan!</h1>
            <p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(contestantName)}</p>
            ${competitionLine}
            <p style="color:#ccc;font-size:15px;margin-top:16px;">
              We'll send you a <strong>weekly competition update</strong> so you can follow how ${escapeHtml(contestantName)} is doing — round standings, performance and ways to support.
            </p>
            ${ctaUrl ? goldButton(`View ${contestantName}'s Profile`, ctaUrl) : ''}
            ${unsubLine}
          </div>
        `),
      }
    }

    case 'fan_weekly_digest': {
      const contestantName = req.contestant_name || 'your contestant'
      const isSelf = !!req.is_self
      const competitionName = req.competition_name || 'Most Eligible'
      const safeContestantName = escapeHtml(contestantName)
      const safeCompetitionName = escapeHtml(competitionName)

      const formatShortDate = (iso: string) => {
        try {
          return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        } catch {
          return iso
        }
      }

      const trendArrow = req.trend === 'up' ? '&uarr;' : req.trend === 'down' ? '&darr;' : '&rarr;'
      const trendColor = req.trend === 'up' ? '#22c55e' : req.trend === 'down' ? '#ef4444' : '#999'
      const trendLabel = req.trend === 'up' ? 'up' : req.trend === 'down' ? 'down' : 'steady'

      const rankBlock = req.rank
        ? `<div style="display:inline-block;padding:12px 20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;margin:8px 4px;min-width:120px;">
             <div style="color:#999;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Rank</div>
             <div style="color:#d4a843;font-size:32px;font-weight:bold;line-height:1.1;margin-top:4px;">#${req.rank}</div>
             <div style="color:${trendColor};font-size:13px;margin-top:4px;">${trendArrow} ${trendLabel}</div>
           </div>`
        : ''

      const votesBlock = typeof req.total_votes === 'number'
        ? `<div style="display:inline-block;padding:12px 20px;background:#1a1a1a;border:1px solid #333;border-radius:8px;margin:8px 4px;min-width:120px;">
             <div style="color:#999;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Total Votes</div>
             <div style="color:#fff;font-size:32px;font-weight:bold;line-height:1.1;margin-top:4px;">${req.total_votes.toLocaleString()}</div>
             <div style="color:#666;font-size:13px;margin-top:4px;">all time</div>
           </div>`
        : ''

      const statsRow = (rankBlock || votesBlock)
        ? `<div style="text-align:center;margin:16px 0;">${rankBlock}${votesBlock}</div>`
        : `<p style="color:#999;font-size:14px;text-align:center;margin:16px 0;">No activity this week — stay tuned!</p>`

      const roundEndLine = req.voting_round_end
        ? `<p style="color:#ccc;font-size:14px;margin:8px 0;">Current voting round ends <strong style="color:#fff;">${formatShortDate(req.voting_round_end)}</strong></p>`
        : ''

      const nextEventLine = req.next_event_name && req.next_event_date
        ? `<p style="color:#ccc;font-size:14px;margin:8px 0;">Next event: <strong style="color:#fff;">${escapeHtml(req.next_event_name)}</strong> on ${formatShortDate(req.next_event_date)}</p>`
        : ''

      const intro = isSelf
        ? `Here's your weekly performance snapshot for <strong>${safeCompetitionName}</strong>.`
        : `Here's how <strong>${safeContestantName}</strong> is doing this week in <strong>${safeCompetitionName}</strong>.`

      const heading = isSelf ? 'Your Weekly Update' : `Weekly Update: ${safeContestantName}`
      const subject = isSelf
        ? `Your weekly update — ${competitionName}`
        : `Weekly update on ${contestantName}`

      const ctaUrl = req.profile_url || req.competition_url
      const ctaLabel = isSelf ? 'View My Profile' : `View ${contestantName}'s Profile`

      const unsubLine = !isSelf && req.unsubscribe_url
        ? `<p style="color:#666;font-size:12px;margin-top:16px;">
             Not interested in weekly updates for ${safeContestantName}?
             <a href="${escapeHtml(req.unsubscribe_url)}" style="color:#999;text-decoration:underline;">Unsubscribe</a>.
           </p>`
        : ''

      return {
        subject,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:26px;margin:0 0 8px;">${heading}</h1>
            <p style="color:#ccc;font-size:15px;margin:8px 0 16px;">${intro}</p>
            ${statsRow}
            ${roundEndLine}
            ${nextEventLine}
            ${ctaUrl ? goldButton(ctaLabel, ctaUrl) : ''}
            ${unsubLine}
          </div>
        `),
      }
    }

    case 'vote_receipt': {
      const contestantName = req.contestant_name || 'the contestant'
      const firstName = contestantName.split(' ')[0]
      const competitionName = req.competition_name || 'Most Eligible'
      const voteCount = req.vote_count || 0
      const amountPaid = req.amount_paid || 0
      const purchasedVoteCount = req.purchased_vote_count || 0
      const wasDoubled = !!req.was_doubled && purchasedVoteCount > 0 && voteCount > purchasedVoteCount
      const isAnonymous = !!req.is_anonymous

      const formatShortDate = (iso: string) => {
        try {
          return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        } catch {
          return iso
        }
      }

      const voteText = voteCount === 1 ? '1 vote' : `${voteCount.toLocaleString()} votes`

      // Currency-aware money formatting (US hosts charge USD, CA hosts CAD).
      const currencyCode = (req.currency || 'usd').toUpperCase()
      const fmtMoney = (n: number) => {
        try {
          return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode }).format(n)
        } catch {
          return `$${n.toFixed(2)}`
        }
      }

      // Compliant tax-receipt itemization. Present only when tax was charged
      // (e.g. Ontario HST). Otherwise the receipt shows a single plain total.
      const taxAmount = typeof req.tax_amount === 'number' ? req.tax_amount : 0
      const hasTax = taxAmount > 0
      const subtotal = typeof req.subtotal_amount === 'number'
        ? req.subtotal_amount
        : Math.max(0, amountPaid - taxAmount)
      const taxLabel = req.tax_label || 'Tax'
      const safeTaxLabel = escapeHtml(taxLabel)
      const taxLabelWithRate = req.tax_rate_pct ? `${safeTaxLabel} (${req.tax_rate_pct}%)` : safeTaxLabel

      const amountBlock = amountPaid > 0
        ? (hasTax
            ? `<div style="max-width:320px;margin:16px auto;padding:16px;background:#1a1a1a;border:1px solid #333;border-radius:8px;">
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:Arial,sans-serif;">
                   <tr><td style="color:#999;font-size:13px;padding:3px 0;text-align:left;">Subtotal</td><td style="color:#ccc;font-size:13px;padding:3px 0;text-align:right;">${fmtMoney(subtotal)}</td></tr>
                   <tr><td style="color:#999;font-size:13px;padding:3px 0;text-align:left;">${taxLabelWithRate}</td><td style="color:#ccc;font-size:13px;padding:3px 0;text-align:right;">${fmtMoney(taxAmount)}</td></tr>
                   <tr><td style="border-top:1px solid #333;color:#fff;font-size:14px;font-weight:bold;padding:8px 0 2px;text-align:left;">Total</td><td style="border-top:1px solid #333;color:#fff;font-size:14px;font-weight:bold;padding:8px 0 2px;text-align:right;">${fmtMoney(amountPaid)} ${currencyCode}</td></tr>
                 </table>
               </div>`
            : `<p style="color:#666;font-size:13px;margin:8px 0;">Total: ${fmtMoney(amountPaid)}</p>`)
        : ''

      // Vendor of record for a compliant tax receipt (host legal name + tax reg
      // number + address). The host is merchant of record on the direct charge.
      const vendorBlock = hasTax && req.vendor_legal_name
        ? `<div style="text-align:center;margin-top:20px;padding-top:14px;border-top:1px solid #222;">
             <p style="color:#777;font-size:11px;line-height:1.7;margin:0;font-family:Arial,sans-serif;">
               Sold by <strong style="color:#999;">${escapeHtml(req.vendor_legal_name)}</strong><br>
               ${req.vendor_tax_number ? `${safeTaxLabel} Reg. No. ${escapeHtml(req.vendor_tax_number)}<br>` : ''}
               ${req.vendor_address ? `${escapeHtml(req.vendor_address)}<br>` : ''}
               ${req.receipt_number ? `Receipt No. ${escapeHtml(req.receipt_number)}` : ''}
             </p>
           </div>`
        : ''

      const rankBlock = req.rank
        ? `<div style="display:inline-block;padding:16px 24px;background:#1a1a1a;border:1px solid #333;border-radius:12px;margin:16px 0;">
             <div style="color:#999;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;">Current Rank</div>
             <div style="color:#d4a843;font-size:48px;font-weight:bold;line-height:1.1;margin-top:4px;">#${req.rank}</div>
           </div>`
        : ''

      const roundEndLine = req.voting_round_end
        ? `<p style="color:#ccc;font-size:14px;margin:12px 0;">Voting round ends <strong style="color:#fff;">${formatShortDate(req.voting_round_end)}</strong></p>`
        : ''

      // When the host scheduled today as a double-vote day, the webhook
      // doubled the purchased count. Tell the voter so the receipt total
      // doesn't read as a billing bug.
      const doubledLine = wasDoubled
        ? `<p style="color:#d4a843;font-size:14px;margin:12px 0;font-weight:bold;">
             Today is a Double Vote Day — your ${purchasedVoteCount.toLocaleString()} paid ${purchasedVoteCount === 1 ? 'vote counts' : 'votes count'} as ${voteCount.toLocaleString()}.
           </p>`
        : ''

      const ctaUrl = req.profile_url || req.competition_url

      // For anonymous voters, prompt to create account and become a fan
      const fanPrompt = isAnonymous
        ? `<div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin-top:24px;">
             <p style="color:#ccc;font-size:14px;margin:0 0 12px;">
               Want to follow ${escapeHtml(firstName)}'s journey? Create a free account to become a fan and get weekly updates.
             </p>
             ${req.signup_url ? `<a href="${escapeHtml(req.signup_url)}" style="display:inline-block;padding:10px 24px;background:transparent;border:1px solid #d4a843;color:#d4a843;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">Create Account & Become a Fan</a>` : ''}
           </div>`
        : `<div style="background:#1a1a1a;border:1px solid #333;border-radius:8px;padding:16px;margin-top:24px;">
             <p style="color:#ccc;font-size:14px;margin:0 0 12px;">
               Want weekly updates on ${escapeHtml(firstName)}'s progress?
             </p>
             ${ctaUrl ? `<a href="${escapeHtml(`${ctaUrl}?becomeFan=1`)}" style="display:inline-block;padding:10px 24px;background:transparent;border:1px solid #d4a843;color:#d4a843;text-decoration:none;border-radius:6px;font-weight:bold;font-size:14px;">Become a Fan</a>` : ''}
           </div>`

      return {
        subject: `You sent ${voteText} to ${contestantName}!`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">Thanks for Voting!</h1>
            <p style="color:#ccc;font-size:16px;margin:8px 0;">
              You sent <strong style="color:#fff;">${voteText}</strong> to
            </p>
            <p style="color:#fff;font-size:22px;font-weight:bold;margin:8px 0;">${escapeHtml(contestantName)}</p>
            <p style="color:#999;font-size:14px;margin:4px 0;">in ${escapeHtml(competitionName)}</p>
            ${amountBlock}
            ${doubledLine}
            ${rankBlock}
            ${roundEndLine}
            ${ctaUrl ? goldButton(`View ${firstName}'s Profile`, ctaUrl) : ''}
            ${fanPrompt}
            ${vendorBlock}
          </div>
        `),
      }
    }

    case 'subscriber_confirmation': {
      const competitionName = req.competition_name || 'Most Eligible'
      const cityLine = req.city_name
        ? `<p style="color:#ccc;font-size:15px;margin-top:8px;">${escapeHtml(req.city_name)}</p>`
        : ''
      const greeting = req.to_name ? `Hi ${escapeHtml(req.to_name.split(' ')[0])},` : 'Hi,'
      const ctaUrl = req.competition_url || appUrl
      const openLine = req.nomination_start
        ? `<p style="color:#ccc;font-size:14px;margin:8px 0;">Nominations open <strong style="color:#fff;">${new Date(req.nomination_start).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong>.</p>`
        : ''
      return {
        subject: `You're on the list: ${competitionName}`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">You're on the list</h1>
            <p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(competitionName)}</p>
            ${cityLine}
            <p style="color:#ccc;font-size:15px;margin-top:20px;text-align:left;">${greeting}</p>
            <p style="color:#ccc;font-size:15px;text-align:left;">
              Thanks for signing up. We'll email you the moment nominations open so you have first dibs to nominate someone — or put yourself forward.
            </p>
            ${openLine}
            ${goldButton('View Competition', ctaUrl)}
          </div>
          ${subscriberLegalFooter(req.unsubscribe_url)}
        `),
      }
    }

    case 'nominations_open_subscriber': {
      const competitionName = req.competition_name || 'Most Eligible'
      const cityLine = req.city_name
        ? `<p style="color:#ccc;font-size:15px;margin-top:8px;">${escapeHtml(req.city_name)}</p>`
        : ''
      const greeting = req.to_name ? `Hi ${escapeHtml(req.to_name.split(' ')[0])},` : 'Hi,'
      const ctaUrl = req.competition_url || appUrl
      const deadlineLine = req.nomination_end
        ? `<p style="color:#999;font-size:13px;margin-top:12px;">Nominations close ${new Date(req.nomination_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.</p>`
        : ''
      return {
        subject: `Nominations are open: ${competitionName}`,
        body: wrapper(`
          <div style="text-align:center;">
            <h1 style="color:#d4a843;font-size:28px;margin:0 0 8px;">Nominations are open</h1>
            <p style="color:#fff;font-size:18px;font-weight:bold;margin:8px 0;">${escapeHtml(competitionName)}</p>
            ${cityLine}
            <p style="color:#ccc;font-size:15px;margin-top:20px;text-align:left;">${greeting}</p>
            <p style="color:#ccc;font-size:15px;text-align:left;">
              You asked us to let you know — nominations just opened. Nominate someone you think deserves it, or put yourself forward.
            </p>
            ${goldButton('Nominate Now', ctaUrl)}
            ${deadlineLine}
          </div>
          ${subscriberLegalFooter(req.unsubscribe_url)}
        `),
      }
    }

    default:
      return {
        subject: 'EliteRank Notification',
        body: wrapper(`<p style="text-align:center;color:#ccc;">You have a new notification from EliteRank.</p>`),
      }
  }
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
      // User exists but no email subscription — fall through to create one
      console.log('OneSignal user exists but no email subscription, will add one')
    }
  } catch (lookupErr) {
    console.warn('OneSignal user lookup failed:', lookupErr)
  }

  // 2. Create user with email subscription
  const createPayload = {
    properties: {
      tags: { source: 'eliterank' },
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
    console.log('OneSignal user creation result:', JSON.stringify({
      status: createRes.status,
      hasSubscriptions: !!createResult?.subscriptions?.length,
    }))

    // Extract the email subscription ID from the response
    const emailSub = createResult?.subscriptions?.find(
      (s: { type?: string; token?: string }) =>
        s.type === 'Email' && s.token?.toLowerCase() === email.toLowerCase()
    )

    if (emailSub?.id) {
      console.log('Created OneSignal subscription:', emailSub.id)
      return { subscriptionId: emailSub.id }
    }

    // If creation returned 409 (conflict/already exists), try lookup again
    if (createRes.status === 409) {
      console.log('User already exists (409), retrying lookup...')
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

    return { subscriptionId: null, error: `No subscription ID in response: ${JSON.stringify(createResult)}` }
  } catch (createErr) {
    return { subscriptionId: null, error: String(createErr) }
  }
}

/**
 * Resolve the sender display name for an email. Recipients recognize the
 * competition they signed up for (e.g. "Chicago Creator of the Year"), so that
 * is the "from" name — not the parent organization or the platform. Prefers the
 * competition_name passed by the caller; otherwise looks it up from
 * competition_id. Falls back to DEFAULT_BRAND_NAME (env) / the platform name.
 * Best-effort: never throws — a lookup failure just yields the fallback rather
 * than blocking the send.
 */
async function resolveSenderName(
  competitionName?: string | null,
  competitionId?: string | null,
): Promise<string> {
  const fallback = Deno.env.get('DEFAULT_BRAND_NAME') || 'EliteRank'
  const passed = typeof competitionName === 'string' ? competitionName.trim() : ''
  if (passed) return passed
  if (!competitionId) return fallback
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) return fallback
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data: comp, error } = await supabase
      .from('competitions')
      .select('name')
      .eq('id', competitionId)
      .maybeSingle()
    if (error) return fallback
    const name = typeof comp?.name === 'string' ? comp.name.trim() : ''
    return name || fallback
  } catch (err) {
    console.warn('resolveSenderName error (non-blocking):', err)
    return fallback
  }
}

/**
 * Best-effort write of a send attempt to the email_logs table. Never throws —
 * deliverability logging must not block or fail the actual email send.
 */
async function logEmailSend(params: {
  body: EmailRequest
  status: 'sent' | 'failed'
  onesignalId?: string | null
  recipients?: number | null
  deliveryMethod?: string | null
  error?: string | null
}): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !serviceKey) {
      console.warn('email_logs: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — skipping log')
      return
    }
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error } = await supabase.from('email_logs').insert({
      competition_id: params.body.competition_id ?? null,
      email_type: params.body.type,
      to_email: params.body.to_email,
      to_name: params.body.to_name ?? null,
      status: params.status,
      onesignal_id: params.onesignalId ?? null,
      recipients: params.recipients ?? null,
      delivery_method: params.deliveryMethod ?? null,
      error: params.error ? String(params.error).slice(0, 1000) : null,
    })
    if (error) console.warn('email_logs insert failed (non-blocking):', error.message)
  } catch (err) {
    console.warn('email_logs logging error (non-blocking):', err)
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
      console.error('OneSignal credentials not configured')
      return new Response(
        JSON.stringify({ error: 'Email service not configured', details: 'Missing ONESIGNAL_APP_ID or ONESIGNAL_API_KEY' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body: EmailRequest = await req.json()
    console.log('send-onesignal-email called:', JSON.stringify({ type: body.type, to_email: body.to_email }))

    if (!body.to_email || !body.type) {
      return new Response(
        JSON.stringify({ error: 'to_email and type are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // For fan emails, generate the signed one-click unsubscribe link
    // server-side so the secret never leaves the edge. Caller passes fan_id
    // (the contestant_fans row id); the fan-unsubscribe function verifies
    // the matching signature. Skipped when the caller already supplied an
    // unsubscribe_url (e.g. contestant-self digests point at settings).
    const needsFanUnsubLink =
      (body.type === 'fan_confirmation' || body.type === 'fan_weekly_digest') &&
      body.fan_id && !body.unsubscribe_url
    if (needsFanUnsubLink) {
      const unsubSecret = Deno.env.get('FAN_UNSUBSCRIBE_SECRET')
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      if (unsubSecret && supabaseUrl) {
        const token = await signFanToken(body.fan_id!, unsubSecret)
        body.unsubscribe_url = `${supabaseUrl}/functions/v1/fan-unsubscribe?token=${encodeURIComponent(token)}`
      } else {
        console.warn(`${body.type}: missing FAN_UNSUBSCRIBE_SECRET or SUPABASE_URL — unsubscribe link will not be included`)
      }
    }

    // Same idea for subscriber emails — the recipient signed up on a
    // competition's coming-soon page and is identified by competition_subscribers.id.
    // Required for CAN-SPAM / CASL / GDPR compliance: every commercial-ish
    // message must offer a one-click unsubscribe.
    const needsSubscriberUnsubLink =
      (body.type === 'subscriber_confirmation' || body.type === 'nominations_open_subscriber') &&
      body.subscriber_id && !body.unsubscribe_url
    if (needsSubscriberUnsubLink) {
      const unsubSecret = Deno.env.get('SUBSCRIBER_UNSUBSCRIBE_SECRET') || Deno.env.get('FAN_UNSUBSCRIBE_SECRET')
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      if (unsubSecret && supabaseUrl) {
        const token = await signFanToken(body.subscriber_id!, unsubSecret)
        body.unsubscribe_url = `${supabaseUrl}/functions/v1/subscriber-unsubscribe?token=${encodeURIComponent(token)}`
      } else {
        console.warn(`${body.type}: missing unsubscribe secret or SUPABASE_URL — unsubscribe link will not be included`)
      }
    }

    const { subject, body: htmlBody } = getEmailContent(body)

    // Sender display name = the competition the recipient signed up for (falls
    // back to the platform name for platform-level emails with no competition).
    const fromName = await resolveSenderName(body.competition_name, body.competition_id)

    // Step 1: Ensure the recipient has a OneSignal email subscription.
    // This is critical — include_email_tokens silently fails for unknown
    // emails. By ensuring the subscription exists first and targeting by
    // subscription ID, we guarantee delivery.
    const { subscriptionId, error: subError } = await ensureEmailSubscription(
      appId,
      apiKey,
      body.to_email,
    )

    // Build the notification payload — prefer targeting by subscription ID
    // (guaranteed to work) with fallback to email token (works for existing
    // subscriptions that may have a different external_id).
    const oneSignalPayload: Record<string, unknown> = {
      app_id: appId,
      email_subject: subject,
      email_body: htmlBody,
      email_from_name: fromName,
      // Send from the authenticated sending subdomain so the From domain
      // matches the DKIM signing domain (exact DMARC alignment, no "via"
      // in Gmail). Replies still route to info@eliterank.co via the
      // Reply-To configured on the OneSignal sender.
      email_from_address: 'info@mail.eliterank.co',
      disable_email_click_tracking: true,
      data: {
        type: body.type,
        to_email: body.to_email,
      },
    }

    if (subscriptionId) {
      // Target by subscription ID — deterministic, no indexing delay
      oneSignalPayload.include_subscription_ids = [subscriptionId]
      console.log('Targeting by subscription ID:', subscriptionId)
    } else {
      // Fallback to email token if we couldn't get a subscription ID
      console.warn('No subscription ID available, falling back to include_email_tokens. Error:', subError)
      oneSignalPayload.include_email_tokens = [body.to_email]
    }

    console.log('Sending OneSignal email:', JSON.stringify({ subject, to: body.to_email, method: subscriptionId ? 'subscription_id' : 'email_token' }))

    const osResponse = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Key ${apiKey}`,
      },
      body: JSON.stringify(oneSignalPayload),
    })

    const osResult = await osResponse.json()
    console.log('OneSignal API response:', JSON.stringify({
      status: osResponse.status,
      id: osResult?.id,
      recipients: osResult?.recipients,
      errors: osResult?.errors,
    }))

    if (!osResponse.ok || osResult?.recipients === 0) {
      console.error('OneSignal send failed:', JSON.stringify(osResult))

      // If we used subscription_id and it still failed, try email_token as last resort
      if (subscriptionId) {
        console.log('Subscription ID send failed, retrying with email_token...')
        const fallbackPayload = {
          ...oneSignalPayload,
          include_email_tokens: [body.to_email],
        }
        delete fallbackPayload.include_subscription_ids

        const fallbackRes = await fetch('https://api.onesignal.com/notifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Key ${apiKey}`,
          },
          body: JSON.stringify(fallbackPayload),
        })

        const fallbackResult = await fallbackRes.json()
        console.log('Fallback email_token result:', JSON.stringify({
          status: fallbackRes.status,
          recipients: fallbackResult?.recipients,
          errors: fallbackResult?.errors,
        }))

        if (fallbackRes.ok && fallbackResult?.recipients > 0) {
          await logEmailSend({
            body,
            status: 'sent',
            onesignalId: fallbackResult.id,
            recipients: fallbackResult.recipients,
            deliveryMethod: 'email_token_fallback',
          })
          return new Response(
            JSON.stringify({ success: true, onesignal_id: fallbackResult.id, recipients: fallbackResult.recipients, method: 'email_token_fallback' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      await logEmailSend({
        body,
        status: 'failed',
        recipients: osResult?.recipients ?? 0,
        error: JSON.stringify(osResult),
      })
      return new Response(
        JSON.stringify({ error: 'OneSignal email delivery failed', details: osResult, subscription_id: subscriptionId }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('OneSignal email sent successfully:', JSON.stringify({ id: osResult.id, recipients: osResult.recipients }))

    await logEmailSend({
      body,
      status: 'sent',
      onesignalId: osResult.id,
      recipients: osResult.recipients,
      deliveryMethod: subscriptionId ? 'subscription_id' : 'email_token',
    })

    return new Response(
      JSON.stringify({ success: true, onesignal_id: osResult.id, recipients: osResult.recipients }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in send-onesignal-email:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
}
