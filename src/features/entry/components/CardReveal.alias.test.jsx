import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./ShareableCard', () => ({
  default: ({ voteUrl }) => <div data-testid="share-card-url">{voteUrl}</div>,
}));
vi.mock('../../contestant-guide', () => ({
  ContestantGuide: () => null,
}));

import CardReveal from './CardReveal';

describe('CardReveal vanity URL', () => {
  it('bakes the public alias into the generated entry share card', () => {
    render(
      <CardReveal
        competition={{
          name: "Chicago's Creator of the Year",
          slug: 'chicago-creator-of-the-year-chi-26',
          season: 2026,
        }}
        submittedData={{ name: 'Preview Creator' }}
        publicBasePath="/FanClub"
      />,
    );

    expect(screen.getByTestId('share-card-url')).toHaveTextContent(
      'eliterank.co/FanClub',
    );
  });
});
