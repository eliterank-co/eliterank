import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../pages/competition/CompetitionLayout', () => ({
  default: function MockCompetitionLayout() {
    const location = useLocation();
    return (
      <div data-testid="competition-route">
        {location.pathname}{location.search}
      </div>
    );
  },
}));

import AppRoutes from './index';

async function renderRoute(initialEntry) {
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  return screen.findByTestId('competition-route');
}

describe('FanClub client routing', () => {
  it('keeps the canonical alias visible', async () => {
    expect(await renderRoute('/FanClub?ref=partner')).toHaveTextContent(
      '/FanClub?ref=partner',
    );
  });

  it('normalizes lowercase and preserves nested routes plus query parameters', async () => {
    expect(await renderRoute('/fanclub/rules?ref=partner')).toHaveTextContent(
      '/FanClub/rules?ref=partner',
    );
  });

  it('redirects the old nested path to the alias', async () => {
    expect(
      await renderRoute(
        '/creator-social-llc/chicago-creator-of-the-year-chi-26/enter?apply=self',
      ),
    ).toHaveTextContent('/FanClub/enter?apply=self');
  });

  it('continues routing ID-based competition URLs', async () => {
    expect(
      await renderRoute(
        '/creator-social-llc/id/caef08d7-ecd2-4bbd-addb-92d7bc31069b/rules',
      ),
    ).toHaveTextContent(
      '/creator-social-llc/id/caef08d7-ecd2-4bbd-addb-92d7bc31069b/rules',
    );
  });
});
