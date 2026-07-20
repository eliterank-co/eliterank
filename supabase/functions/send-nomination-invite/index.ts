import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NomineeData {
  id: string
  name: string
  email?: string
  phone?: string
  invite_token: string
  invite_sent_at?: string
  claimed_at?: string
  user_id?: string
  nominated_by?: string
  flow_stage?: string
  nomination_reason?: string
  nominator_name?: string
  nominator_email?: string
  nominator_anonymous: boolean
  competition: {
    id: string
    name?: string
    season: number
    slug?: string
    nomination_end?: string
    city: { name: string } | null
    demographic: { gender: string | null } | null
    organization: { slug: string } | null
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const { nominee_id, force_resend } = body
    console.log('send-nomination-invite called with:', JSON.stringify(body))

    if (!nominee_id) {
      console.error('Missing nominee_id in request body')
      return new Response(
        JSON.stringify({ error: 'nominee_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

    console.log('Config:', { supabaseUrl, appUrl, hasServiceKey: !!supabaseServiceKey })

    // Create Supabase client with service role (required for auth.admin)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Fetch nominee with competition data
    console.log('Fetching nominee:', nominee_id)
    const { data: nominee, error: fetchError } = await supabase
      .from('nominees')
      .select(`
        id,
        name,
        email,
        phone,
        invite_token,
        nomination_reason,
        nominator_name,
        nominator_email,
        nominator_anonymous,
        invite_sent_at,
        claimed_at,
        user_id,
        nominated_by,
        flow_stage,
        competition:competitions(id, name, season, slug, nomination_end, city:cities(name), demographic:demographics(gender), organization:organizations(slug))
      `)
      .eq('id', nominee_id)
      .single()

    if (fetchError || !nominee) {
      console.error('Nominee query failed:', JSON.stringify({ fetchError, nominee_id, hasNominee: !!nominee }))
      return new Response(
        JSON.stringify({ error: 'Nominee not found', details: fetchError }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const nomineeData = nominee as unknown as NomineeData

    console.log('Found nominee:', JSON.stringify({ id: nomineeData.id, name: nomineeData.name, email: nomineeData.email }))

    // Build URLs for the nomination flow
    const claimUrl = `${appUrl}/claim/${nomineeData.invite_token}`
    // Redirect directly to the claim page after auth so the nominee
    // lands on accept/decline immediately. Requires adding
    // https://eliterank.co/claim/** to Supabase's redirect allowlist.
    const authRedirectUrl = claimUrl

    // Check if already sent (unless force_resend is true)
    if (nomineeData.invite_sent_at && !force_resend) {
      return new Response(
        JSON.stringify({
          message: 'Invite already sent',
          sent_at: nominee.invite_sent_at,
          claim_url: claimUrl, // Include for manual sharing
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Resolve the nominee's email: use the email on the nominee record,
    // or fall back to looking up their profile by phone/instagram when the
    // nominator only provided a phone number.
    let nomineeEmail = nomineeData.email || null

    if (!nomineeEmail && nomineeData.phone) {
      const { data: profileByPhone } = await supabase
        .from('profiles')
        .select('id, email')
        .eq('phone', nomineeData.phone)
        .maybeSingle()

      if (profileByPhone?.email) {
        nomineeEmail = profileByPhone.email
        // Backfill the nominee record so future lookups don't need this fallback
        await supabase
          .from('nominees')
          .update({ email: profileByPhone.email })
          .eq('id', nomineeData.id)
      }
    }

    // NOTE: We intentionally do NOT fall back to nominator_email here.
    // Using the nominator's email would send the invite to the wrong person
    // and incorrectly associate the nominator's email with the nominee record.

    if (!nomineeEmail) {
      console.log('Nominee has no email — skipping email invite. Claim link can be shared manually.', {
        nominee_id: nomineeData.id,
        hasPhone: !!nomineeData.phone,
      })
      // Mark invite_sent_at so we don't retry, even though no email was sent.
      // The host can share the claim link manually via the dashboard.
      await supabase
        .from('nominees')
        .update({ invite_sent_at: new Date().toISOString() })
        .eq('id', nomineeData.id)

      return new Response(
        JSON.stringify({
          success: true,
          sent_via: 'none',
          method: 'no_email',
          message: 'Nominee has no email address. Share the claim link manually.',
          claim_url: claimUrl,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const competition = nomineeData.competition
    const cityName = competition.city?.name || 'Unknown'
    const competitionName = competition.name || `Most Eligible ${cityName} ${competition.season}`
    const gender = competition.demographic?.gender || null
    const nominationEnd = competition.nomination_end || null

    // Check if user already exists by querying profiles table
    // (profiles.id references auth.users.id and email is unique)
    // Note: listUsers() only returns the first page (~50 users) so it
    // silently missed existing users once the user-base grew.
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, email')
      .ilike('email', nomineeEmail)
      .maybeSingle()

    let existingUser = existingProfile
      ? { id: existingProfile.id, email: existingProfile.email }
      : null

    console.log('User lookup result:', JSON.stringify({ nomineeEmail, existingUser, hasProfile: !!existingProfile }))

    // Link nominee to existing user if not already linked
    if (existingUser) {
      const { error: linkError } = await supabase
        .from('nominees')
        .update({ user_id: existingUser.id })
        .eq('id', nominee_id)

      if (linkError) {
        console.warn('Failed to link nominee to existing user:', linkError.message)
      }
    }

    // DO NOT pre-create auth users here. Auth accounts should only be created
    // when the nominee actually sets a password during the claim flow. Creating
    // ghost users causes "already registered" errors and orphaned profiles.
    if (!existingUser) {
      console.log('Nominee has no existing account — will be created when they claim and set a password')
    }

    // Generate a magic link URL only for EXISTING users. New nominees get a
    // plain claim URL and will create their account during the claim flow.
    let magicLinkUrl: string | null = null

    // Only generate a magic link for existing users — new nominees don't have
    // an auth account yet so generateLink would fail or create one implicitly.
    if (existingUser) {
      try {
        console.log('Generating magic link for existing user:', nomineeEmail, 'redirectTo:', authRedirectUrl)
        const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
          type: 'magiclink',
          email: nomineeEmail,
          options: {
            redirectTo: authRedirectUrl,
            data: {
              nomination_invite: true,
              nominee_name: nomineeData.name,
              competition_name: competitionName,
            },
          },
        })

        if (linkError) {
          console.error('generateLink failed:', JSON.stringify(linkError))
        } else if (linkData?.properties?.action_link) {
          magicLinkUrl = linkData.properties.action_link
          console.log('Magic link generated successfully for:', nomineeEmail)
        }
      } catch (linkErr) {
        console.error('Magic link generation error:', linkErr)
      }
    } else {
      console.log('New nominee — skipping magic link, will use plain claim URL')
    }

    const inviteResult = { method: 'onesignal_email' }

    // Create in-app notification if user already has an account
    if (existingUser) {
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          user_id: existingUser.id,
          type: 'nominated',
          title: "You've been nominated!",
          body: `Someone nominated you for ${competitionName}`,
          competition_id: competition.id,
          action_url: `/claim/${nomineeData.invite_token}`,
          metadata: {
            nominator_name: nomineeData.nominator_anonymous ? null : nomineeData.nominator_name,
            nomination_reason: nomineeData.nomination_reason,
          },
        })

      if (notifError) {
        console.error('Failed to create nomination notification:', notifError)
      }

      // Send push notification via OneSignal (fire-and-forget)
      fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          user_id: existingUser.id,
          type: 'nominee_invite',
          nominee_name: nomineeData.name,
          nominator_name: nomineeData.nominator_anonymous ? null : nomineeData.nominator_name,
          competition_name: competitionName,
          url: `/claim/${nomineeData.invite_token}`,
          data: { nominee_id: nomineeData.id, competition_id: competition.id },
        }),
      }).catch(err => console.warn('Push notification error (non-blocking):', err))
    }

    // ---- Send branded OneSignal emails ----
    // OneSignal is the primary email delivery channel. The magic link is
    // embedded in the branded email so only one email reaches the nominee.
    const sendOneSignalEmail = async (emailBody: Record<string, unknown>): Promise<{ success: boolean; error?: string; recipients?: number }> => {
      try {
        const osResponse = await fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(emailBody),
        })
        const osResult = await osResponse.json()
        if (!osResponse.ok) {
          console.error('OneSignal email failed:', JSON.stringify(osResult))
          return { success: false, error: JSON.stringify(osResult) }
        }
        console.log('OneSignal email sent:', JSON.stringify({
          type: emailBody.type,
          to: emailBody.to_email,
          onesignal_id: osResult.onesignal_id,
          recipients: osResult.recipients,
          retried: osResult.retried,
        }))
        return { success: true, recipients: osResult.recipients }
      } catch (osErr) {
        console.error('OneSignal email error:', osErr)
        return { success: false, error: String(osErr) }
      }
    }

    // Use the magic link as the CTA if available, otherwise fall back to
    // the plain claim URL (nominee will need to sign in separately).
    const nomineeCtaUrl = magicLinkUrl || claimUrl
    if (!magicLinkUrl) {
      console.warn('Using plain claim URL (no magic link) — nominee will need to create password during claim flow')
    }

    // Determine if this is a reminder vs fresh invite
    let isReminder = false
    let isSelfNomineeReminder = false

    // Incomplete self-nominee: started entry flow but didn't finish (no claimed_at)
    if (nomineeData.nominated_by === 'self' && !nomineeData.claimed_at) {
      isReminder = true
      isSelfNomineeReminder = true
    }
    // Third-party nominee who started the claim flow but didn't finish
    // (flow_stage is set beyond initial state, but no claimed_at yet)
    else if (!nomineeData.claimed_at && nomineeData.flow_stage &&
             ['accepted', 'details', 'bio', 'password', 'card'].includes(nomineeData.flow_stage)) {
      isReminder = true
    }
    // Nominee who accepted and has claimed_at but hasn't completed onboarding
    else if (nomineeData.claimed_at) {
      if (nomineeData.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarded_at')
          .eq('id', nomineeData.user_id)
          .maybeSingle()
        if (!profile?.onboarded_at) {
          isReminder = true
        }
      } else {
        // Accepted but no auth user created yet (dropped off before setting password)
        isReminder = true
      }
    }

    // 1) Branded nominee email via OneSignal (critical path)
    const emailType = isSelfNomineeReminder
      ? 'self_nominee_reminder'
      : isReminder ? 'nominee_reminder' : 'nominee_invite'
    const nomineeEmailResult = await sendOneSignalEmail({
      type: emailType,
      to_email: nomineeEmail,
      to_name: nomineeData.name,
      nominee_name: nomineeData.name,
      nominator_name: nomineeData.nominator_anonymous ? null : nomineeData.nominator_name,
      competition_name: competitionName,
      competition_id: competition.id,
      city_name: cityName,
      claim_url: nomineeCtaUrl,
      reason: nomineeData.nomination_reason,
      gender,
      nomination_end: nominationEnd,
    })

    if (!nomineeEmailResult.success) {
      console.error('Primary nominee email failed — returning error to caller')
      // Do NOT set invite_sent_at — the email didn't go out, so a retry
      // should be allowed without needing force_resend.
      return new Response(
        JSON.stringify({
          error: 'Failed to send nomination email via OneSignal',
          details: nomineeEmailResult.error,
          claim_url: claimUrl, // Provide claim URL for manual sharing
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Nominee email succeeded — mark invite_sent_at so we don't re-send.
    const { error: updateError } = await supabase
      .from('nominees')
      .update({ invite_sent_at: new Date().toISOString() })
      .eq('id', nominee_id)

    if (updateError) {
      console.error('Failed to update invite_sent_at:', updateError)
    }

    // 2) Confirmation email to the nominator (fire-and-forget, non-critical)
    // Only send on initial invite — not on reminders or force_resend
    if (nomineeData.nominator_email && !isReminder && !force_resend) {
      // Default the org slug so we never emit a bare /c/:id (not a real route).
      const orgSlug = competition.organization?.slug || 'most-eligible'
      const competitionUrl = `${appUrl}/${orgSlug}/${competition.slug || `id/${competition.id}`}`

      sendOneSignalEmail({
        type: 'nominator_confirm',
        to_email: nomineeData.nominator_email,
        to_name: nomineeData.nominator_name || 'Nominator',
        nominee_name: nomineeData.name,
        nominee_email: nomineeEmail || undefined,
        nominator_name: nomineeData.nominator_name,
        competition_name: competitionName,
        competition_id: competition.id,
        city_name: cityName,
        competition_url: competitionUrl,
      })
    }

    console.log('send-nomination-invite completed successfully:', JSON.stringify({
      nominee_id,
      nomineeEmail,
      ...inviteResult,
      claim_url: claimUrl,
    }))

    return new Response(
      JSON.stringify({
        success: true,
        sent_via: 'onesignal',
        ...inviteResult,
        nominee_id: nominee_id,
        claim_url: claimUrl, // Direct link for manual sharing if email fails
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in send-nomination-invite:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
