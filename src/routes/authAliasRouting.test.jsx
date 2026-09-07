import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../pages/LoginPageWrapper', () => ({
  default: function MockLoginPageWrapper() {
    const location = useLocation();
    return (
      <div data-testid="login-route">
        <span>{location.pathname}{location.search}{location.hash}</span>
        <span data-testid="return-to">{new URLSearchParams(location.search).get('returnTo') || ''}</span>
      </div>
    );
  },
}));

import AppRoutes from './index';

beforeEach(() => {
  cleanup();
});

describe('legacy auth aliases', () => {
  it('routes /signup to login while preserving the return destination query', async () => {
    render(
      <MemoryRouter initialEntries={['/signup?returnTo=%2FFanClub%3FpendingFan%3D1&source=receipt#access']}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('login-route')).toHaveTextContent(
      '/login?returnTo=%2FFanClub%3FpendingFan%3D1&source=receipt#access',
    );
  });

  it('normalizes an actual same-origin receipt profile URL and preserves its query/hash', async () => {
    const absoluteProfile = `${window.location.origin}/profile/contestant-1?source=receipt#fan`;
    render(
      <MemoryRouter initialEntries={[`/signup?returnTo=${encodeURIComponent(absoluteProfile)}&source=receipt#access`]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('return-to')).toHaveTextContent(
      '/profile/contestant-1?source=receipt&pendingFan=1#fan',
    );
    expect(screen.getByTestId('login-route')).toHaveTextContent('#access');
  });

  it('keeps an external legacy return target explicit so login fails closed', async () => {
    const externalProfile = 'https://evil.example/profile/contestant-1';
    render(
      <MemoryRouter initialEntries={[`/signup?returnTo=${encodeURIComponent(externalProfile)}`]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('return-to')).toHaveTextContent(externalProfile);
  });
});
