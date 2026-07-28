import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

/**
 * Send a vote receipt email to the paid voter.
 * Fetches contestant/competition details and current rank, then fires the email.
 */
async function sendVoteReceiptEmail(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  params: {
    voterEmail: string
    contestantId: string
    competitionId: string
    voteCount: number
    purchasedVoteCount: number
    wasDoubled: boolean
    amountPaid: number
    hasAccount: boolean
  }
) {
  const { voterEmail, contestantId, competitionId, voteCount, purchasedVoteCount, wasDoubled, amountPaid, hasAccount } = params
  const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

  // Fetch contestant with competition details
  const { data: contestant, error: contestantError } = await supabase
    .from('contestants')
    .select(`
      id, name, user_id, rank,
      competition:competitions(
        id, name, slug,
        organization:organizations(slug)
      )
    `)
    .eq('id', contestantId)
    .maybeSingle()

  if (contestantError || !contestant) {
    console.warn('Could not fetch contestant for receipt email:', contestantError?.message)
    return
  }

  const competition = contestant.competition as {
    id: string
    name: string | null
    slug: string | null
    organization: { slug: string | null } | null
  } | null

  // Get current voting round end date
  const nowIso = new Date().toISOString()
  const { data: currentRound } = await supabase
    .from('voting_rounds')
    .select('end_date')
    .eq('competition_id', competitionId)
    .in('round_type', ['voting', 'finale'])
    .lte('start_date', nowIso)
    .gt('end_date', nowIso)
    .limit(1)
    .maybeSingle()

  // Build URLs
  const orgSlug = competition?.organization?.slug || 'most-eligible'
  const competitionSlug = competition?.slug
  const competitionUrl = competitionSlug
    ? `${appUrl}/${orgSlug}/${competitionSlug}`
    : appUrl
  const profileUrl = contestant.user_id
    ? `${appUrl}/profile/${contestant.user_id}`
    : competitionUrl
  const signupUrl = `${appUrl}/signup?returnTo=${encodeURIComponent(profileUrl)}`

  // Send the email
  const emailPayload = {
    type: 'vote_receipt',
    to_email: voterEmail,
    contestant_name: contestant.name,
    competition_name: competition?.name || 'Most Eligible',
    competition_id: competition?.id,
    competition_url: competitionUrl,
    profile_url: profileUrl,
    rank: contestant.rank,
    vote_count: voteCount,
    purchased_vote_count: purchasedVoteCount,
    was_doubled: wasDoubled,
    amount_paid: amountPaid,
    voting_round_end: currentRound?.end_date || null,
    signup_url: signupUrl,
    is_anonymous: !hasAccount,
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/send-onesignal-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(emailPayload),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Email send failed: ${res.status} ${text.slice(0, 200)}`)
  }

  console.log(`Vote receipt email sent to ${voterEmail} for ${voteCount} votes`)
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get environment variables
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // We receive events from TWO Stripe webhook endpoints that POST to this same
    // function URL, each with its OWN signing secret:
    //   1. The platform endpoint (STRIPE_WEBHOOK_SECRET) — platform-account
    //      events (legacy/transition vote payments, payment_intent.payment_failed).
    //   2. The Connect endpoint (STRIPE_WEBHOOK_SECRET_CONNECT) — connected-account
    //      events: account.updated (host KYC sync, §5.1) and the direct-charge
    //      payment_intent.succeeded that credits paid votes (§5.4).
    // A single secret can't verify both, so we try each configured secret and
    // accept the first that validates. Add the second secret in Supabase →
    // Edge Functions → Secrets as STRIPE_WEBHOOK_SECRET_CONNECT.
    const webhookSecrets = [
      Deno.env.get('STRIPE_WEBHOOK_SECRET'),
      Deno.env.get('STRIPE_WEBHOOK_SECRET_CONNECT'),
    ].filter((s): s is string => !!s)

    if (!stripeSecretKey || webhookSecrets.length === 0) {
      console.error('Stripe configuration missing')
      return new Response(
        JSON.stringify({ error: 'Webhook not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // Get the signature from headers
    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response(
        JSON.stringify({ error: 'Missing stripe-signature header' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get the raw body for signature verification
    const body = await req.text()

    // Verify the webhook signature.
    // Deno's Web Crypto is async-only, so we must use constructEventAsync.
    // The synchronous constructEvent throws under Deno and is the root cause
    // of the 100% 400 rate observed on this endpoint.
    // Try each configured signing secret (platform + Connect) and accept the
    // first that validates the signature.
    let event: Stripe.Event | null = null
    let lastErr: unknown = null
    for (const secret of webhookSecrets) {
      try {
        event = await stripe.webhooks.constructEventAsync(body, signature, secret)
        break
      } catch (err) {
        lastErr = err
      }
    }
    if (!event) {
      console.error('Webhook signature verification failed:', lastErr instanceof Error ? lastErr.message : lastErr)
      return new Response(
        JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('Payment succeeded:', paymentIntent.id)

        // Extract metadata
        const {
          competition_id,
          contestant_id,
          vote_count,
          voter_email,
        } = paymentIntent.metadata

        if (!competition_id || !contestant_id || !vote_count) {
          console.error('Missing metadata in payment intent:', paymentIntent.id)
          return new Response(
            JSON.stringify({ error: 'Missing payment metadata' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // For anonymous paid votes the client doesn't collect an email — the
        // buyer enters it in the Stripe PaymentElement instead. Fall back to
        // the charge's billing_details.email so the vote can still be
        // attributed (and later claimed via magic link).
        let resolvedVoterEmail = voter_email || ''
        if (!resolvedVoterEmail && paymentIntent.latest_charge) {
          try {
            const chargeId = typeof paymentIntent.latest_charge === 'string'
              ? paymentIntent.latest_charge
              : paymentIntent.latest_charge.id
            // Direct charges live on the host's connected account, so the
            // charge must be retrieved in that account's context (event.account
            // is set for Connect events).
            const charge = event.account
              ? await stripe.charges.retrieve(chargeId, { stripeAccount: event.account })
              : await stripe.charges.retrieve(chargeId)
            resolvedVoterEmail = charge.billing_details?.email || ''
          } catch (err) {
            console.warn('Could not retrieve charge for billing email:', err)
          }
        }
        // Syntax validation — reject anything obviously malformed.
        if (resolvedVoterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(resolvedVoterEmail)) {
          console.warn('Discarding malformed voter email:', resolvedVoterEmail)
          resolvedVoterEmail = ''
        }

        const purchasedVoteCount = parseInt(vote_count, 10)
        const amountPaid = paymentIntent.amount / 100 // Convert from cents to dollars

        // Check if this payment has already been processed (idempotency)
        const { data: existingVote } = await supabase
          .from('votes')
          .select('id')
          .eq('payment_intent_id', paymentIntent.id)
          .single()

        if (existingVote) {
          console.log('Payment already processed:', paymentIntent.id)
          return new Response(
            JSON.stringify({ received: true, status: 'already_processed' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Check if today is a host-scheduled double vote day for this competition.
        // is_double_vote_day uses the competition's stored timezone, so a host
        // in LA picking April 28 gets activation across the LA calendar day,
        // not UTC's. See migration 051_competition_timezone_and_helpers.sql.
        const { data: isDoubleRpc } = await supabase.rpc('is_double_vote_day', {
          p_competition_id: competition_id,
        })
        const isDoubleVoteDay = isDoubleRpc === true
        const voteCount = isDoubleVoteDay ? purchasedVoteCount * 2 : purchasedVoteCount

        // Record the paid votes
        const { error: voteError } = await supabase
          .from('votes')
          .insert({
            competition_id,
            contestant_id,
            voter_email: resolvedVoterEmail || null,
            vote_count: voteCount,
            amount_paid: amountPaid,
            currency: paymentIntent.currency,
            payment_intent_id: paymentIntent.id,
            is_double_vote: isDoubleVoteDay,
          })

        if (voteError) {
          console.error('Failed to record vote:', voteError)
          return new Response(
            JSON.stringify({ error: 'Failed to record vote', details: voteError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // The on_vote_insert DB trigger updates contestants.votes and
        // competitions.total_votes atomically with the insert above.

        console.log(`Recorded ${voteCount} paid votes for contestant ${contestant_id}`)

        // Send vote receipt email (fire-and-forget — don't block the webhook response)
        if (resolvedVoterEmail) {
          sendVoteReceiptEmail(supabase, supabaseUrl, supabaseServiceKey, {
            voterEmail: resolvedVoterEmail,
            contestantId: contestant_id,
            competitionId: competition_id,
            voteCount,
            purchasedVoteCount,
            wasDoubled: isDoubleVoteDay,
            amountPaid,
            hasAccount: !!voter_email, // If voter_email was in metadata, they were logged in
          }).catch(err => {
            console.warn('Vote receipt email failed (non-fatal):', err?.message || err)
          })
        }

        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('Payment failed:', paymentIntent.id, paymentIntent.last_payment_error?.message)
        // Could log this for analytics, but no action needed
        break
      }

      // Stripe Connect: a host's Express account changed (KYC progressed,
      // capabilities enabled/disabled, requirements updated). Mirror the
      // capability flags + derived kyc_status onto the organization so the
      // host dashboard reflects reality without polling (§5.1, Invariant 15:
      // we store status only, never raw identity).
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        console.log('Connect account updated:', account.id)

        const disabledReason = account.requirements?.disabled_reason || ''
        let kycStatus: 'not_started' | 'pending' | 'verified' | 'failed'
        if (account.charges_enabled && account.payouts_enabled) {
          kycStatus = 'verified'
        } else if (disabledReason.startsWith('rejected')) {
          kycStatus = 'failed'
        } else if (account.details_submitted) {
          kycStatus = 'pending'
        } else {
          kycStatus = 'not_started'
        }

        // Only set connect_onboarded_at the first time it verifies.
        const { data: existingOrg } = await supabase
          .from('organizations')
          .select('id, connect_onboarded_at')
          .eq('stripe_connect_account_id', account.id)
          .maybeSingle()

        if (!existingOrg) {
          console.warn('account.updated for unknown connected account:', account.id)
          break
        }

        const update: Record<string, unknown> = {
          kyc_status: kycStatus,
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          connect_details_submitted: account.details_submitted,
        }
        if (kycStatus === 'verified' && !existingOrg.connect_onboarded_at) {
          update.connect_onboarded_at = new Date().toISOString()
        }

        const { error: orgUpdateError } = await supabase
          .from('organizations')
          .update(update)
          .eq('stripe_connect_account_id', account.id)

        if (orgUpdateError) {
          console.error('Failed to sync connect account status:', orgUpdateError)
          return new Response(
            JSON.stringify({ error: 'Failed to sync account', details: orgUpdateError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        console.log(`Synced connect account ${account.id} → kyc_status=${kycStatus}`)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return new Response(
      JSON.stringify({ received: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(
      JSON.stringify({ error: 'Webhook handler failed', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
