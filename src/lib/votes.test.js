import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Shared mutable mock so each describe block can swap behavior. vi.hoisted
// runs before the vi.mock factory, which itself is hoisted above the imports.
const { supabaseMock } = vi.hoisted(() => ({
  supabaseMock: {
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

vi.mock('./supabase', () => ({ supabase: supabaseMock }));

import { submitAnonymousVote, submitFreeVote, waitForPaidVoteFulfillment } from './votes';

describe('submitAnonymousVote', () => {
  const baseInput = {
    email: 'voter@example.com',
    firstName: 'Kelly',
    lastName: 'Clark',
    competitionId: 'comp-1',
    contestantId: 'contestant-1',
    mountedAt: Date.now() - 5000,
    company: '',
    fingerprint: 'fp-abc',
  };

  beforeEach(() => {
    vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success=true on a 200 response', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, votesAdded: 1, visitorId: 'voter-1' }),
    });

    const result = await submitAnonymousVote(baseInput);

    expect(result).toEqual({
      success: true,
      votesAdded: 1,
      visitorId: 'voter-1',
    });
  });

  it("propagates code='ALREADY_VOTED' when the server rejects on fingerprint", async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        error: "You've already cast your free daily vote from this device. Come back tomorrow!",
        code: 'ALREADY_VOTED',
      }),
    });

    const result = await submitAnonymousVote(baseInput);

    expect(result.success).toBe(false);
    expect(result.code).toBe('ALREADY_VOTED');
    expect(result.error).toMatch(/already cast/i);
  });

  it('returns code=null for errors without a code field', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Submitted too fast — please try again.' }),
    });

    const result = await submitAnonymousVote(baseInput);

    expect(result.success).toBe(false);
    expect(result.code).toBeNull();
  });

  it('returns a network error message when fetch rejects', async () => {
    global.fetch.mockRejectedValueOnce(new Error('offline'));

    const result = await submitAnonymousVote(baseInput);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network/i);
  });
});

// ---------------------------------------------------------------------------
// submitFreeVote — the multiplier path. Uses a chainable mock builder so a
// single test can stub the dozen different supabase chain shapes the
// function touches (voting_rounds lookup, votes insert, contestants select,
// rpc calls, etc.) without binding to call order.
// ---------------------------------------------------------------------------

function makeChain(result) {
  const chain = {};
  const passthroughMethods = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is',
    'in', 'limit', 'order', 'ilike', 'maybeSingle', 'single',
  ];
  for (const m of passthroughMethods) {
    chain[m] = vi.fn(() => chain);
  }
  // Make the chain awaitable so `await supabase.from(...).select()...limit(1)`
  // resolves to the configured result.
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

describe('submitFreeVote', () => {
  let voteInsertSpy;

  beforeEach(() => {
    voteInsertSpy = vi.fn().mockResolvedValue({ error: null });

    supabaseMock.from.mockReset();
    supabaseMock.rpc.mockReset();

    supabaseMock.from.mockImplementation((table) => {
      if (table === 'voting_rounds') {
        return makeChain({
          data: [{ id: 'round-1', start_date: '2026-01-01', end_date: '2027-01-01', round_type: 'voting' }],
          error: null,
        });
      }
      if (table === 'votes') {
        return { insert: voteInsertSpy };
      }
      if (table === 'contestants') {
        return makeChain({ data: { user_id: 'host-user-1' }, error: null });
      }
      if (table === 'profiles') {
        return makeChain({ data: { total_votes_received: 0 }, error: null });
      }
      // Any other table — no-op so the test fails loudly only on the assertion.
      return makeChain({ data: null, error: null });
    });

    // Default rpc behavior; overridden per test.
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') return Promise.resolve({ data: { active: true, round: { id: 'round-1' } }, error: null });
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'effective_vote_multiplier') return Promise.resolve({ data: 1, error: null });
      if (name === 'increment_profile_votes') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('errors out when no voting round is active', async () => {
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') return Promise.resolve({ data: { active: false }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    supabaseMock.from.mockImplementation((table) => {
      if (table === 'voting_rounds') {
        return makeChain({ data: [], error: null });
      }
      return makeChain({ data: null, error: null });
    });

    const result = await submitFreeVote({
      userId: 'voter-1',
      voterEmail: 'v@e.com',
      competitionId: 'comp-1',
      contestantId: 'contestant-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/voting is not currently active/i);
    expect(voteInsertSpy).not.toHaveBeenCalled();
  });

  it('inserts vote_count = 2 when the authoritative multiplier is 2', async () => {
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') return Promise.resolve({ data: { active: true, round: { id: 'round-1' } }, error: null });
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'effective_vote_multiplier') return Promise.resolve({ data: 2, error: null });
      if (name === 'increment_profile_votes') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await submitFreeVote({
      userId: 'voter-1',
      voterEmail: 'v@e.com',
      competitionId: 'comp-1',
      contestantId: 'contestant-1',
    });

    expect(result.success).toBe(true);
    expect(result.votesAdded).toBe(2);
    expect(voteInsertSpy).toHaveBeenCalledTimes(1);
    expect(voteInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ vote_count: 2, is_double_vote: true })
    );
  });

  it('inserts vote_count = 1 when no boost is active', async () => {

    const result = await submitFreeVote({
      userId: 'voter-1',
      voterEmail: 'v@e.com',
      competitionId: 'comp-1',
      contestantId: 'contestant-1',
    });

    expect(result.success).toBe(true);
    expect(result.votesAdded).toBe(1);
    expect(voteInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ vote_count: 1, is_double_vote: false })
    );
  });

  it('ignores a caller-supplied isDoubleVoteDay hint and trusts the RPC', async () => {
    // Caller claims it's a double day; RPC says no. Server-side decides.
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') return Promise.resolve({ data: { active: true, round: { id: 'round-1' } }, error: null });
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'effective_vote_multiplier') return Promise.resolve({ data: 1, error: null });
      if (name === 'increment_profile_votes') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await submitFreeVote({
      userId: 'voter-1',
      voterEmail: 'v@e.com',
      competitionId: 'comp-1',
      contestantId: 'contestant-1',
      isDoubleVoteDay: true, // lie
    });

    expect(result.success).toBe(true);
    expect(result.votesAdded).toBe(1);
    expect(voteInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ vote_count: 1, is_double_vote: false })
    );
  });

  it('credits 3 votes only when the authoritative multiplier is 3', async () => {
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') return Promise.resolve({ data: { active: true, round: { id: 'round-1' } }, error: null });
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'effective_vote_multiplier') return Promise.resolve({ data: 3, error: null });
      if (name === 'increment_profile_votes') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await submitFreeVote({
      userId: 'voter-1', voterEmail: 'v@e.com', competitionId: 'comp-1', contestantId: 'contestant-1',
    });

    expect(result).toMatchObject({ success: true, votesAdded: 3 });
    expect(voteInsertSpy).toHaveBeenCalledWith(expect.objectContaining({ vote_count: 3, is_double_vote: true }));
  });

  it('fails closed without inserting when multiplier authority errors', async () => {
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') return Promise.resolve({ data: { active: true, round: { id: 'round-1' } }, error: null });
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'effective_vote_multiplier') return Promise.resolve({ data: null, error: { message: 'rpc unavailable' } });
      return Promise.resolve({ data: null, error: null });
    });

    const result = await submitFreeVote({
      userId: 'voter-1', voterEmail: 'v@e.com', competitionId: 'comp-1', contestantId: 'contestant-1',
    });

    expect(result).toMatchObject({ success: false, retryable: true });
    expect(voteInsertSpy).not.toHaveBeenCalled();
  });
});

describe('waitForPaidVoteFulfillment', () => {
  beforeEach(() => {
    supabaseMock.from.mockReset();
  });

  it('returns the authoritative webhook-authored vote count', async () => {
    const chain = makeChain({
      data: {
        id: 'vote-1',
        competition_id: 'comp-1',
        contestant_id: 'contestant-1',
        vote_count: 30,
        payment_intent_id: 'pi_123',
      },
      error: null,
    });
    supabaseMock.from.mockReturnValue(chain);

    const result = await waitForPaidVoteFulfillment({
      paymentIntentId: 'pi_123',
      competitionId: 'comp-1',
      contestantId: 'contestant-1',
      maxAttempts: 1,
      pollIntervalMs: 0,
    });

    expect(result).toEqual({
      fulfilled: true,
      pending: false,
      voteId: 'vote-1',
      voteCount: 30,
    });
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'payment_intent_id', 'pi_123');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'competition_id', 'comp-1');
    expect(chain.eq).toHaveBeenNthCalledWith(3, 'contestant_id', 'contestant-1');
  });

  it('reports pending rather than claiming success when no ledger row exists', async () => {
    supabaseMock.from.mockImplementation(() => makeChain({ data: null, error: null }));

    const result = await waitForPaidVoteFulfillment({
      paymentIntentId: 'pi_delayed',
      competitionId: 'comp-1',
      contestantId: 'contestant-1',
      maxAttempts: 2,
      pollIntervalMs: 0,
    });

    expect(result).toEqual({ fulfilled: false, pending: true });
    expect(supabaseMock.from).toHaveBeenCalledTimes(2);
  });

  it('preserves the lookup failure while leaving fulfillment retryable', async () => {
    supabaseMock.from.mockImplementation(() => makeChain({
      data: null,
      error: { message: 'temporarily unavailable' },
    }));

    const result = await waitForPaidVoteFulfillment({
      paymentIntentId: 'pi_error',
      competitionId: 'comp-1',
      contestantId: 'contestant-1',
      maxAttempts: 1,
      pollIntervalMs: 0,
    });

    expect(result).toEqual({
      fulfilled: false,
      pending: true,
      error: 'temporarily unavailable',
    });
  });
});
