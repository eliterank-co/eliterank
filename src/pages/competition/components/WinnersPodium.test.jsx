import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WinnersPodium, WinnersGrid } from './WinnersPodium';

// Mock contexts and images
vi.mock('../../../contexts/PublicCompetitionContext', () => ({
  usePublicCompetition: vi.fn(() => ({
    competition: null,
    contestants: [],
    topThree: [],
    openContestantProfile: vi.fn(),
  })),
}));

vi.mock('../../../lib/storageImage', () => ({
  transformSupabaseImage: vi.fn((url) => url),
}));

const mockContestants = [
  { id: 'c-1', name: 'Sofia Alvarez', avatar_url: 'https://example.com/c1.jpg', gender: 'female', votes: 120 },
  { id: 'c-2', name: 'Valeria Gomez', avatar_url: 'https://example.com/c2.jpg', gender: 'female', votes: 95 },
  { id: 'c-3', name: 'Camila Rodriguez', avatar_url: 'https://example.com/c3.jpg', gender: 'female', votes: 80 },
  { id: 'c-4', name: 'Lucia Morales', avatar_url: null, gender: 'female', votes: 60 },
];

describe('WinnersPodium & WinnersGrid - placement labels and fallbacks', () => {
  it('renders configured placement labels (Reina, Virreina, Princesa) for non-gender-split multi-winner', () => {
    const competition = {
      id: 'comp-mws',
      number_of_winners: 3,
      winners_split_by_gender: false,
      winner_placement_labels: ['Reina', 'Virreina', 'Princesa'],
      winners: ['c-1', 'c-2', 'c-3'],
      season: '2026',
      city: 'Chicago',
    };

    render(
      <MemoryRouter>
        <WinnersPodium
          competition={competition}
          contestants={mockContestants}
        />
      </MemoryRouter>
    );

    // Each placement label appears in the rank badge and division title
    expect(screen.getAllByText('Reina').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Virreina').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Princesa').length).toBeGreaterThanOrEqual(1);

    // Contestant names are present
    expect(screen.getByText('Sofia Alvarez')).toBeInTheDocument();
    expect(screen.getByText('Valeria Gomez')).toBeInTheDocument();
    expect(screen.getByText('Camila Rodriguez')).toBeInTheDocument();

    // 4th contestant should not be rendered
    expect(screen.queryByText('Lucia Morales')).not.toBeInTheDocument();
  });

  it('preserves ordinary ordinal labels as fallback when winner_placement_labels is null', () => {
    const competition = {
      id: 'comp-standard',
      number_of_winners: 3,
      winners_split_by_gender: false,
      winner_placement_labels: null,
      winners: ['c-1', 'c-2', 'c-3'],
      season: '2026',
      city: 'Chicago',
    };

    render(
      <MemoryRouter>
        <WinnersPodium
          competition={competition}
          contestants={mockContestants}
        />
      </MemoryRouter>
    );

    // Ordinal badges
    expect(screen.getByText('1st')).toBeInTheDocument();
    expect(screen.getByText('2nd')).toBeInTheDocument();
    expect(screen.getByText('3rd')).toBeInTheDocument();

    // Custom labels should not be present
    expect(screen.queryByText('Reina')).not.toBeInTheDocument();
    expect(screen.queryByText('Virreina')).not.toBeInTheDocument();
    expect(screen.queryByText('Princesa')).not.toBeInTheDocument();
  });

  it('falls back to ordinal for ranks beyond configured placement labels length', () => {
    const competition = {
      id: 'comp-partial',
      number_of_winners: 3,
      winners_split_by_gender: false,
      winner_placement_labels: ['Reina', 'Virreina'], // only 2 labels for 3 winners
      winners: ['c-1', 'c-2', 'c-3'],
      season: '2026',
      city: 'Chicago',
    };

    render(
      <MemoryRouter>
        <WinnersPodium
          competition={competition}
          contestants={mockContestants}
        />
      </MemoryRouter>
    );

    expect(screen.getAllByText('Reina').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Virreina').length).toBeGreaterThanOrEqual(1);
    // 3rd place falls back to ordinal
    expect(screen.getByText('3rd')).toBeInTheDocument();
  });

  it('does not override division champions when winners_split_by_gender is true', () => {
    const mixedContestants = [
      { id: 'm-1', name: 'Carlos Mendez', gender: 'male', votes: 100 },
      { id: 'f-1', name: 'Elena Torres', gender: 'female', votes: 110 },
    ];

    const competition = {
      id: 'comp-split',
      number_of_winners: 2,
      winners_split_by_gender: true,
      winner_placement_labels: ['Reina', 'Virreina'], // configured but split is on
      winners: ['m-1', 'f-1'],
      season: '2026',
      city: 'Chicago',
    };

    render(
      <MemoryRouter>
        <WinnersPodium
          competition={competition}
          contestants={mixedContestants}
        />
      </MemoryRouter>
    );

    // Division labels should appear, not Reina / Virreina
    expect(screen.getByText("Men's Winner")).toBeInTheDocument();
    expect(screen.getByText("Women's Winner")).toBeInTheDocument();
    expect(screen.queryByText('Reina')).not.toBeInTheDocument();
    expect(screen.queryByText('Virreina')).not.toBeInTheDocument();
  });

  it('preserves authoritative order from competitions.winners', () => {
    // Reverse rank order: c-3 first, then c-1, then c-2
    const competition = {
      id: 'comp-authoritative',
      number_of_winners: 3,
      winners_split_by_gender: false,
      winner_placement_labels: ['Reina', 'Virreina', 'Princesa'],
      winners: ['c-3', 'c-1', 'c-2'],
      season: '2026',
    };

    const { container } = render(
      <MemoryRouter>
        <WinnersPodium
          competition={competition}
          contestants={mockContestants}
        />
      </MemoryRouter>
    );

    const names = Array.from(container.querySelectorAll('p')).map((el) => el.textContent);
    // Check order of contestant names
    const c3Index = names.indexOf('Camila Rodriguez');
    const c1Index = names.indexOf('Sofia Alvarez');
    const c2Index = names.indexOf('Valeria Gomez');

    expect(c3Index).toBeLessThan(c1Index);
    expect(c1Index).toBeLessThan(c2Index);
  });

  it('calls onSelect when a contestant card is clicked in WinnersGrid', () => {
    const handleSelect = vi.fn();
    render(
      <WinnersGrid
        winners={mockContestants.slice(0, 2)}
        onSelect={handleSelect}
        year="2026"
        city="Chicago"
        placementLabels={['Reina', 'Virreina']}
      />
    );

    fireEvent.click(screen.getByText('Sofia Alvarez'));
    expect(handleSelect).toHaveBeenCalledWith(mockContestants[0]);
  });
});
