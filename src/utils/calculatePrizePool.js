/**
 * Calculate prize pool — winner takes all.
 *
 * Revenue split:
 * - 50% of vote purchases → Prize pool (entirely awarded to 1st place)
 * - 30% of vote purchases → Host
 * - 20% of vote purchases → Platform
 *
 * 1st place receives the full prize pool: host minimum + 50% of vote revenue.
 *
 * @param {number} prizePoolMinimum - Host's guaranteed minimum contribution
 * @param {number} voteRevenue - Total revenue from vote purchases (the 50% that goes to prizes)
 * @returns {object} Prize pool breakdown
 */
export function calculatePrizePool(prizePoolMinimum = 1000, voteRevenue = 0) {
  const parsedMinimum =
    prizePoolMinimum == null || prizePoolMinimum === ''
      ? 1000
      : Number(prizePoolMinimum);
  const hostMinimum = Number.isFinite(parsedMinimum) ? parsedMinimum : 1000;
  const revenue = Number(voteRevenue) || 0;

  // Preserves the historical total: 100% of host minimum + 50% of the
  // already-halved vote-revenue portion. Keeping the same total means the
  // change to winner-takes-all doesn't silently move the dollar amount
  // shown on live competitions.
  const totalPrizePool = hostMinimum + revenue * 0.5;
  const firstPrize = totalPrizePool;

  return {
    hostMinimum,
    voteRevenue: revenue,
    firstPrize,
    totalPrizePool,
    // Formatted versions for display
    formatted: {
      hostMinimum: formatPrizeCurrency(hostMinimum),
      voteRevenue: formatPrizeCurrency(revenue),
      firstPrize: formatPrizeCurrency(firstPrize),
      totalPrizePool: formatPrizeCurrency(totalPrizePool),
    },
  };
}

/**
 * Calculate vote revenue from votes array or sum
 * @param {Array|number} votes - Array of vote objects with amount_paid (+ optional
 *   tax_amount), or a pre-calculated sum
 * @returns {number} Total vote revenue (the portion that goes to prizes)
 *
 * Collected sales tax (e.g. HST) is NOT vote revenue — it's a pass-through the
 * host remits to the tax authority — so it is excluded from the prize base.
 * tax_amount defaults to 0, so untaxed competitions are unaffected.
 */
export function calculateVoteRevenue(votes) {
  if (typeof votes === 'number') {
    return votes;
  }

  if (Array.isArray(votes)) {
    const totalPaid = votes.reduce((sum, vote) => {
      const paid = Number(vote.amount_paid) || 0;
      const tax = Number(vote.tax_amount) || 0;
      return sum + (paid - tax);
    }, 0);
    // 50% of purchases go to prize pool
    return totalPaid * 0.5;
  }

  return 0;
}

/**
 * Get prize position info for a contestant rank (winner-takes-all).
 *
 * @param {number} rank - Contestant's current rank
 * @param {object} prizePool - Prize pool object from calculatePrizePool
 * @returns {object|null} Prize info for 1st place, null otherwise
 */
export function getPrizePosition(rank, prizePool) {
  if (rank !== 1) return null;
  return {
    position: '1st',
    label: '1st Place',
    amount: prizePool.firstPrize,
    formatted: prizePool.formatted.firstPrize,
    colorClass: 'prize-gold',
    iconName: 'crown',
  };
}

/**
 * Format number as currency for prize display
 * @param {number} amount
 * @returns {string}
 */
function formatPrizeCurrency(amount) {
  return '$' + Math.floor(amount).toLocaleString();
}

export default calculatePrizePool;
