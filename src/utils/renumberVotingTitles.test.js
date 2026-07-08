import { describe, it, expect } from 'vitest';
import { renumberVotingTitles } from './renumberVotingTitles';

describe('renumberVotingTitles', () => {
  it('renumbers generic titles to schedule order', () => {
    // The real bug: "Add Voting" inserted a round before the final one, so the
    // numbers drifted (Round 4 landed ahead of Round 3).
    const rounds = [
      { round_type: 'voting', title: 'Voting Round 1' },
      { round_type: 'voting', title: 'Voting Round 2' },
      { round_type: 'voting', title: 'Voting Round 4' },
      { round_type: 'voting', title: 'Voting Round 3' },
    ];
    expect(renumberVotingTitles(rounds).map((r) => r.title)).toEqual([
      'Voting Round 1',
      'Voting Round 2',
      'Voting Round 3',
      'Voting Round 4',
    ]);
  });

  it('preserves host-typed custom titles', () => {
    const rounds = [
      { round_type: 'voting', title: 'Opening Round' },
      { round_type: 'voting', title: 'Voting Round 5' },
      { round_type: 'voting', title: 'Semifinals' },
    ];
    expect(renumberVotingTitles(rounds).map((r) => r.title)).toEqual([
      'Opening Round',
      'Voting Round 2',
      'Semifinals',
    ]);
  });

  it('fills a blank title with its position', () => {
    const rounds = [
      { round_type: 'voting', title: 'Voting Round 1' },
      { round_type: 'voting', title: '' },
    ];
    expect(renumberVotingTitles(rounds).map((r) => r.title)).toEqual([
      'Voting Round 1',
      'Voting Round 2',
    ]);
  });

  it('skips judging rounds and does not count them', () => {
    const rounds = [
      { round_type: 'voting', title: 'Voting Round 1' },
      { round_type: 'voting', title: 'Round 3' },
      { round_type: 'judging', title: 'Judging Round' },
    ];
    const out = renumberVotingTitles(rounds);
    expect(out.map((r) => r.title)).toEqual([
      'Voting Round 1',
      'Voting Round 2',
      'Judging Round',
    ]);
  });

  it('returns unchanged rows by identity (memo-safe)', () => {
    const rounds = [
      { round_type: 'voting', title: 'Voting Round 1' },
      { round_type: 'voting', title: 'Voting Round 3' },
    ];
    const out = renumberVotingTitles(rounds);
    expect(out[0]).toBe(rounds[0]); // already correct → same ref
    expect(out[1]).not.toBe(rounds[1]); // renumbered → new ref
    expect(out[1].title).toBe('Voting Round 2');
  });

  it('tolerates empty / nullish input', () => {
    expect(renumberVotingTitles([])).toEqual([]);
    expect(renumberVotingTitles(null)).toEqual([]);
    expect(renumberVotingTitles(undefined)).toEqual([]);
  });
});
