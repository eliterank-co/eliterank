import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Sends the instant "you're on the list" confirmation email after a user
// subscribes on a competition's coming-soon page. Fired from the client's
// useCompetitionSubscription hook. Caller identity is taken from the JWT in
// the Authorization header so a user can only trigger the email for
// themselves.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userId = userData.user.id

    const { competition_id: competitionId } = await req.json()
    if (!competitionId) {
      return new Response(JSON.stringify({ error: 'competition_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('email, first_name, last_name')
      .eq('id', userId)
      .single()
    if (profileError || !profile?.email) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: comp, error: compError } = await admin
      .from('competitions')
      .select('name, slug, nomination_start, organization:organizations(slug), city:cities(name)')
      .eq('id', competitionId)
      .single()
    if (compError || !comp) {
      return new Response(JSON.stringify({ error: 'Competition not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    type CompShape = {
      name?: string
      slug?: string
      nomination_start?: string | null
      organization?: { slug?: string } | null
      city?: { name?: string } | null
    }
    const compAny = comp as CompShape
    // Default the org slug so we never emit a bare /c/:id (not a real route).
    const orgSlug = compAny.organization?.slug || 'most-eligible'
    const competitionUrl = `${appUrl}/${orgSlug}/${compAny.slug || `id/${competitionId}`}`

    const toName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || undefined

    // The subscriber row id is what gets signed into the unsubscribe link.
    // The row was just created by the client's upsert before this function
    // ran, so it must exist.
    const { data: subRow } = await admin
      .from('competition_subscribers')
      .select('id')
      .eq('competition_id', competitionId)
      .eq('user_id', userId)
      .maybeSingle()

    const resp = await fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        type: 'subscriber_confirmation',
        to_email: profile.email,
        to_name: toName,
        competition_id: competitionId,
        competition_name: compAny.name || 'Most Eligible',
        city_name: compAny.city?.name || null,
        competition_url: competitionUrl,
        nomination_start: compAny.nomination_start || null,
        subscriber_id: subRow?.id || null,
      }),
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error('send-onesignal-email failed:', text)
      return new Response(JSON.stringify({ error: 'Email delivery failed', details: text }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-subscription-confirmation error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error', details: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
