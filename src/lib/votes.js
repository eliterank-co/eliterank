import { supabase } from './supabase';

/**
 * Check if there's an active voting round for the competition.
 *
 * Calls ensure_round_state() which lazily finalizes any rounds whose end_date
 * has passed (eliminations, advancements, optional vote reset) before
 * returning the currently active round — so round transitions happen the
 * moment a voter or the public page hits this path, without waiting for cron.
 *
 * @param {string} competitionId - The competition ID
 * @returns {Promise<{isActive: boolean, round?: object, error?: string}>}
 */
export async function checkActiveVotingRound(competitionId) {
  if (!supabase || !competitionId) {
    return { isActive: false, error: 'Missing required parameters' };
  }

  try {
    const { data, error } = await supabase.rpc('ensure_round_state', {
      p_competition_id: competitionId,
    });

    if (error) {
      console.warn('Error checking active voting round:', error.message);
      return { isActive: false, error: error.message };
    }

    if (data?.active) {
      return { isActive: true, round: data.round };
    }

    return { isActive: false };
  } catch (err) {
    console.error('Error checking active voting round:', err);
    return { isActive: false, error: 'Failed to check voting round status' };
  }
}

/**
 * Check if user has used their free vote today for this competition
 * Uses RPC function (SECURITY DEFINER) to bypass RLS issues
 * @param {string} userId - The user's ID
 * @param {string} competitionId - The competition ID
 * @returns {Promise<boolean>} - True if already voted today
 */
export async function hasUsedFreeVoteToday(userId, competitionId) {
  if (!supabase || !userId || !competitionId) {
    return false;
  }

  try {
    // Try RPC function first (bypasses RLS)
    const { data: rpcResult, error: rpcError } = await supabase.rpc('has_voted_today', {
      p_user_id: userId,
      p_competition_id: competitionId,
    });

    if (!rpcError && rpcResult !== null) {
      return rpcResult;
    }

    // Fallback to direct query if RPC doesn't exist
    if (rpcError) {
      console.warn('RPC has_voted_today not available, using fallback:', rpcError.message);
    }

    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('votes')
      .select('id')
      .eq('voter_id', userId)
      .eq('competition_id', competitionId)
      .eq('amount_paid', 0) // Free votes only
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lte('created_at', `${today}T23:59:59.999Z`)
      .limit(1);

    if (error) {
      // 406/403 errors often mean RLS policies don't allow the query
      // In this case, assume user hasn't voted (they'll get proper error on insert if they have)
      console.warn('Could not check daily vote status (RLS may need updating):', error.code, error.message);
      return false;
    }

    return data && data.length > 0;
  } catch (err) {
    console.error('Error checking free vote status:', err);
    return false;
  }
}

/**
 * Get the contestant ID that user voted for today (if any)
 * @param {string} userId - The user's ID
 * @param {string} competitionId - The competition ID
 * @returns {Promise<string|null>} - The contestant ID or null
 */
export async function getTodaysVote(userId, competitionId) {
  if (!supabase || !userId || !competitionId) {
    return null;
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // maybeSingle() returns { data: null } when there are 0 rows without
    // the 406 that .single() produces and logs in the browser console.
    const { data, error } = await supabase
      .from('votes')
      .select('contestant_id')
      .eq('voter_id', userId)
      .eq('competition_id', competitionId)
      .eq('amount_paid', 0)
      .gte('created_at', `${today}T00:00:00.000Z`)
      .lte('created_at', `${today}T23:59:59.999Z`)
      .maybeSingle();

    if (error) {
      console.error('Error getting today\'s vote:', error);
      return null;
    }

    return data?.contestant_id || null;
  } catch (err) {
    console.error('Error getting today\'s vote:', err);
    return null;
  }
}

/**
 * Submit a free daily vote
 * @param {Object} params - Vote parameters
 * @param {string} params.userId - The user's ID
 * @param {string} params.voterEmail - The voter's email
 * @param {string} params.competitionId - The competition ID
 * @param {string} params.contestantId - The contestant ID to vote for
 * @param {boolean} params.isDoubleVoteDay - Whether votes count double today
 * @returns {Promise<{success: boolean, error?: string, votesAdded?: number}>}
 */
export async function submitFreeVote({
  userId,
  voterEmail,
  competitionId,
  contestantId,
  // Accepted for callers/UI but ignored — we re-check against the
  // competition_double_days table below so the multiplier can't be spoofed.
  isDoubleVoteDay: _isDoubleVoteDayHint = false,
}) {
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  if (!userId || !competitionId || !contestantId) {
    return { success: false, error: 'Missing required parameters' };
  }

  try {
    // 1. Check if there's an active voting round (server-side validation)
    const roundCheck = await checkActiveVotingRound(competitionId);
    if (!roundCheck.isActive) {
      return { success: false, error: 'Voting is not currently active. Please wait for the next voting round.' };
    }

    // 2. Check if already voted today (prevent race condition)
    const alreadyVoted = await hasUsedFreeVoteToday(userId, competitionId);
    if (alreadyVoted) {
      return { success: false, error: 'You have already used your free vote today' };
    }

    // 3. Re-resolve the effective multiplier at the authoritative server
    // boundary.  A caller can neither select nor compound a boost.
    const { data: rpcMultiplier, error: multiplierError } = await supabase.rpc('effective_vote_multiplier', {
      p_competition_id: competitionId,
    });
    if (multiplierError || ![1, 2, 3].includes(rpcMultiplier)) {
      return {
        success: false,
        error: 'Vote boost status is temporarily unavailable. Please retry.',
        retryable: true,
      };
    }
    const voteValue = rpcMultiplier;
    const isDoubleVoteDay = voteValue > 1;

    // 4. Insert the vote record
    const { error: voteError } = await supabase
      .from('votes')
      .insert({
        voter_id: userId,
        voter_email: voterEmail || null,
        competition_id: competitionId,
        contestant_id: contestantId,
        vote_count: voteValue,
        amount_paid: 0,
        payment_intent_id: null,
        is_double_vote: isDoubleVoteDay,
      });

    if (voteError) {
      console.error('Vote insert error:', voteError);
      // Check for unique constraint violation
      if (voteError.code === '23505') {
        return { success: false, error: 'You have already used your free vote today' };
      }
      return { success: false, error: voteError.message };
    }

    // 4. The on_vote_insert DB trigger has already incremented
    //    contestants.votes and competitions.total_votes. Only the profile
    //    lifetime total still needs a separate update.
    const { data: contestant } = await supabase
      .from('contestants')
      .select('user_id')
      .eq('id', contestantId)
      .single();

    if (contestant?.user_id) {
      await updateProfileVotes(contestant.user_id, voteValue);
    }

    return { success: true, votesAdded: voteValue };
  } catch (err) {
    console.error('Error submitting vote:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Update profile's total votes received
 * @param {string} userId - The profile's user ID
 * @param {number} voteValue - Number of votes to add
 */
async function updateProfileVotes(userId, voteValue) {
  if (!supabase || !userId) return;

  try {
    // Try RPC first
    const { error } = await supabase.rpc('increment_profile_votes', {
      p_user_id: userId,
      p_votes: voteValue,
    });

    if (error) {
      // Fallback to manual update
      console.warn('RPC increment_profile_votes failed, using fallback:', error);

      const { data: profile } = await supabase
        .from('profiles')
        .select('total_votes_received')
        .eq('id', userId)
        .single();

      if (profile) {
        await supabase
          .from('profiles')
          .update({
            total_votes_received: (profile.total_votes_received || 0) + voteValue,
          })
          .eq('id', userId);
      }
    }
  } catch (err) {
    console.error('Error updating profile votes:', err);
    // Non-critical, don't fail the vote
  }
}

/**
 * Cast a free daily vote as a logged-out visitor. Hits the
 * /api/cast-anonymous-vote Vercel route which does bot checks, IP rate
 * limiting, and the voter-profile bootstrap server-side.
 *
 * @param {object} params
 * @param {string} params.email
 * @param {string} params.firstName
 * @param {string} params.lastName
 * @param {string} params.competitionId
 * @param {string} params.contestantId
 * @param {number} params.mountedAt - client ms timestamp when form mounted
 * @param {string} [params.company] - honeypot value (should be empty)
 * @param {string} [params.fingerprint] - browser fingerprint for fraud prevention
 */
export async function submitAnonymousVote({
  email,
  firstName,
  lastName,
  competitionId,
  contestantId,
  mountedAt,
  company,
  fingerprint,
}) {
  try {
    const res = await fetch('/api/cast-anonymous-vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        firstName,
        lastName,
        competitionId,
        contestantId,
        mountedAt,
        company,
        fingerprint,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        success: false,
        error: data?.error || 'Vote failed. Please try again.',
        code: data?.code || null,
        prevVoteAt: data?.prevVoteAt || null,
      };
    }
    return {
      success: true,
      votesAdded: data?.votesAdded || 1,
      visitorId: data?.visitorId || null,
    };
  } catch (err) {
    console.error('submitAnonymousVote error:', err);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Become a fan as an anonymous voter (post-vote opt-in).
 * @param {Object} params
 * @param {string} params.visitorId - The auth user ID from submitAnonymousVote
 * @param {string} params.contestantId - The contestant to follow
 * @returns {Promise<{success: boolean, contestantName?: string, error?: string}>}
 */
export async function becomeFanAnonymous({ visitorId, contestantId }) {
  try {
    const res = await fetch('/api/become-fan-anonymous', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visitorId, contestantId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, error: data?.error || 'Could not become a fan.' };
    }
    return { success: true, contestantName: data?.contestantName };
  } catch (err) {
    console.error('becomeFanAnonymous error:', err);
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Get time until free vote resets (midnight local time)
 * @returns {string} - Human readable time until reset
 */
export function getTimeUntilReset() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const diff = midnight - now;

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Create a payment intent for purchasing votes
 * @param {Object} params - Payment parameters
 * @param {string} params.competitionId - The competition ID
 * @param {string} params.contestantId - The contestant ID to vote for
 * @param {number} params.voteCount - Number of votes to purchase
 * @param {string} params.voterEmail - The voter's email (optional)
 * @returns {Promise<{success: boolean, clientSecret?: string, error?: string}>}
 */
export async function createVotePaymentIntent({
  competitionId,
  contestantId,
  voteCount,
  voterEmail,
}) {
  if (!supabase) {
    return { success: false, error: 'Database not configured' };
  }

  if (!competitionId || !contestantId || !voteCount) {
    return { success: false, error: 'Missing required parameters' };
  }

  if (voteCount < 1 || voteCount > 1000) {
    return { success: false, error: 'Invalid vote count' };
  }

  try {
    // Check if there's an active voting round
    const roundCheck = await checkActiveVotingRound(competitionId);
    if (!roundCheck.isActive) {
      return { success: false, error: 'Voting is not currently active' };
    }

    // Call the Supabase Edge Function to create payment intent
    const { data, error } = await supabase.functions.invoke('create-payment-intent', {
      body: {
        competitionId,
        contestantId,
        voteCount,
        voterEmail,
      },
    });

    if (error) {
      console.error('Payment intent creation failed:', error);
      // The edge function returns a JSON body with a friendly `error` message
      // for expected cases (e.g. the host hasn't set up payouts). supabase-js
      // surfaces non-2xx as FunctionsHttpError with the Response on .context;
      // read it so the voter sees the real reason instead of a generic string.
      let message = error.message || 'Failed to create payment';
      let code;
      try {
        const body = await error.context?.json?.();
        if (body?.error) message = body.error;
        if (body?.code) code = body.code;
      } catch {
        // body wasn't JSON / already consumed — fall back to the generic message
      }
      return { success: false, error: message, code };
    }

    if (!data?.clientSecret) {
      return { success: false, error: 'Invalid response from payment service' };
    }

    return {
      success: true,
      clientSecret: data.clientSecret,
      paymentIntentId: data.paymentIntentId,
      amount: data.amount,
      // Tax breakdown (cents) so the checkout UI can itemize e.g. HST.
      subtotal: data.subtotal,
      taxAmount: data.taxAmount,
      taxRatePct: data.taxRatePct,
      taxLabel: data.taxLabel,
      currency: data.currency,
      voteCount: data.voteCount,
      voteMultiplier: data.voteMultiplier,
      creditedVoteCount: data.creditedVoteCount,
      contestantName: data.contestantName,
      connectedAccountId: data.connectedAccountId,
    };
  } catch (err) {
    console.error('Error creating payment intent:', err);
    return { success: false, error: 'An unexpected error occurred' };
  }
}

/**
 * Wait for Stripe's webhook to materialize a paid-vote ledger row.
 *
 * The PaymentIntent only proves that Stripe accepted money. The votes row is
 * the authoritative fulfillment outcome, so callers must not present a
 * successful vote until this lookup finds the webhook-authored row.
 */
export async function waitForPaidVoteFulfillment({
  paymentIntentId,
  competitionId,
  contestantId,
  maxAttempts = 20,
  pollIntervalMs = 500,
}) {
  if (!supabase || !paymentIntentId || !competitionId || !contestantId) {
    return { fulfilled: false, pending: false, error: 'Missing fulfillment parameters' };
  }

  const attempts = Number.isInteger(maxAttempts) && maxAttempts > 0 ? maxAttempts : 1;
  const interval = Number.isFinite(pollIntervalMs) && pollIntervalMs >= 0 ? pollIntervalMs : 0;
  let lastError = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let data = null;
    let error = null;
    try {
      ({ data, error } = await supabase
        .from('votes')
        .select('id, competition_id, contestant_id, vote_count, payment_intent_id')
        .eq('payment_intent_id', paymentIntentId)
        .eq('competition_id', competitionId)
        .eq('contestant_id', contestantId)
        .maybeSingle());
    } catch (err) {
      lastError = err instanceof Error ? err.message : 'Fulfillment lookup failed';
    }

    if (!error && data && Number.isInteger(data.vote_count) && data.vote_count > 0) {
      return {
        fulfilled: true,
        pending: false,
        voteId: data.id,
        voteCount: data.vote_count,
      };
    }

    if (error) lastError = error.message || 'Fulfillment lookup failed';

    if (attempt + 1 < attempts && interval > 0) {
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  }

  return {
    fulfilled: false,
    pending: true,
    ...(lastError ? { error: lastError } : {}),
  };
}
