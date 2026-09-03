import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Handler-level regression tests for the vote-multiplier path of
// /api/cast-anonymous-vote. Before this fix the route called the BOOLEAN
// is_double_vote_day and hardcoded voteCount = flag ? 2 : 1, so on a 3×
// boost window logged-out voters (the highest-traffic path — IG/FB/TikTok
// webviews) were silently credited 2 while logged-in voters got 3.
// The fix mirrors submitFreeVote: resolve effective_vote_multiplier,
// validate against [1,2,3], fail closed on RPC error or out-of-range value.

const { supabaseMock } = vi.hoisted(() => ({ supabaseMock: {} }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => supabaseMock,
}));

import handler from './cast-anonymous-vote.js';

// Chainable mock builder: one supabase chain answers every builder method
// the handler uses and, when awaited, resolves to the configured
// { data, error } envelope — the same shape supabase-js returns.
function makeChain({ data = null, error = null } = {}) {
  const chain = {};
  const passthrough = [
    'select', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'is',
    'in', 'limit', 'order', 'ilike', 'maybeSingle', 'single',
  ];
  for (const m of passthrough) {
    chain[m] = vi.fn(() => chain);
  }
  chain.then = (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject);
  return chain;
}

function makeInsertChain({ data = null, error = null } = {}) {
  const chain = makeChain({ data, error });
  chain.insert = vi.fn(() => ({
    then: (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject),
  }));
  return chain;
}

function makeRequest(overrides = {}) {
  return {
    method: 'POST',
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone)', 'x-forwarded-for': '203.0.113.7' },
    body: {
      email: 'voter@example.com',
      firstName: 'Kelly',
      lastName: 'Clark',
      competitionId: 'comp-1',
      contestantId: 'contestant-1',
      mountedAt: Date.now() - 10_000,
      company: '',
      fingerprint: 'fp-abc',
      ...overrides,
    },
    socket: { remoteAddress: '203.0.113.7' },
  };
}

function makeResponse() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res;
}

// A supabase mock where every pre-multiplier check passes: rate limits
// clear, an active voting round exists, the voter's profile exists, and
// no vote in the last 24h. `rpcs` overrides the RPC responses.
function greenPathSupabase({ multiplier = 1, multiplierError = null } = {}) {
  const roundChain = makeChain({ data: [{ id: 'round-1' }] });
  const profileChain = makeChain({ data: { id: 'voter-1', first_name: 'Kelly', last_name: 'Clark' } });
  const dedupChain = makeChain({ data: null });
  const voteInsertChain = makeInsertChain({ error: null });
  const rateSelectChain = makeChain({ data: [] });
  const rateInsertChain = makeInsertChain({ error: null });

  let votesCall = 0;
  let rateCall = 0;

  supabaseMock.rpc = vi.fn((name) => {
    if (name === 'effective_vote_multiplier') {
      return Promise.resolve(
        multiplierError
          ? { data: null, error: multiplierError }
          : { data: multiplier, error: null },
      );
    }
    return Promise.resolve({ data: null, error: null });
  });

  supabaseMock.from = vi.fn((table) => {
    if (table === 'voting_rounds') return roundChain;
    if (table === 'profiles') return profileChain;
    if (table === 'votes') {
      votesCall += 1;
      return votesCall === 1 ? dedupChain : voteInsertChain;
    }
    if (table === 'anonymous_vote_rate_limits') {
      rateCall += 1;
      return rateCall === 1 ? rateSelectChain : rateInsertChain;
    }
    return makeChain({ data: null });
  });

  supabaseMock.auth = { admin: { createUser: vi.fn() } };

  return { voteInsertChain };
}

describe('cast-anonymous-vote vote multiplier', () => {
  const env = { ...process.env };

  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
    process.env.NODE_ENV = 'production';
    delete process.env.BOTID_ENABLED;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  it('credits vote_count = multiplier on a 3× boost window', async () => {
    const { voteInsertChain } = greenPathSupabase({ multiplier: 3 });

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, votesAdded: 3, isDoubleVoteDay: true }),
    );
    const insertPayload = voteInsertChain.insert.mock.calls[0][0];
    expect(insertPayload.vote_count).toBe(3);
    expect(insertPayload.is_double_vote).toBe(true);
    expect(supabaseMock.rpc).toHaveBeenCalledWith('effective_vote_multiplier', {
      p_competition_id: 'comp-1',
    });
    expect(supabaseMock.rpc).not.toHaveBeenCalledWith('is_double_vote_day', expect.anything());
  });

  it('credits vote_count = 2 on a legacy 2× double day', async () => {
    const { voteInsertChain } = greenPathSupabase({ multiplier: 2 });

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, votesAdded: 2, isDoubleVoteDay: true }),
    );
    expect(voteInsertChain.insert.mock.calls[0][0].vote_count).toBe(2);
  });

  it('credits vote_count = 1 on a normal day', async () => {
    const { voteInsertChain } = greenPathSupabase({ multiplier: 1 });

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, votesAdded: 1, isDoubleVoteDay: false }),
    );
    expect(voteInsertChain.insert.mock.calls[0][0].vote_count).toBe(1);
  });

  it('fails closed (503) when the multiplier RPC errors — no vote recorded', async () => {
    const { voteInsertChain } = greenPathSupabase({
      multiplierError: { message: 'rpc unavailable' },
    });

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MULTIPLIER_UNAVAILABLE' }),
    );
    expect(voteInsertChain.insert).not.toHaveBeenCalled();
  });

  it('fails closed (503) when the multiplier returns an out-of-range value', async () => {
    const { voteInsertChain } = greenPathSupabase({ multiplier: 4 });

    const res = makeResponse();
    await handler(makeRequest(), res);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'MULTIPLIER_UNAVAILABLE' }),
    );
    expect(voteInsertChain.insert).not.toHaveBeenCalled();
  });
});