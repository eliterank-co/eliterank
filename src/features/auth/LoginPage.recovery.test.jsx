import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const nomineeRows = vi.fn(() => Promise.resolve({ data: [], error: null }));
const resetPasswordForEmail = vi.fn();
const signIn = vi.fn();
const signUp = vi.fn();

function queryChain() {
  const chain = {
    select: () => chain,
    ilike: () => chain,
    neq: () => chain,
    is: () => chain,
    not: () => chain,
    limit: () => nomineeRows(),
  };
  return chain;
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpc(...args),
    from: () => queryChain(),
    auth: {
      resetPasswordForEmail: (...args) => resetPasswordForEmail(...args),
      signInWithOtp: vi.fn(),
    },
  },
  isSupabaseConfigured: () => true,
}));

vi.mock('../../hooks', () => ({
  useSupabaseAuth: () => ({
    signIn: (...args) => signIn(...args),
    signUp: (...args) => signUp(...args),
  }),
}));

import LoginPage from './LoginPage';
import {
  AUTH_RETURN_TO_STORAGE_KEY,
  clearPendingAuthReturnTo,
  savePendingAuthReturnTo,
} from '../../utils/authReturnTo';

function emailInput() {
  return document.querySelector('input[type="email"]');
}

function passwordInput() {
  return document.querySelector('input[type="password"]');
}

function submitCurrentForm() {
  fireEvent.submit(document.querySelector('form'));
}

async function reachExistingAccount(returnTo = '/FanClub/contestant?pendingFan=1') {
  render(<LoginPage onLogin={vi.fn()} returnTo={returnTo} returnToProvided />);
  fireEvent.change(emailInput(), { target: { value: '  Voter@Example.COM  ' } });
  await act(async () => { submitCurrentForm(); });
  await waitFor(() => expect(passwordInput()).toBeTruthy());
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: true, error: null });
  nomineeRows.mockResolvedValue({ data: [], error: null });
  resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  signIn.mockResolvedValue({ user: { id: 'voter-1', email: 'voter@example.com' }, error: null });
  signUp.mockResolvedValue({ user: { id: 'new-1' }, error: null });
  clearPendingAuthReturnTo();
  window.history.replaceState({}, '', '/login');
});

describe('LoginPage voter recovery', () => {
  it('recognizes a pre-created voter account, normalizes email, and offers password setup', async () => {
    await reachExistingAccount();

    expect(rpc).toHaveBeenCalledWith('email_is_registered', {
      email_input: 'voter@example.com',
    });
    expect(screen.getByText(/this email may already have an account/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /set or reset password/i })).toBeTruthy();
  });

  it('uses Supabase recovery with a validated fan destination and honest accepted-request copy', async () => {
    await reachExistingAccount('/FanClub/contestant?pendingFan=1');

    fireEvent.click(screen.getByRole('button', { name: /set or reset password/i }));
    await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1));

    expect(resetPasswordForEmail).toHaveBeenCalledWith(
      'voter@example.com',
      expect.objectContaining({
        redirectTo: expect.stringContaining('/reset-password?returnTo='),
      }),
    );
    const redirectTo = new URL(resetPasswordForEmail.mock.calls[0][1].redirectTo);
    expect(redirectTo.searchParams.get('returnTo')).toBe('/FanClub/contestant?pendingFan=1');
    expect(screen.getByText(/accepted your request/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /sign in/i })).not.toBeDisabled();
  });

  it('keeps the recovery action retryable after returned and thrown errors', async () => {
    resetPasswordForEmail
      .mockResolvedValueOnce({ error: { message: 'temporary auth rejection' } })
      .mockRejectedValueOnce(new Error('network unavailable'))
      .mockResolvedValueOnce({ data: {}, error: null });

    await reachExistingAccount('/FanClub');
    const recoveryButton = () => screen.getByRole('button', { name: /set or reset password/i });

    fireEvent.click(recoveryButton());
    await waitFor(() => expect(screen.getByText(/temporary auth rejection/i)).toBeTruthy());
    fireEvent.click(recoveryButton());
    await waitFor(() => expect(screen.getByText(/network unavailable/i)).toBeTruthy());
    fireEvent.click(recoveryButton());
    await waitFor(() => expect(screen.getByText(/accepted your request/i)).toBeTruthy());
    expect(resetPasswordForEmail).toHaveBeenCalledTimes(3);
  });

  it('clears a stale fallback when an explicit malformed destination is supplied', async () => {
    const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });

    try {
      savePendingAuthReturnTo('/FanClub/stale', { storage, now: Date.now() });
      // null plus returnToProvided marks an explicitly malformed query value;
      // it must not revive the seeded destination.
      render(<LoginPage onLogin={vi.fn()} returnTo={null} returnToProvided />);
      fireEvent.change(emailInput(), { target: { value: 'voter@example.com' } });
      await act(async () => { submitCurrentForm(); });
      await waitFor(() => expect(passwordInput()).toBeTruthy());
      fireEvent.click(screen.getByRole('button', { name: /set or reset password/i }));
      await waitFor(() => expect(resetPasswordForEmail).toHaveBeenCalledTimes(1));

      expect(storage.getItem(AUTH_RETURN_TO_STORAGE_KEY)).toBeNull();
      const redirectTo = new URL(resetPasswordForEmail.mock.calls[0][1].redirectTo);
      expect(redirectTo.searchParams.has('returnTo')).toBe(false);
    } finally {
      if (originalStorage) {
        Object.defineProperty(window, 'localStorage', originalStorage);
      } else {
        delete window.localStorage;
      }
    }
  });

  it('still permits ordinary password login after a recovery request succeeds', async () => {
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} returnTo="/FanClub" returnToProvided />);
    fireEvent.change(emailInput(), { target: { value: ' VOTER@example.com ' } });
    await act(async () => { submitCurrentForm(); });
    await waitFor(() => expect(passwordInput()).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /set or reset password/i }));
    await waitFor(() => expect(screen.getByText(/accepted your request/i)).toBeTruthy());

    fireEvent.change(passwordInput(), { target: { value: 'existing-password' } });
    await act(async () => { submitCurrentForm(); });

    expect(signIn).toHaveBeenCalledWith('voter@example.com', 'existing-password');
    expect(onLogin).toHaveBeenCalledWith(expect.objectContaining({
      id: 'voter-1',
      email: 'voter@example.com',
    }));
  });

  it('keeps real new signup available for an unregistered email', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    render(<LoginPage onLogin={vi.fn()} />);
    fireEvent.change(emailInput(), { target: { value: ' NewUser@Example.COM ' } });
    await act(async () => { submitCurrentForm(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /create account/i })).toBeTruthy());

    const textInputs = [...document.querySelectorAll('input[type="text"]')];
    fireEvent.change(textInputs[0], { target: { value: 'Ada' } });
    fireEvent.change(textInputs[1], { target: { value: 'Lovelace' } });
    const passwordInputs = [...document.querySelectorAll('input[type="password"]')];
    passwordInputs.forEach((input) => fireEvent.change(input, { target: { value: 'password123' } }));
    await act(async () => { submitCurrentForm(); });

    expect(signUp).toHaveBeenCalledWith('newuser@example.com', 'password123', {
      first_name: 'Ada',
      last_name: 'Lovelace',
    });
  });

  it('keeps a valid signup return target through email confirmation', async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    const returnTo = '/profile/contestant-1?source=receipt&pendingFan=1#fan';
    const onLogin = vi.fn();
    render(<LoginPage onLogin={onLogin} returnTo={returnTo} returnToProvided />);
    fireEvent.change(emailInput(), { target: { value: ' NewUser@Example.COM ' } });
    await act(async () => { submitCurrentForm(); });
    await waitFor(() => expect(screen.getByRole('button', { name: /create account/i })).toBeTruthy());

    const textInputs = [...document.querySelectorAll('input[type="text"]')];
    fireEvent.change(textInputs[0], { target: { value: 'Ada' } });
    fireEvent.change(textInputs[1], { target: { value: 'Lovelace' } });
    const passwordInputs = [...document.querySelectorAll('input[type="password"]')];
    passwordInputs.forEach((input) => fireEvent.change(input, { target: { value: 'password123' } }));
    await act(async () => { submitCurrentForm(); });

    expect(signUp).toHaveBeenCalledWith(
      'newuser@example.com',
      'password123',
      { first_name: 'Ada', last_name: 'Lovelace' },
      { emailRedirectTo: expect.any(String) },
    );
    const redirectTo = new URL(signUp.mock.calls[0][3].emailRedirectTo);
    expect(redirectTo.pathname).toBe('/login');
    expect(redirectTo.searchParams.get('returnTo')).toBe(returnTo);
    expect(onLogin).not.toHaveBeenCalled();
  });
});
