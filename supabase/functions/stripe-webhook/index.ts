import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

function parseCapturedVoteMultiplier(metadata: Record<string, string>): number | null {
  const raw = metadata.vote_multiplier
  if (raw === undefined || raw === '') {
    return metadata.is_double_vote_day === 'true' ? 2 : 1
  }

  const multiplier = Number(raw)
  return Number.isInteger(multiplier) && multiplier >= 1 && multiplier <= 10
    ? multiplier
    : null
}

/**
 * Live standing rank for a contestant: their position by votes WITHIN their
 * gender when the competition splits winners by gender, or overall otherwise.
 * Mirrors the public leaderboard and finalize_voting_round's per-gender
 * partition, and replaces the global, host-curated `contestants.rank` column
 * (which is NULL unless a host manually reordered the roster, and never
 * per-gender).
 */
async function computeLiveGenderRank(
  supabase: ReturnType<typeof createClient>,
  competitionId: string,
  contestantId: string,
  splitByGender: boolean,
  gender: string | null,
): Promise<number | null> {
  const { data: roster } = await supabase
    .from('contestants')
    .select('id, votes, gender')
    .eq('competition_id', competitionId)
    .eq('status', 'active')
  if (!roster) return null
  const rows = roster as Array<{ id: string; votes: number | null; gender: string | null }>
  const pool = splitByGender ? rows.filter((c) => c.gender === gender) : rows
  pool.sort((a, b) => (b.votes || 0) - (a.votes || 0))
  const idx = pool.findIndex((c) => c.id === contestantId)
  return idx >= 0 ? idx + 1 : null
}

/**
 * Send a vote receipt email to the paid voter.
 * Fetches contestant/competition details and current rank, then fires the email.
 *
 * When tax was collected (taxAmount > 0) the receipt is a COMPLIANT tax receipt:
 * it itemizes subtotal + tax, and prints the host's legal name, tax registration
 * number, and address (fetched fresh from the host org) as the vendor of record.
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
    // Tax receipt fields (present only for taxed purchases)
    subtotalAmount?: number
    taxAmount?: number
    taxRatePct?: number
    taxLabel?: string
    currency?: string
    receiptNumber?: string
  }
) {
  const {
    voterEmail, contestantId, competitionId, voteCount, purchasedVoteCount, wasDoubled, amountPaid, hasAccount,
    subtotalAmount, taxAmount, taxRatePct, taxLabel, currency, receiptNumber,
  } = params
  const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

  // Fetch contestant with competition + host org details. The org's legal name,
  // tax registration number and address are the vendor identity printed on a
  // compliant tax receipt.
  const { data: contestant, error: contestantError } = await supabase
    .from('contestants')
    .select(`
      id, name, user_id, rank, gender,
      competition:competitions(
        id, name, slug, winners_split_by_gender,
        organization:organizations(slug, name, legal_entity_name, tax_registration_number, tax_address, default_currency)
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
    winners_split_by_gender: boolean | null
    organization: {
      slug: string | null
      name: string | null
      legal_entity_name: string | null
      tax_registration_number: string | null
      tax_address: string | null
      default_currency: string | null
    } | null
  } | null

  // Standing shown in the receipt: live position by votes, per-gender when the
  // competition splits winners by gender (consistent with the public
  // leaderboard) rather than the global host-curated contestants.rank column.
  const liveRank = await computeLiveGenderRank(
    supabase,
    competitionId,
    contestant.id as string,
    !!competition?.winners_split_by_gender,
    (contestant as { gender: string | null }).gender ?? null,
  )

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

  const org = competition?.organization
  const hasTax = typeof taxAmount === 'number' && taxAmount > 0

  // Send the email
  const emailPayload = {
    type: 'vote_receipt',
    to_email: voterEmail,
    contestant_name: contestant.name,
    competition_name: competition?.name || 'Most Eligible',
    competition_id: competition?.id,
    competition_url: competitionUrl,
    profile_url: profileUrl,
    rank: liveRank,
    vote_count: voteCount,
    purchased_vote_count: purchasedVoteCount,
    was_doubled: wasDoubled,
    amount_paid: amountPaid,
    voting_round_end: currentRound?.end_date || null,
    signup_url: signupUrl,
    is_anonymous: !hasAccount,
    // Tax receipt fields — the email template renders an itemized tax block +
    // vendor identity when tax_amount > 0.
    currency: currency || org?.default_currency || 'usd',
    subtotal_amount: hasTax ? subtotalAmount : undefined,
    tax_amount: hasTax ? taxAmount : undefined,
    tax_rate_pct: hasTax ? taxRatePct : undefined,
    tax_label: hasTax ? (taxLabel || 'Tax') : undefined,
    receipt_number: hasTax ? receiptNumber : undefined,
    vendor_legal_name: hasTax ? (org?.legal_entity_name || org?.name || undefined) : undefined,
    vendor_tax_number: hasTax ? (org?.tax_registration_number || undefined) : undefined,
    vendor_address: hasTax ? (org?.tax_address || undefined) : undefined,
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

/**
 * Human-facing receipt number, e.g. HST-20260812-9F3A21. Unique + traceable
 * (the last segment is derived from the PaymentIntent id). Not a strict per-host
 * sequence — see follow-up if the host's bookkeeping needs gap-free numbering.
 */
function makeReceiptNumber(prefix: string, paymentIntentId: string): string {
  const d = new Date()
  const ymd = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
  const tail = paymentIntentId.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase()
  return `${(prefix || 'RCPT').toUpperCase()}-${ymd}-${tail}`
}

/**
 * Emit exactly one tax receipt per paid vote, even across the client-side +
 * webhook insert race and Stripe webhook retries. We ATOMICALLY claim the row
 * (set receipt_sent_at where it is still null) and only send if we won the
 * claim; if the send fails we release the claim so a later retry can resend.
 */
async function claimAndSendTaxReceipt(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  serviceKey: string,
  voteId: string,
  paymentIntentId: string,
  emailParams: Parameters<typeof sendVoteReceiptEmail>[3],
) {
  const receiptNumber = makeReceiptNumber(emailParams.taxLabel || 'RCPT', paymentIntentId)
  const { data: claimed } = await supabase
    .from('votes')
    .update({ receipt_sent_at: new Date().toISOString(), receipt_number: receiptNumber })
    .eq('id', voteId)
    .is('receipt_sent_at', null)
    .select('id')
    .maybeSingle()

  // Another delivery (or the concurrent client/webhook peer) already claimed it.
  if (!claimed) return

  try {
    await sendVoteReceiptEmail(supabase, supabaseUrl, serviceKey, { ...emailParams, receiptNumber })
  } catch (err) {
    // Release the claim so a subsequent webhook retry can resend the receipt.
    await supabase.from('votes')
      .update({ receipt_sent_at: null, receipt_number: null })
      .eq('id', voteId)
    throw err
  }
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

        // Tax accounting from metadata (cents → dollars). subtotal falls back to
        // (total - tax) for older PaymentIntents created before tax metadata.
        const taxAmount = (parseInt(paymentIntent.metadata.tax_amount || '0', 10) || 0) / 100
        const subtotalAmount = paymentIntent.metadata.subtotal_amount
          ? (parseInt(paymentIntent.metadata.subtotal_amount, 10) || 0) / 100
          : Math.max(0, amountPaid - taxAmount)
        const taxRatePct = parseFloat(paymentIntent.metadata.tax_rate_pct || '0') || 0
        const taxLabel = paymentIntent.metadata.tax_label || (taxAmount > 0 ? 'Tax' : '')
        const isTaxed = taxAmount > 0

        // Check if this payment has already been processed (idempotency). We also
        // read receipt_sent_at so that if the client-side insert won the race, the
        // webhook can still guarantee the (compliant) tax receipt goes out once.
        const { data: existingVote } = await supabase
          .from('votes')
          .select('id, receipt_sent_at')
          .eq('payment_intent_id', paymentIntent.id)
          .maybeSingle()

        if (existingVote) {
          console.log('Payment already processed:', paymentIntent.id)
          // The vote is recorded (likely by the client), but for taxed purchases
          // the compliant receipt is only ever sent from here — send it once.
          if (isTaxed && !existingVote.receipt_sent_at && resolvedVoterEmail) {
            // Terms are immutable after intent creation. Existing intents may
            // predate the 3x scheduling cap, so fulfil their persisted 1–10x
            // multiplier rather than silently under-crediting captured money.
            const multiplier = parseCapturedVoteMultiplier(paymentIntent.metadata)
            if (multiplier === null) {
              return new Response(
                JSON.stringify({ error: 'Invalid captured vote multiplier' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
            const isDoubled = multiplier > 1
            const creditedCount = purchasedVoteCount * multiplier
            claimAndSendTaxReceipt(supabase, supabaseUrl, supabaseServiceKey, existingVote.id, paymentIntent.id, {
              voterEmail: resolvedVoterEmail,
              contestantId: contestant_id,
              competitionId: competition_id,
              voteCount: creditedCount,
              purchasedVoteCount,
              wasDoubled: isDoubled,
              amountPaid,
              hasAccount: !!voter_email,
              subtotalAmount,
              taxAmount,
              taxRatePct,
              taxLabel,
              currency: paymentIntent.currency,
            }).catch(err => {
              console.warn('Tax receipt (already-processed path) failed (non-fatal):', err?.message || err)
            })
          }
          return new Response(
            JSON.stringify({ received: true, status: 'already_processed' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Persist intent-time terms; never recalculate a boost at webhook time.
        // A promotion can end between checkout and Stripe delivery.
        const multiplier = parseCapturedVoteMultiplier(paymentIntent.metadata)
        if (multiplier === null) {
          return new Response(
            JSON.stringify({ error: 'Invalid captured vote multiplier' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        const isDoubleVoteDay = multiplier > 1
        const voteCount = purchasedVoteCount * multiplier

        // Record the paid votes
        const { data: insertedVote, error: voteError } = await supabase
          .from('votes')
          .insert({
            competition_id,
            contestant_id,
            voter_email: resolvedVoterEmail || null,
            vote_count: voteCount,
            amount_paid: amountPaid,
            tax_amount: taxAmount,
            currency: paymentIntent.currency,
            payment_intent_id: paymentIntent.id,
            is_double_vote: isDoubleVoteDay,
          })
          .select('id')
          .single()

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

        // Send vote receipt email (fire-and-forget — don't block the webhook response).
        // Taxed purchases get the compliant, itemized tax receipt via the
        // claim-once path (so it's sent exactly once regardless of who inserted
        // the row); untaxed purchases keep the existing plain receipt behavior.
        if (resolvedVoterEmail && isTaxed) {
          claimAndSendTaxReceipt(supabase, supabaseUrl, supabaseServiceKey, insertedVote.id, paymentIntent.id, {
            voterEmail: resolvedVoterEmail,
            contestantId: contestant_id,
            competitionId: competition_id,
            voteCount,
            purchasedVoteCount,
            wasDoubled: isDoubleVoteDay,
            amountPaid,
            hasAccount: !!voter_email,
            subtotalAmount,
            taxAmount,
            taxRatePct,
            taxLabel,
            currency: paymentIntent.currency,
          }).catch(err => {
            console.warn('Tax receipt email failed (non-fatal):', err?.message || err)
          })
        } else if (resolvedVoterEmail) {
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
