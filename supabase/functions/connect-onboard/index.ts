import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * connect-onboard
 *
 * Stripe Connect Express onboarding for a HOST ORGANIZATION (the Sponsor of
 * record, §1.1). This is the Phase 0 "stripe connection" foundation (§5.1) —
 * it creates/links the host's Express account and reads back KYC status. It
 * does NOT move any money; the direct-charge retrofit (§5.4) is separate.
 *
 * INVARIANT 15 (§13.4): this function NEVER collects or stores a raw SSN/EIN.
 * The host enters their tax ID + identity directly into Stripe's hosted
 * onboarding; Stripe verifies and holds them. We persist `kyc_status` + a few
 * non-sensitive capability flags only.
 *
 * Auth: requires a logged-in user who is the org's `owner_id`, OR (for legacy
 * orgs where owner_id is still NULL) a host of a competition under that org —
 * in which case ownership is claimed on first connect.
 *
 * Actions (POST JSON):
 *   { action: 'create_account_link', organization_id, return_url, refresh_url }
 *     → creates the Express account if needed, returns { url } to Stripe's
 *       hosted onboarding.
 *   { action: 'sync_status', organization_id }
 *     → retrieves the account from Stripe, recomputes kyc_status, persists it,
 *       returns the current connection status.
 */

// ── Payout timing (§9.3) ───────────────────────────────────────────────────
// Every host's connected account is created with a UNIFORM rolling payout
// delay: each charge is held in the host's OWN Stripe balance for this many
// days before Stripe automatically pays it out to their bank. This is not a
// discretionary hold — it is the same fixed schedule for every host, the funds
// never leave the host's balance, and EliteRank never triggers or reverses a
// payout. Its purpose is to keep funds available to cover the refunds/disputes
// the host is responsible for under §13 (our last real dispute landed 8 days
// after a competition ended, so the window comfortably outlasts that).
const PAYOUT_DELAY_DAYS = Number(Deno.env.get('HOST_PAYOUT_DELAY_DAYS') || '14')

type KycStatus = 'not_started' | 'pending' | 'verified' | 'failed'

function deriveKycStatus(account: Stripe.Account): KycStatus {
  if (account.charges_enabled && account.payouts_enabled) return 'verified'
  const requirements = account.requirements
  // currently_due / past_due with a disabled_reason that isn't just
  // "pending verification" means Stripe rejected or needs action it can't get.
  const disabledReason = requirements?.disabled_reason || ''
  if (disabledReason.startsWith('rejected')) return 'failed'
  if (account.details_submitted) return 'pending'
  return 'not_started'
}

function statusPayload(org: Record<string, unknown>) {
  return {
    kyc_status: org.kyc_status,
    charges_enabled: org.charges_enabled,
    payouts_enabled: org.payouts_enabled,
    details_submitted: org.connect_details_submitted,
    has_account: !!org.stripe_connect_account_id,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    const appUrl = Deno.env.get('APP_URL') || 'https://eliterank.co'

    if (!stripeSecretKey) {
      console.error('STRIPE_SECRET_KEY not configured')
      return json({ error: 'Payment system not configured' }, 500)
    }

    // ── Authenticate the caller ────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing authorization' }, 401)
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: userData, error: userError } = await userClient.auth.getUser()
    if (userError || !userData?.user) {
      return json({ error: 'Invalid session' }, 401)
    }
    const userId = userData.user.id

    const { action, organization_id, return_url, refresh_url } = await req.json()
    if (!action || !organization_id) {
      return json({ error: 'action and organization_id are required' }, 400)
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // ── Load org + authorize ───────────────────────────────────────────────
    const { data: org, error: orgError } = await admin
      .from('organizations')
      .select(
        'id, name, owner_id, stripe_connect_account_id, kyc_status, charges_enabled, payouts_enabled, connect_details_submitted, connect_onboarded_at'
      )
      .eq('id', organization_id)
      .single()

    if (orgError || !org) {
      return json({ error: 'Organization not found' }, 404)
    }

    // Authorize: the org owner, OR any host / co-host of a competition under
    // this org (they manage the org's single shared Connect account). For
    // legacy orgs with no owner yet, the first such manager claims ownership.
    let isAuthorized = org.owner_id === userId
    if (!isAuthorized) {
      const { count: hostCount } = await admin
        .from('competitions')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .eq('host_id', userId)
      let managesOrg = (hostCount ?? 0) > 0

      if (!managesOrg) {
        const { data: orgComps } = await admin
          .from('competitions')
          .select('id')
          .eq('organization_id', organization_id)
        const compIds = (orgComps || []).map((c) => c.id)
        if (compIds.length > 0) {
          const { count: coHostCount } = await admin
            .from('competition_co_hosts')
            .select('competition_id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('competition_id', compIds)
          managesOrg = (coHostCount ?? 0) > 0
        }
      }

      if (managesOrg) {
        isAuthorized = true
        if (!org.owner_id) {
          await admin.from('organizations').update({ owner_id: userId }).eq('id', organization_id)
          org.owner_id = userId
        }
      }
    }
    if (!isAuthorized) {
      return json({ error: 'Not authorized to manage payouts for this organization' }, 403)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
      httpClient: Stripe.createFetchHttpClient(),
    })

    // ── Ensure an Express account exists ───────────────────────────────────
    let accountId = org.stripe_connect_account_id as string | null
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_profile: {
          name: org.name || undefined,
        },
        settings: {
          payouts: {
            schedule: { interval: 'daily', delay_days: PAYOUT_DELAY_DAYS },
          },
        },
        metadata: {
          organization_id: organization_id,
          platform: 'eliterank',
        },
      })
      accountId = account.id
      await admin
        .from('organizations')
        .update({ stripe_connect_account_id: accountId, kyc_status: 'pending' })
        .eq('id', organization_id)
    }

    // ── Action: create_account_link ────────────────────────────────────────
    if (action === 'create_account_link') {
      const base = appUrl.replace(/\/$/, '')
      const ret = return_url || `${base}/dashboard?connect=return&org=${organization_id}`
      const refresh = refresh_url || `${base}/dashboard?connect=refresh&org=${organization_id}`

      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        return_url: ret,
        refresh_url: refresh,
        type: 'account_onboarding',
      })

      return json({ url: accountLink.url, account_id: accountId })
    }

    // ── Action: sync_status ────────────────────────────────────────────────
    if (action === 'sync_status') {
      const account = await stripe.accounts.retrieve(accountId)
      const kycStatus = deriveKycStatus(account)

      const update: Record<string, unknown> = {
        kyc_status: kycStatus,
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        connect_details_submitted: account.details_submitted,
      }
      if (kycStatus === 'verified' && !org.connect_onboarded_at) {
        update.connect_onboarded_at = new Date().toISOString()
      }

      const { data: updated, error: updateError } = await admin
        .from('organizations')
        .update(update)
        .eq('id', organization_id)
        .select(
          'kyc_status, charges_enabled, payouts_enabled, connect_details_submitted, stripe_connect_account_id'
        )
        .single()

      if (updateError) {
        console.error('Failed to persist connect status:', updateError)
        return json({ error: 'Failed to update status' }, 500)
      }

      return json({ ...statusPayload(updated), synced: true })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (error) {
    console.error('connect-onboard error:', error)
    return json({ error: 'Onboarding failed', details: String(error) }, 500)
  }
})
