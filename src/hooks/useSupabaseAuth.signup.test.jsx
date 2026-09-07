import { act, cleanup, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authSignUp = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const unsubscribe = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args) => getSession(...args),
      onAuthStateChange: (...args) => onAuthStateChange(...args),
      signUp: (...args) => authSignUp(...args),
    },
  },
}));

vi.mock('../lib/bonusVotes', () => ({
  checkAndAwardProfileBonuses: vi.fn(),
}));

import useSupabaseAuth from './useSupabaseAuth';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
  authSignUp.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
});

describe('useSupabaseAuth signUp', () => {
  it('preserves the existing SDK options shape without a redirect', async () => {
    const { result } = renderHook(() => useSupabaseAuth());

    await act(async () => {
      await result.current.signUp('new@example.com', 'password123', { first_name: 'Ada' });
    });

    expect(authSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
      options: { data: { first_name: 'Ada' } },
    });
  });

  it('forwards an optional email confirmation redirect unchanged', async () => {
    const { result } = renderHook(() => useSupabaseAuth());
    const emailRedirectTo =
      'https://eliterank.example/login?returnTo=%2Fprofile%2Fvoter-1%3FpendingFan%3D1';

    await act(async () => {
      await result.current.signUp(
        'new@example.com',
        'password123',
        { first_name: 'Ada' },
        { emailRedirectTo },
      );
    });

    expect(authSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password123',
      options: { data: { first_name: 'Ada' }, emailRedirectTo },
    });
  });
});
