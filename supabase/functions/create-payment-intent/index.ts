import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentRequest {
  competitionId: string
  contestantId: string
  voteCount: number
  voterEmail?: string
}

// Mirror of PRICE_BUNDLER_TIERS in src/types/competition.js. Kept inline
// because this Deno edge function can't import from the frontend bundle.
// If you edit the tiers, edit both places.
const PRICE_BUNDLER_TIERS = [
  { minVotes: 1,   maxVotes: 9,    pricePerVote: 1.00 },
  { minVotes: 10,  maxVotes: 19,   pricePerVote: 0.90 },
  { minVotes: 20,  maxVotes: 49,   pricePerVote: 0.85 },
  { minVotes: 50,  maxVotes: 99,   pricePerVote: 0.80 },
  { minVotes: 100, maxVotes: 249,  pricePerVote: 0.70 },
  { minVotes: 250, maxVotes: 499,  pricePerVote: 0.50 },
  { minVotes: 500, maxVotes: 1000, pricePerVote: 0.40 },
]

function bundledPricePerVote(voteCount: number, basePrice: number): number {
  const tier =
    PRICE_BUNDLER_TIERS.find((t) => voteCount >= t.minVotes && voteCount <= t.maxVotes) ||
    PRICE_BUNDLER_TIERS[PRICE_BUNDLER_TIERS.length - 1]
  return basePrice * tier.pricePerVote
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get request body
    const { competitionId, contestantId, voteCount, voterEmail }: PaymentRequest = await req.json()

    // Validate required fields
    if (!competitionId || !contestantId || !voteCount) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: competitionId, contestantId, voteCount' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (voteCount < 1 || voteCount > 1000) {
      return new Response(
        JSON.stringify({ error: 'Invalid vote count. Must be between 1 and 1000.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get environment variables
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured')
      return new Response(
        JSON.stringify({ error: 'Payment system not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Fetch competition to get vote price + the host org (merchant of record).
    const { data: competition, error: compError } = await supabase
      .from('competitions')
      .select('id, name, season, price_per_vote, use_price_bundler, status, platform_fee_pct, organization_id, tax_rate_pct, tax_label')
      .eq('id', competitionId)
      .single()

    if (compError || !competition) {
      return new Response(
        JSON.stringify({ error: 'Competition not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ── Strict Stripe Connect gate (§2.1, Invariant 1) ──────────────────────
    // Paid votes are DIRECT CHARGES on the host organization's connected
    // account — funds never pool in EliteRank's balance. The vote can only be
    // taken once that org has completed Stripe KYC and charges are enabled.
    if (!competition.organization_id) {
      return new Response(
        JSON.stringify({
          error: 'Paid voting isn’t available for this competition yet.',
          code: 'HOST_PAYOUTS_NOT_READY',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, stripe_connect_account_id, kyc_status, charges_enabled, default_currency, country')
      .eq('id', competition.organization_id)
      .single()

    const connectedAccountId = org?.stripe_connect_account_id
    if (
      orgError ||
      !org ||
      !connectedAccountId ||
      org.kyc_status !== 'verified' ||
      org.charges_enabled !== true
    ) {
      return new Response(
        JSON.stringify({
          error: 'Paid voting isn’t available for this competition yet. The host hasn’t finished setting up payouts.',
          code: 'HOST_PAYOUTS_NOT_READY',
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch contestant to verify they exist and belong to this competition
    const { data: contestant, error: contestantError } = await supabase
      .from('contestants')
      .select('id, name, competition_id')
      .eq('id', contestantId)
      .eq('competition_id', competitionId)
      .single()

    if (contestantError || !contestant) {
      return new Response(
        JSON.stringify({ error: 'Contestant not found in this competition' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Server is the source of truth for the Stripe amount. If the bundler is
    // on, apply the tier multiplier against the competition's base price.
    const basePrice = parseFloat(competition.price_per_vote) || 1.00
    const perVotePrice = competition.use_price_bundler
      ? bundledPricePerVote(voteCount, basePrice)
      : basePrice
    const subtotalAmount = Math.round(perVotePrice * voteCount * 100) // cents, pre-tax

    // Additive sales tax (e.g. Ontario HST 13%). Gated on the host org being
    // Canada AND the competition carrying a non-zero rate, so US competitions
    // and any untaxed competition are unaffected. The host is the merchant of
    // record on this direct charge, so the collected tax settles into their own
    // connected account for THEM to remit — EliteRank never holds or remits it.
    const taxRatePct =
      org.country === 'CA' ? (parseFloat(competition.tax_rate_pct) || 0) : 0
    const taxAmount = Math.round((subtotalAmount * taxRatePct) / 100) // cents
    const taxLabel = (competition.tax_label as string) || (taxRatePct > 0 ? 'Tax' : '')

    // Buyer pays subtotal + tax.
    const totalAmount = subtotalAmount + taxAmount

    // Resolve double-vote-day status so the Stripe description and receipt
    // reflect what the contestant actually gets credited (e.g. "200 points
    // (2× Double Vote Day)") instead of the raw purchase count. Without
    // this, customers paying $70 for 100 votes on a double day saw "100
    // points" on their statement while their contestant got 200 credited —
    // confusing and looks like short-changing.
    //
    // Important: metadata.vote_count stays as the raw purchase count.
    // stripe-webhook reads it and applies its own doubling at insert time;
    // doubling it here would compound to 4×.
    const { data: isDoubleRpc } = await supabase.rpc('is_double_vote_day', {
      p_competition_id: competitionId,
    })
    const isDoubleVoteDay = isDoubleRpc === true
    const creditedVoteCount = isDoubleVoteDay ? voteCount * 2 : voteCount
    const compName = competition.name || `Season ${competition.season}`
    const description = isDoubleVoteDay
      ? `${creditedVoteCount} points (2× Double Vote Day) for ${contestant.name} in ${compName}`
      : `${creditedVoteCount} point${creditedVoteCount > 1 ? 's' : ''} for ${contestant.name} in ${compName}`

    // Initialize Stripe
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // EliteRank's platform fee (§2, §6.14), taken as a Stripe application fee
    // on the direct charge. The host's connected account keeps the rest.
    //
    // IMPORTANT: the fee base is the PRE-TAX subtotal, never the tax-inclusive
    // total. Collected HST belongs to the host's CRA remittance; skimming a
    // platform cut off the tax would leave the host short at remittance time
    // and is not the platform's money. See migration 122.
    const platformFeePct = parseFloat(competition.platform_fee_pct) || 0
    const applicationFeeAmount = Math.round((subtotalAmount * platformFeePct) / 100)

    // Charge in the host's settlement currency. Direct charges settle in the
    // connected account's own country/currency (US → usd, Ontario/CA → cad), so
    // this must match the account rather than being hardcoded. Defaults to usd
    // for every existing US host (default_currency defaults to 'usd').
    const currency = (org.default_currency as string) || 'usd'

    // Create the PaymentIntent as a DIRECT CHARGE on the host's connected
    // account (Stripe-Account header). Funds settle to the host, never to the
    // platform balance (§2.1, Invariant 1); EliteRank takes only the
    // application fee. The client must confirm this PI with a Stripe.js
    // instance initialized for `connectedAccountId`.
    const paymentIntent = await stripe.paymentIntents.create(
      {
        amount: totalAmount,
        currency,
        automatic_payment_methods: {
          enabled: true,
        },
        application_fee_amount: applicationFeeAmount,
        metadata: {
          competition_id: competitionId,
          contestant_id: contestantId,
          vote_count: voteCount.toString(),
          voter_email: voterEmail || '',
          competition_name: compName,
          contestant_name: contestant.name,
          is_double_vote_day: isDoubleVoteDay ? 'true' : 'false',
          credited_vote_count: creditedVoteCount.toString(),
          organization_id: competition.organization_id,
          connected_account_id: connectedAccountId,
          platform_fee_amount: applicationFeeAmount.toString(),
          currency,
          // Tax accounting (cents). The webhook records tax_amount on the vote
          // row and itemizes it on the receipt. subtotal = amount - tax.
          subtotal_amount: subtotalAmount.toString(),
          tax_amount: taxAmount.toString(),
          tax_rate_pct: taxRatePct.toString(),
          tax_label: taxLabel,
        },
        description,
      },
      { stripeAccount: connectedAccountId }
    )

    return new Response(
      JSON.stringify({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        amount: totalAmount,
        subtotal: subtotalAmount,
        taxAmount,
        taxRatePct,
        taxLabel,
        currency,
        voteCount,
        contestantName: contestant.name,
        connectedAccountId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error creating payment intent:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to create payment', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
