import { sortContestantsByStanding } from './contestantRanking';

/** Host-facing standings are always scoped to the active round. */
export function sortHostContestantsByRound(contestants) {
  return sortContestantsByStanding(
    contestants,
    (contestant) => contestant.roundVotes ?? contestant.votes ?? 0,
  );
}

/**
 * Legacy's live contestant counter is the same current-round figure used by
 * the public leaderboard, profile cards, and round finalization.
 */
export function deriveHostRoundVotes(contestant) {
  return Math.max(0, Number(contestant?.votes) || 0);
}

export function describeLockedRoundOutcome(round, isFinalRound) {
  const count = Number(round?.contestants_advance) || 0;
  return `Top ${count} ${isFinalRound ? 'crowned' : 'advance'}`;
}

const toCents = (amount) => Math.round((Number(amount) || 0) * 100);

/**
 * Build the part of a host settlement that EliteRank can prove from its own
 * ledger. Stripe processing fees are intentionally excluded: direct charges
 * settle on the host account and Stripe is the source of truth for that fee.
 */
export function buildHostFinancialSummary({
  grossRevenue,
  revenueExcludingTax,
  platformFeePct,
  charityPct,
}) {
  const grossCents = Math.max(0, toCents(grossRevenue));
  const revenueCents = Math.min(
    grossCents,
    Math.max(0, toCents(revenueExcludingTax ?? grossRevenue)),
  );
  const taxCents = grossCents - revenueCents;
  const feeRate = Math.max(0, Number(platformFeePct) || 0);
  // Legacy does not persist Stripe's application-fee amount. This reproduces
  // the configured rate against the aggregate and is labelled as an estimate.
  const platformFeeCents = Math.round((revenueCents * feeRate) / 100);
  const hostBeforeStripeCents = Math.max(0, revenueCents - platformFeeCents);
  const donationRate = Math.max(0, Number(charityPct) || 0);

  return {
    grossCents,
    taxCents,
    revenueCents,
    platformFeeCents,
    hostBeforeStripeCents,
    charityReserveBeforeStripeCents:
      donationRate > 0 ? Math.round((hostBeforeStripeCents * donationRate) / 100) : 0,
  };
}
