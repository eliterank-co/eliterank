import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the underlying client so `supabase` is non-null and we can assert on
// refreshSession. withFreshSession only touches supabase.auth.refreshSession.
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: {
      refreshSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'fresh' } }, error: null }),
    },
  }),
}));

// Env must be present at import time for the client to be constructed.
vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

const { withFreshSession, supabase } = await import('./supabase.js');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('withFreshSession', () => {
  it('returns immediately on success and never refreshes', async () => {
    const run = vi.fn().mockResolvedValue({ data: { id: 1 }, error: null });
    const res = await withFreshSession(run);
    expect(res.data).toEqual({ id: 1 });
    expect(run).toHaveBeenCalledTimes(1);
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes and retries once on an expired JWT (PGRST301)', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } })
      .mockResolvedValueOnce({ data: { id: 2 }, error: null });
    const res = await withFreshSession(run);
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(res.data).toEqual({ id: 2 });
  });

  it('retries on an RLS violation (42501) from a lapsed session', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        data: null,
        error: { code: '42501', message: 'new row violates row-level security policy' },
      })
      .mockResolvedValueOnce({ data: { id: 3 }, error: null });
    const res = await withFreshSession(run);
    expect(run).toHaveBeenCalledTimes(2);
    expect(res.data).toEqual({ id: 3 });
  });

  it('does NOT refresh or retry on a non-auth error (e.g. unique violation)', async () => {
    const run = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate key' } });
    const res = await withFreshSession(run);
    expect(supabase.auth.refreshSession).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledTimes(1);
    expect(res.error.code).toBe('23505');
  });

  it('surfaces the error (no infinite loop) when the refresh itself fails', async () => {
    supabase.auth.refreshSession.mockResolvedValueOnce({ data: { session: null }, error: { message: 'no refresh token' } });
    const run = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } });
    const res = await withFreshSession(run);
    expect(run).toHaveBeenCalledTimes(1); // not retried, since refresh failed
    expect(res.error.code).toBe('PGRST301');
  });
});
