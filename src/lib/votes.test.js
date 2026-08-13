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

import { submitAnonymousVote, submitFreeVote } from './votes';

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

    // Default rpc behavior; overridden per test. checkActiveVotingRound reads
    // the active round through the ensure_round_state RPC (it lazily finalizes
    // rounds server-side), so that RPC must report an active round for the
    // happy path.
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') {
        return Promise.resolve({ data: { active: true, round: { id: 'round-1' } }, error: null });
      }
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'is_double_vote_day') return Promise.resolve({ data: false, error: null });
      if (name === 'increment_profile_votes') return Promise.resolve({ data: null, error: null });
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('errors out when no voting round is active', async () => {
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') {
        return Promise.resolve({ data: { active: false }, error: null });
      }
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'is_double_vote_day') return Promise.resolve({ data: false, error: null });
      return Promise.resolve({ data: null, error: null });
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

  it('inserts vote_count = 2 when is_double_vote_day RPC returns true', async () => {
    supabaseMock.rpc.mockImplementation((name) => {
      if (name === 'ensure_round_state') {
        return Promise.resolve({ data: { active: true, round: { id: 'round-1' } }, error: null });
      }
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'is_double_vote_day') return Promise.resolve({ data: true, error: null });
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

  it('inserts vote_count = 1 when is_double_vote_day RPC returns false', async () => {
    // Default rpc behavior already returns false for is_double_vote_day.

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
      if (name === 'ensure_round_state') {
        return Promise.resolve({ data: { active: true, round: { id: 'round-1' } }, error: null });
      }
      if (name === 'has_voted_today') return Promise.resolve({ data: false, error: null });
      if (name === 'is_double_vote_day') return Promise.resolve({ data: false, error: null });
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
});
