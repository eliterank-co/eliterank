import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * notify-nominator — Sends email notifications to the nominator about their
 * nominee's status changes (accepted, declined, etc.)
 *
 * Called from the client after a nominee accepts or declines.
 * Checks `nominator_notify` preference before sending.
 *
 * Body: { nominee_id: string, event: 'accepted' | 'declined' }
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { nominee_id, event } = await req.json()
    console.log('notify-nominator called:', JSON.stringify({ nominee_id, event }))

    if (!nominee_id || !event) {
      return new Response(
        JSON.stringify({ error: 'nominee_id and event are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['accepted', 'declined'].includes(event)) {
      return new Response(
        JSON.stringify({ error: 'event must be "accepted" or "declined"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Fetch nominee with competition info
    const { data: nominee, error: fetchError } = await supabase
      .from('nominees')
      .select(`
        id,
        name,
        nominator_email,
        nominator_name,
        nominator_anonymous,
        nominator_notify,
        nominated_by,
        competition:competitions(id, name, slug, season, city:cities(name), organization:organizations(slug))
      `)
      .eq('id', nominee_id)
      .single()

    if (fetchError || !nominee) {
      console.error('Nominee not found:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Nominee not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Only send for third-party nominations with a nominator email
    if (nominee.nominated_by !== 'third_party' || !nominee.nominator_email) {
      console.log('Not a third-party nomination or no nominator email, skipping')
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'not_third_party_or_no_email' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check nominator_notify preference (default true if not set)
    if (nominee.nominator_notify === false) {
      console.log('Nominator opted out of notifications, skipping')
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'nominator_opted_out' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const competition = nominee.competition as any
    const cityName = competition?.city?.name || 'Unknown'
    const competitionName = competition?.name || 'the competition'
    // Public competition pages live at /:orgSlug/:slug (or /:orgSlug/id/:id).
    // A bare /c/:id is NOT a real route. competitionPath is reused for the
    // email CTA, the in-app notification, and the push deep link.
    const orgSlug = competition?.organization?.slug || 'most-eligible'
    const competitionPath = `/${orgSlug}/${competition?.slug || `id/${competition?.id || ''}`}`
    const competitionUrl = `${appUrl}${competitionPath}`

    // Determine email type
    const emailType = event === 'accepted' ? 'nominee_accepted' : 'nominee_declined'

    // Send via OneSignal email function
    const emailBody = {
      type: emailType,
      to_email: nominee.nominator_email,
      to_name: nominee.nominator_name || 'Nominator',
      nominee_name: nominee.name,
      nominator_name: nominee.nominator_name,
      competition_name: competitionName,
      competition_id: competition?.id,
      city_name: cityName,
      competition_url: competitionUrl,
    }

    console.log('Sending nominator notification:', JSON.stringify({ type: emailType, to: nominee.nominator_email }))

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
      console.warn('OneSignal email failed:', JSON.stringify(osResult))
    } else {
      console.log('Nominator notification sent successfully')
    }

    // Also create an in-app notification for the nominator if they have an account
    if (nominee.nominator_email) {
      const { data: nominatorProfile } = await supabase
        .from('profiles')
        .select('id')
        .ilike('email', nominee.nominator_email)
        .maybeSingle()

      if (nominatorProfile?.id) {
        const notifTitle = event === 'accepted'
          ? `${nominee.name} accepted your nomination!`
          : `${nominee.name} declined your nomination`
        const notifBody = event === 'accepted'
          ? `${nominee.name} accepted their nomination for ${competitionName}! Our team is reviewing their submission — we'll let you know if they're approved as an official contestant.`
          : `${nominee.name} has decided not to enter ${competitionName} at this time.`

        await supabase
          .from('notifications')
          .insert({
            user_id: nominatorProfile.id,
            type: event === 'accepted' ? 'nominee_accepted' : 'nominee_declined',
            title: notifTitle,
            body: notifBody,
            competition_id: competition?.id,
            action_url: event === 'accepted' ? competitionPath : null,
            metadata: { nominee_name: nominee.name },
          })
          .then(({ error }) => {
            if (error) console.warn('Failed to create in-app notification:', error)
          })

        // Send push notification via OneSignal (fire-and-forget)
        fetch(`${supabaseUrl}/functions/v1/send-push-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            user_id: nominatorProfile.id,
            type: event === 'accepted' ? 'nominee_accepted' : 'nominee_declined',
            nominee_name: nominee.name,
            competition_name: competitionName,
            url: event === 'accepted' ? competitionPath : null,
            data: { nominee_id: nominee.id, competition_id: competition?.id, event },
          }),
        }).catch(err => console.warn('Push notification error (non-blocking):', err))
      }
    }

    return new Response(
      JSON.stringify({ success: true, event, nominator_email: nominee.nominator_email }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in notify-nominator:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
