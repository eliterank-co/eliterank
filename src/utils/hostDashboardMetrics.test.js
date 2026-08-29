import { describe, expect, it } from 'vitest';
import {
  buildHostFinancialSummary,
  deriveHostRoundVotes,
  describeLockedRoundOutcome,
  sortHostContestantsByRound,
} from './hostDashboardMetrics';

describe('sortHostContestantsByRound', () => {
  it('orders and reports the active round instead of lifetime totals', () => {
    const result = sortHostContestantsByRound([
      { id: 'lifetime-leader', status: 'active', votes: 8, lifetimeVotes: 3797 },
      { id: 'round-leader', status: 'active', votes: 19, lifetimeVotes: 120 },
    ]);

    expect(result.map((contestant) => contestant.id)).toEqual([
      'round-leader',
      'lifetime-leader',
    ]);
    expect(result.map((contestant) => contestant.votes)).toEqual([19, 8]);
  });
});

describe('deriveHostRoundVotes', () => {
  it('uses the same current-round counter as leaderboard and finalization', () => {
    expect(deriveHostRoundVotes({ id: 'contestant-a', votes: 19 })).toBe(19);
  });
});

describe('describeLockedRoundOutcome', () => {
  it('states configured cuts including an explicit zero', () => {
    expect(describeLockedRoundOutcome({ contestants_advance: 20 }, false))
      .toBe('Top 20 advance');
    expect(describeLockedRoundOutcome({ contestants_advance: 0 }, false))
      .toBe('Top 0 advance');
    expect(describeLockedRoundOutcome({ contestants_advance: 2, round_type: 'finale' }, true))
      .toBe('Top 2 crowned');
  });
});

describe('buildHostFinancialSummary', () => {
  it('separates collected tax and the per-transaction platform fee from gross sales', () => {
    const summary = buildHostFinancialSummary({
      grossRevenue: 16.3,
      revenueExcludingTax: 15,
      platformFeePct: 15,
      charityPct: 10,
    });

    expect(summary).toEqual({
      grossCents: 1630,
      taxCents: 130,
      revenueCents: 1500,
      platformFeeCents: 225,
      hostBeforeStripeCents: 1275,
      charityReserveBeforeStripeCents: 128,
    });
  });
});
