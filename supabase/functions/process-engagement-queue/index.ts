import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// =============================================================================
// TEMPLATE DATA INTERFACE
// =============================================================================

interface TemplateData {
  nominee_name?: string
  nominator_name?: string
  competition_name?: string
  city_name?: string
  season?: string
  claim_url?: string
  profile_url?: string
  competition_url?: string
  prize_pool?: number
  voting_starts?: string
  voting_ends?: string
  current_rank?: number
  total_contestants?: number
  days_until_voting?: number
}

// =============================================================================
// SMS TEMPLATES (keep under 160 chars when possible)
// =============================================================================

function renderSmsTemplate(type: string, data: TemplateData): string {
  const templates: Record<string, () => string> = {
    
    nomination_reminder_48h: () => 
      `${data.nominee_name}, you've been nominated for ${data.competition_name}! Accept now: ${data.claim_url}`,
    
    nomination_reminder_5d: () =>
      `Final reminder: Your ${data.competition_name} nomination expires soon. Accept now: ${data.claim_url}`,
    
    nominator_friend_entered: () =>
      `🎉 ${data.nominee_name} accepted your nomination for ${data.competition_name}! Help them win: ${data.profile_url}`,
    
    nominator_no_response: () =>
      `${data.nominee_name} hasn't responded to your ${data.competition_name} nomination yet. Maybe give them a nudge?`,
    
    approval_email: () =>
      `🏆 You're in! You've been approved for ${data.competition_name}. See what's next: ${data.profile_url}`,
    
    voting_countdown_3d: () =>
      `3 days until voting starts for ${data.competition_name}! Get your supporters ready. ${data.profile_url}`,
    
    voting_countdown_1d: () =>
      `Tomorrow! Voting for ${data.competition_name} starts. Rally your network! ${data.profile_url}`,
    
    voting_started: () =>
      `🗳️ Voting is LIVE for ${data.competition_name}! You're #${data.current_rank || '?'}. Share & get votes: ${data.profile_url}`,
    
    first_vote: () =>
      `🎉 You got your first vote for ${data.competition_name}! Keep the momentum going: ${data.profile_url}`,
    
    rank_milestone: () =>
      `📈 You moved up to #${data.current_rank} in ${data.competition_name}! Keep pushing: ${data.profile_url}`,
    
    at_risk_warning: () =>
      `⚠️ You're #${data.current_rank} in ${data.competition_name}. Top contestants advance. Get more votes: ${data.profile_url}`,
    
    round_ending_24h: () =>
      `⏰ 24 hours left! Round ends tomorrow for ${data.competition_name}. Final push: ${data.profile_url}`,
  }

  const template = templates[type]
  return template ? template() : `Update from ${data.competition_name}: ${data.profile_url || data.competition_url}`
}

// =============================================================================
// EMAIL TEMPLATES
// =============================================================================

function renderEmailTemplate(type: string, data: TemplateData): { subject: string; html: string; text: string } {
  const templates: Record<string, () => { subject: string; html: string; text: string }> = {
    
    nomination_reminder_48h: () => ({
      subject: `${data.nominee_name}, you've been nominated for ${data.competition_name}!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #d4af37; margin-bottom: 24px;">You've Been Nominated! 🏆</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            Hey ${data.nominee_name},
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            ${data.nominator_name ? `<strong>${data.nominator_name}</strong> thinks` : 'Someone thinks'} you're Most Eligible material and nominated you for <strong>${data.competition_name}</strong>!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Don't leave them hanging — accept your nomination and compete for the title (plus a share of the $${(data.prize_pool || 5000).toLocaleString()}+ prize pool).
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.claim_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              Accept Nomination
            </a>
          </div>
          <p style="font-size: 14px; color: #888; text-align: center;">
            This nomination will expire soon. Don't miss your chance!
          </p>
        </div>
      `,
      text: `You've been nominated for ${data.competition_name}! ${data.nominator_name || 'Someone'} thinks you're Most Eligible material. Accept your nomination: ${data.claim_url}`,
    }),

    nomination_reminder_5d: () => ({
      subject: `Final reminder: Accept your ${data.competition_name} nomination`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #d4af37; margin-bottom: 24px;">Last Chance! ⏰</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            Hey ${data.nominee_name},
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Your nomination for <strong>${data.competition_name}</strong> is about to expire.
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            This is your final reminder — after this, you'll miss your chance to compete for the title and prizes.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.claim_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              Accept Before It's Too Late
            </a>
          </div>
        </div>
      `,
      text: `Final reminder: Your nomination for ${data.competition_name} is about to expire. Accept now: ${data.claim_url}`,
    }),

    nominator_friend_entered: () => ({
      subject: `${data.nominee_name} accepted your nomination! 🎉`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #22c55e; margin-bottom: 24px;">Great News! 🎉</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            Hey ${data.nominator_name || 'there'},
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            <strong>${data.nominee_name}</strong> just accepted your nomination and entered <strong>${data.competition_name}</strong>!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            They're now competing for the title and a share of the prize pool. Want to help them win?
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              View Their Profile & Share
            </a>
          </div>
          <p style="font-size: 14px; color: #888; text-align: center;">
            Voting starts ${data.voting_starts || 'soon'}. Rally your friends!
          </p>
        </div>
      `,
      text: `${data.nominee_name} accepted your nomination for ${data.competition_name}! View their profile and help them win: ${data.profile_url}`,
    }),

    nominator_no_response: () => ({
      subject: `${data.nominee_name} hasn't responded to your nomination`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #f59e0b; margin-bottom: 24px;">No Response Yet 🤔</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            Hey ${data.nominator_name || 'there'},
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            <strong>${data.nominee_name}</strong> hasn't responded to your nomination for <strong>${data.competition_name}</strong> yet.
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Maybe give them a nudge? Let them know you believe in them!
          </p>
          <p style="font-size: 14px; color: #888; margin-top: 24px;">
            Know someone else who should enter? <a href="${data.competition_url}" style="color: #d4af37;">Nominate them here</a>.
          </p>
        </div>
      `,
      text: `${data.nominee_name} hasn't responded to your nomination for ${data.competition_name}. Maybe give them a nudge!`,
    }),

    approval_email: () => ({
      subject: `You're officially in! 🏆 Welcome to ${data.competition_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #22c55e; margin-bottom: 24px;">You're In! 🎉</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            Congratulations ${data.nominee_name}!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            You've been approved as a contestant for <strong>${data.competition_name}</strong>!
          </p>
          
          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h3 style="color: #333; margin-top: 0;">You're competing for:</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li>The title of Most Eligible ${data.city_name}</li>
              <li>A share of the $${(data.prize_pool || 5000).toLocaleString()}+ prize pool</li>
              <li>Bragging rights for a full year</li>
            </ul>
          </div>

          <div style="background: linear-gradient(135deg, rgba(212,175,55,0.1), rgba(212,175,55,0.05)); border: 1px solid rgba(212,175,55,0.3); border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h3 style="color: #d4af37; margin-top: 0;">What's Next?</h3>
            <ol style="color: #555; line-height: 1.8;">
              <li><strong>Complete your profile</strong> — earn 5 bonus votes</li>
              <li><strong>Add your social links</strong> — earn 3 bonus votes</li>
              <li><strong>Review "How to Win"</strong> — earn 3 bonus votes</li>
              <li><strong>Share your profile link</strong> — start building your audience</li>
            </ol>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              View My Profile
            </a>
          </div>

          <p style="font-size: 14px; color: #888; text-align: center;">
            ${data.voting_starts ? `Voting starts ${data.voting_starts}. Start building your audience now!` : 'Voting starts soon. Get ready!'}
          </p>
        </div>
      `,
      text: `Congratulations! You've been approved for ${data.competition_name}. You're competing for the title and a $${(data.prize_pool || 5000).toLocaleString()}+ prize pool. View your profile: ${data.profile_url}`,
    }),

    voting_countdown_3d: () => ({
      subject: `3 days until voting starts for ${data.competition_name}!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #d4af37; margin-bottom: 24px;">3 Days to Go! ⏰</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            Hey ${data.nominee_name},
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Voting for <strong>${data.competition_name}</strong> starts in just 3 days!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Now's the time to rally your supporters. Make sure your friends and family are ready to vote for you on day one.
          </p>
          
          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h3 style="color: #333; margin-top: 0;">Pre-Launch Checklist:</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li>✅ Profile complete with great photo</li>
              <li>✅ Bio that stands out</li>
              <li>✅ Social links added</li>
              <li>📣 Tell your network voting starts ${data.voting_starts}</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              Share My Profile
            </a>
          </div>
        </div>
      `,
      text: `3 days until voting starts for ${data.competition_name}! Rally your supporters now. Share your profile: ${data.profile_url}`,
    }),

    voting_countdown_1d: () => ({
      subject: `Tomorrow's the day! ${data.competition_name} voting starts`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #d4af37; margin-bottom: 24px;">Tomorrow! 🚀</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            ${data.nominee_name}, this is it!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Voting for <strong>${data.competition_name}</strong> starts <strong>tomorrow</strong>.
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Final prep: Make sure everyone knows to vote for you tomorrow. Post on your socials, text your friends, rally your network!
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              Get My Shareable Link
            </a>
          </div>
        </div>
      `,
      text: `Tomorrow! Voting for ${data.competition_name} starts. Make sure everyone knows to vote for you. Your link: ${data.profile_url}`,
    }),

    voting_started: () => ({
      subject: `Voting is LIVE! 🗳️ ${data.competition_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #22c55e; margin-bottom: 24px;">It's Go Time! 🗳️</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            ${data.nominee_name}, voting is now LIVE!
          </p>
          
          <div style="background: linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.05)); border: 1px solid rgba(34,197,94,0.3); border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="font-size: 14px; color: #666; margin: 0;">Your current rank</p>
            <p style="font-size: 48px; font-weight: bold; color: #22c55e; margin: 8px 0;">#${data.current_rank || '?'}</p>
            <p style="font-size: 14px; color: #666; margin: 0;">of ${data.total_contestants || '?'} contestants</p>
          </div>

          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin: 24px 0;">
            <h3 style="color: #333; margin-top: 0;">Remind your supporters:</h3>
            <ul style="color: #555; line-height: 1.8;">
              <li>Everyone gets <strong>1 FREE vote per day</strong></li>
              <li>Paid votes ($1 each) count immediately</li>
              <li>Free votes reset at midnight</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              View Leaderboard
            </a>
          </div>
        </div>
      `,
      text: `Voting is LIVE for ${data.competition_name}! You're currently #${data.current_rank || '?'} of ${data.total_contestants || '?'}. Everyone gets 1 free vote per day. Share your link: ${data.profile_url}`,
    }),

    first_vote: () => ({
      subject: `You got your first vote! 🎉`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #d4af37; margin-bottom: 24px;">First Vote! 🎉</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            Congrats ${data.nominee_name}!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            You just got your first vote for <strong>${data.competition_name}</strong>! Someone believes in you. Keep the momentum going!
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              Share & Get More Votes
            </a>
          </div>
        </div>
      `,
      text: `You got your first vote for ${data.competition_name}! Keep the momentum going: ${data.profile_url}`,
    }),

    rank_milestone: () => ({
      subject: `📈 You moved up to #${data.current_rank}!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #22c55e; margin-bottom: 24px;">Moving Up! 📈</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            ${data.nominee_name}, you're climbing the ranks!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            You just moved to <strong>#${data.current_rank}</strong> in ${data.competition_name}. Keep pushing!
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              View Leaderboard
            </a>
          </div>
        </div>
      `,
      text: `You moved up to #${data.current_rank} in ${data.competition_name}! Keep pushing: ${data.profile_url}`,
    }),

    at_risk_warning: () => ({
      subject: `⚠️ You're at risk of elimination`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #ef4444; margin-bottom: 24px;">Time to Rally! ⚠️</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            ${data.nominee_name}, you need more votes!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            You're currently <strong>#${data.current_rank}</strong> in ${data.competition_name}. Only the top contestants advance to the next round.
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Share your link and remind your supporters to vote!
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #ef4444, #dc2626); color: #fff; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              Get More Votes Now
            </a>
          </div>
        </div>
      `,
      text: `⚠️ You're #${data.current_rank} in ${data.competition_name} and at risk of elimination. Get more votes: ${data.profile_url}`,
    }),

    round_ending_24h: () => ({
      subject: `⏰ 24 hours left in this round!`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px;">
          <h1 style="color: #f59e0b; margin-bottom: 24px;">Final 24 Hours! ⏰</h1>
          <p style="font-size: 18px; color: #333; line-height: 1.6;">
            ${data.nominee_name}, the round ends tomorrow!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            You're currently <strong>#${data.current_rank}</strong> in ${data.competition_name}. This is your final push!
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Remind everyone: free votes reset at midnight. Tell them to vote NOW!
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${data.profile_url}" style="display: inline-block; background: linear-gradient(135deg, #d4af37, #b8960c); color: #000; font-weight: 600; padding: 16px 32px; border-radius: 8px; text-decoration: none; font-size: 16px;">
              Share for Final Push
            </a>
          </div>
        </div>
      `,
      text: `⏰ 24 hours left! You're #${data.current_rank} in ${data.competition_name}. Final push: ${data.profile_url}`,
    }),
  }

  const template = templates[type]
  if (!template) {
    return {
      subject: `Update from ${data.competition_name || 'EliteRank'}`,
      html: `<p>You have an update. <a href="${data.profile_url || data.competition_url}">View details</a></p>`,
      text: `You have an update. View details: ${data.profile_url || data.competition_url}`,
    }
  }

  return template()
}

// =============================================================================
// TWILIO SMS
// =============================================================================

async function sendSms(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID')
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const fromNumber = Deno.env.get('TWILIO_PHONE_NUMBER')

  if (!accountSid || !authToken || !fromNumber) {
    console.error('Twilio credentials not configured')
    return { success: false, error: 'Twilio not configured' }
  }

  try {
    // Normalize phone number (ensure it has +1 for US)
    let normalizedPhone = to.replace(/[^\d+]/g, '')
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+1' + normalizedPhone.replace(/^1/, '')
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: normalizedPhone,
          From: fromNumber,
          Body: body,
        }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      console.error('Twilio API error:', result)
      return { success: false, error: result.message || 'SMS send failed' }
    }

    return { success: true, sid: result.sid }
  } catch (err) {
    console.error('SMS send failed:', err)
    return { success: false, error: String(err) }
  }
}

// =============================================================================
// SENDGRID EMAIL
// =============================================================================

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
  fromName: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const apiKey = Deno.env.get('SENDGRID_API_KEY')
  const fromEmail = Deno.env.get('EMAIL_FROM') || 'EliteRank <noreply@eliterank.co>'

  if (!apiKey) {
    console.error('SendGrid API key not configured')
    return { success: false, error: 'SendGrid not configured' }
  }

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail.includes('<') ? fromEmail.match(/<(.+)>/)?.[1] : fromEmail, name: fromName },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('SendGrid API error:', error)
      return { success: false, error }
    }

    const messageId = response.headers.get('x-message-id') || undefined
    return { success: true, messageId }
  } catch (err) {
    console.error('Email send failed:', err)
    return { success: false, error: String(err) }
  }
}

// =============================================================================
// BRAND RESOLUTION
// =============================================================================

/**
 * Resolve the org/brand display name for a competition. Most competitions run
 * under a different organization, so the email "from" name should be that org's
 * name, not the platform. Best-effort: any failure yields the platform default.
 */
async function resolveBrandName(
  supabase: ReturnType<typeof createClient>,
  competitionId?: string | null
): Promise<string> {
  const platformDefault = Deno.env.get('DEFAULT_BRAND_NAME') || 'EliteRank'
  if (!competitionId) return platformDefault
  try {
    const { data: comp, error: compErr } = await supabase
      .from('competitions')
      .select('organization_id')
      .eq('id', competitionId)
      .maybeSingle()
    if (compErr || !comp?.organization_id) return platformDefault
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', comp.organization_id)
      .maybeSingle()
    if (orgErr) return platformDefault
    const name = typeof org?.name === 'string' ? org.name.trim() : ''
    return name || platformDefault
  } catch (err) {
    console.warn('resolveBrandName error (non-blocking):', err)
    return platformDefault
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Find pending engagement messages
    const now = new Date().toISOString()
    const { data: pending, error: fetchError } = await supabase
      .from('engagement_queue')
      .select('*')
      .lte('scheduled_for', now)
      .is('sent_at', null)
      .is('bounced_at', null)
      .lt('retry_count', 3)
      .order('scheduled_for', { ascending: true })
      .limit(50)

    if (fetchError) {
      console.error('Failed to fetch pending messages:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch pending messages', details: fetchError }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pending || pending.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No pending messages to process' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing ${pending.length} pending engagement messages`)

    const results = {
      processed: 0,
      emails_sent: 0,
      sms_sent: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Cache brand lookups within this batch — many rows share a competition.
    const brandCache = new Map<string, string>()
    const brandFor = async (competitionId?: string | null): Promise<string> => {
      const key = competitionId || ''
      if (brandCache.has(key)) return brandCache.get(key)!
      const name = await resolveBrandName(supabase, competitionId)
      brandCache.set(key, name)
      return name
    }

    for (const engagement of pending) {
      results.processed++
      const templateData = engagement.template_data as TemplateData
      const channel = engagement.channel || 'email'

      let emailSent = false
      let smsSent = false
      let emailMessageId: string | undefined
      let smsMessageSid: string | undefined
      let lastError: string | undefined

      // Send email if channel is 'email' or 'both' and we have an email address
      if ((channel === 'email' || channel === 'both') && engagement.email_to) {
        const { subject, html, text } = renderEmailTemplate(engagement.engagement_type, templateData)
        const fromName = await brandFor(engagement.competition_id)
        const emailResult = await sendEmail(engagement.email_to, subject, html, text, fromName)
        
        if (emailResult.success) {
          emailSent = true
          emailMessageId = emailResult.messageId
          results.emails_sent++
          console.log(`Email sent: ${engagement.engagement_type} to ${engagement.email_to}`)
        } else {
          lastError = emailResult.error
        }
      }

      // Send SMS if channel is 'sms' or 'both' and we have a phone number
      if ((channel === 'sms' || channel === 'both') && engagement.phone_to) {
        const smsBody = renderSmsTemplate(engagement.engagement_type, templateData)
        const smsResult = await sendSms(engagement.phone_to, smsBody)
        
        if (smsResult.success) {
          smsSent = true
          smsMessageSid = smsResult.sid
          results.sms_sent++
          console.log(`SMS sent: ${engagement.engagement_type} to ${engagement.phone_to}`)
        } else {
          lastError = smsResult.error
        }
      }

      // Update the record
      if (emailSent || smsSent) {
        await supabase
          .from('engagement_queue')
          .update({
            sent_at: new Date().toISOString(),
            email_message_id: emailMessageId,
            sms_message_sid: smsMessageSid,
          })
          .eq('id', engagement.id)
      } else {
        // Both failed - increment retry
        await supabase
          .from('engagement_queue')
          .update({
            retry_count: (engagement.retry_count || 0) + 1,
            last_error: lastError,
            updated_at: new Date().toISOString(),
          })
          .eq('id', engagement.id)

        results.failed++
        results.errors.push(`Failed ${engagement.engagement_type} to ${engagement.email_to || engagement.phone_to}: ${lastError}`)
      }
    }

    console.log('Engagement queue processing complete:', results)

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in process-engagement-queue:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
