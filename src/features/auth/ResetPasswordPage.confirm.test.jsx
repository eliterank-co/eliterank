import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, cleanup, fireEvent, waitFor } from '@testing-library/react';
import {
  AUTH_RETURN_TO_STORAGE_KEY,
  savePendingAuthReturnTo,
} from '../../utils/authReturnTo';

/**
 * Regression tests for the recovery-token burn.
 *
 * Production symptom (2026-08-19): 8 of 9 password resets in 24h failed with
 * Supabase auth logging `403: Email link is invalid or has expired` /
 * `One-time token not found`. Cause: the emailed link pointed straight at
 * Supabase's GET /auth/v1/verify, which SPENDS the single-use token. Microsoft
 * Exchange Online Protection (104.47.x.x) pre-fetches links to scan them, so
 * the token was already gone by the time the human tapped it.
 *
 * Fix: the email lands on this page carrying an UNSPENT `token_hash`, and the
 * token is only exchanged when a human clicks. A scanner fetching the page
 * costs nothing.
 */

const verifyOtp = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const updateUser = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      verifyOtp: (...a) => verifyOtp(...a),
      getSession: (...a) => getSession(...a),
      onAuthStateChange: (...a) => onAuthStateChange(...a),
      updateUser: (...a) => updateUser(...a),
    },
  },
  isSupabaseConfigured: () => true,
}));

import ResetPasswordPage from './ResetPasswordPage';

function setUrl(search) {
  window.history.replaceState({}, '', '/reset-password' + search);
}

const confirmButton = () =>
  [...document.querySelectorAll('button')].find((b) => /continue|confirm|set (my )?password/i.test(b.textContent));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  getSession.mockResolvedValue({ data: { session: null }, error: null });
  verifyOtp.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
});

describe('ResetPasswordPage spends the recovery token only on a human click', () => {
  it('does not exchange the token on mount, so link scanners cannot burn it', async () => {
    setUrl('?token_hash=abc123&type=recovery');

    render(<ResetPasswordPage />);
    await act(async () => {});

    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('offers a confirm button rather than the password form', async () => {
    setUrl('?token_hash=abc123&type=recovery');

    render(<ResetPasswordPage />);
    await act(async () => {});

    expect(confirmButton(), 'a confirm CTA must be rendered').toBeTruthy();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it('exchanges the token when the user confirms', async () => {
    setUrl('?token_hash=abc123&type=recovery');

    render(<ResetPasswordPage />);
    await act(async () => {});
    await act(async () => { confirmButton().click(); });

    expect(verifyOtp).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc123', type: 'recovery' });
  });

  it('reveals the password form once the token is accepted', async () => {
    setUrl('?token_hash=abc123&type=recovery');

    render(<ResetPasswordPage />);
    await act(async () => {});
    await act(async () => { confirmButton().click(); });

    expect(document.querySelector('input[type="password"]')).toBeTruthy();
  });

  it('reports an expired link when the token was already spent', async () => {
    verifyOtp.mockResolvedValue({
      data: {},
      error: { message: 'Email link is invalid or has expired' },
    });
    setUrl('?token_hash=spent&type=recovery');

    render(<ResetPasswordPage />);
    await act(async () => {});
    await act(async () => { confirmButton().click(); });

    expect(screen.getByText(/invalid or expired reset link/i)).toBeTruthy();
  });

  it('keeps a valid fan destination after the fallback record is removed mid-flow', async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });

    try {
      savePendingAuthReturnTo('/FanClub?pendingFan=1', { storage, now: Date.now() });
      setUrl('?token_hash=abc123&type=recovery');
      const onComplete = vi.fn();
      updateUser.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
      vi.useFakeTimers();

      render(<ResetPasswordPage onComplete={onComplete} />);
      await act(async () => {});
      await act(async () => { confirmButton().click(); });
      storage.removeItem(AUTH_RETURN_TO_STORAGE_KEY); // another tab consumed it

      const pws = [...document.querySelectorAll('input[type="password"]')];
      pws.forEach((input) => fireEvent.change(input, { target: { value: 'hunter2hunter2' } }));
      await act(async () => { fireEvent.submit(document.querySelector('form')); });
      await act(async () => { vi.advanceTimersByTime(2000); });

      expect(onComplete).toHaveBeenCalledWith('/FanClub?pendingFan=1');
    } finally {
      vi.useRealTimers();
      if (originalStorage) {
        Object.defineProperty(window, 'localStorage', originalStorage);
      } else {
        delete window.localStorage;
      }
    }
  });

  it('keeps the password form retryable after a returned update error', async () => {
    setUrl('');
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });
    updateUser
      .mockResolvedValueOnce({ error: { message: 'temporary update failure' } })
      .mockResolvedValueOnce({ data: { user: { id: 'u1' } }, error: null });

    render(<ResetPasswordPage />);
    await act(async () => {});
    const pws = [...document.querySelectorAll('input[type="password"]')];
    pws.forEach((input) => fireEvent.change(input, { target: { value: 'hunter2hunter2' } }));

    await act(async () => { fireEvent.submit(document.querySelector('form')); });
    expect(screen.getByText(/temporary update failure/i)).toBeTruthy();

    await act(async () => { fireEvent.submit(document.querySelector('form')); });
    await waitFor(() => expect(screen.getByText(/password updated/i)).toBeTruthy());
    expect(updateUser).toHaveBeenCalledTimes(2);
  });

  it('returns to login with a valid fan destination after an expired link', async () => {
    const onBack = vi.fn();
    verifyOtp.mockResolvedValue({ error: { message: 'Email link is invalid or has expired' } });
    setUrl('?token_hash=spent&type=recovery&returnTo=%2FFanClub%3FpendingFan%3D1');

    render(<ResetPasswordPage onBack={onBack} />);
    await act(async () => {});
    await act(async () => { confirmButton().click(); });
    fireEvent.click(screen.getByRole('button', { name: /request new reset link/i }));

    expect(onBack).toHaveBeenCalledWith('/FanClub?pendingFan=1');
  });

  it('still supports legacy links whose session Supabase already established', async () => {
    // Older emails already in flight resolve via detectSessionInUrl, landing
    // here with a live session and no token_hash. That path must keep working.
    setUrl('');
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } }, error: null });

    render(<ResetPasswordPage />);
    await act(async () => {});

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(document.querySelector('input[type="password"]')).toBeTruthy();
  });
});
