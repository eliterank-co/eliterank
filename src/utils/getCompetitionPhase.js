/**
 * Public-facing competition phase detector
 *
 * This module provides a simplified interface for determining competition phases
 * for public pages. It wraps the internal competitionPhase utilities.
 *
 * Phases:
 * - 'coming-soon': Competition announced but not yet accepting nominations
 * - 'nominations': Accepting nominations/applications
 * - 'voting': Active voting round (any non-finale, non-resurrection round)
 * - 'resurrection': Special round for eliminated contestants
 * - 'finals': Final voting round
 * - 'results': Competition complete, showing winners
 * - 'draft': Not yet public (host only)
 * - 'cancelled': Competition was cancelled
 *
 * The display name for a voting round comes from `voting_rounds.tier_label`
 * (e.g. "Top 50") and is exposed as `phase.label` and `phase.tier`. Falls back
 * to `voting_rounds.title` and finally to `Round N`.
 */

import {
  normalizeStatus,
  isDraft,
  isPublished,
  isLive,
  isCompleted,
  isArchived,
  isPendingApproval,
  isApproved,
  isCancelled,
} from './competitionPhase';

/**
 * Determine the current phase of a competition for public display
 *
 * @param {object} competition - Competition object from database
 * @param {Array} votingRounds - Array of voting_rounds for this competition
 * @param {Array} nominationPeriods - Array of nomination_periods for this competition
 * @returns {object} Phase info object
 */
export function getCompetitionPhase(
  competition,
  votingRounds = [],
  nominationPeriods = []
) {
  if (!competition) {
    return { phase: 'unknown', label: 'Unknown', isPublic: false };
  }

  const now = new Date();
  // Normalize status once at the top - handles variants like 'published' -> 'publish'
  const rawStatus = competition.status;
  const status = normalizeStatus(rawStatus);

  // Debug: log status processing
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[getCompetitionPhase] Competition: ${competition.name || competition.id}, Raw status: "${rawStatus}", Normalized: "${status}"`);
  }

  // Handle terminal / pre-public states using helper functions.
  // These must come before the timeline logic so a competition that hasn't
  // gone public yet (draft, under review, approved) never resolves to a
  // public voting/nomination phase from its timeline dates.
  if (isCancelled(status)) {
    return {
      phase: 'cancelled',
      label: 'Cancelled',
      isPublic: false,
      isVoting: false,
      canNominate: false,
    };
  }

  if (isCompleted(status)) {
    return {
      phase: 'results',
      label: 'Results',
      isPublic: true,
      isVoting: false,
      canNominate: false,
      isComplete: true,
    };
  }

  if (isDraft(status)) {
    return {
      phase: 'draft',
      label: 'Draft',
      isPublic: false,
      isVoting: false,
      canNominate: false,
    };
  }

  // Submitted-for-approval ("under review"): host-only, not yet public.
  if (isPendingApproval(status)) {
    return {
      phase: 'pending-approval',
      label: 'Under Review',
      isPublic: false,
      isVoting: false,
      canNominate: false,
    };
  }

  // Approved but not yet published to the public.
  if (isApproved(status)) {
    return {
      phase: 'approved',
      label: 'Approved',
      isPublic: false,
      isVoting: false,
      canNominate: false,
    };
  }

  if (isArchived(status)) {
    return {
      phase: 'archived',
      label: 'Archived',
      isPublic: false,
      isVoting: false,
      canNominate: false,
    };
  }

  // Use voting_rounds from competition if not provided
  const rounds = votingRounds.length > 0 ? votingRounds : competition.voting_rounds || [];
  const periods =
    nominationPeriods.length > 0
      ? nominationPeriods
      : competition.nomination_periods || [];

  // Check for active voting round
  const activeVotingRound = findActiveVotingRound(rounds, now);

  if (activeVotingRound) {
    const roundPhase = determineRoundPhase(activeVotingRound);
    return {
      phase: roundPhase.phase,
      label: roundPhase.label,
      tier: roundPhase.tier,
      roundType: roundPhase.roundType,
      isPublic: true,
      isVoting: true,
      canNominate: false,
      currentRound: activeVotingRound,
      roundNumber: activeVotingRound.round_order,
      endsAt: activeVotingRound.end_date,
      timeRemaining: getTimeRemaining(activeVotingRound.end_date),
    };
  }

  // Check for active nomination period
  const activeNomination = findActiveNominationPeriod(periods, now);

  if (activeNomination || isLive(status)) {
    // If live but no active voting, check if nominations are open
    const nominationStart = competition.nomination_start
      ? new Date(competition.nomination_start)
      : null;
    const nominationEnd = competition.nomination_end
      ? new Date(competition.nomination_end)
      : null;

    // Check nomination periods first
    if (activeNomination) {
      return {
        phase: 'nominations',
        label: activeNomination.title || 'Nominations Open',
        isPublic: true,
        isVoting: false,
        canNominate: true,
        endsAt: activeNomination.end_date,
        timeRemaining: getTimeRemaining(activeNomination.end_date),
        currentPeriod: activeNomination,
      };
    }

    // Fall back to flat nomination dates (end-exclusive, matching the period
    // and voting-round windows).
    if (
      nominationStart &&
      nominationEnd &&
      now >= nominationStart &&
      now < nominationEnd
    ) {
      return {
        phase: 'nominations',
        label: 'Nominations Open',
        isPublic: true,
        isVoting: false,
        canNominate: true,
        endsAt: nominationEnd,
        timeRemaining: getTimeRemaining(nominationEnd),
      };
    }
  }

  // Check for coming soon (publish status)
  // Status is already normalized, so just use the helper
  if (isPublished(status)) {
    const nominationStart = competition.nomination_start
      ? new Date(competition.nomination_start)
      : null;

    return {
      phase: 'coming-soon',
      label: 'Coming Soon',
      isPublic: true,
      isVoting: false,
      canNominate: false,
      startsAt: nominationStart,
      timeRemaining: nominationStart ? getTimeRemaining(nominationStart) : null,
    };
  }

  // Default: if live but between rounds/nominations
  if (isLive(status)) {
    // Find next upcoming round
    const nextRound = findNextVotingRound(rounds, now);

    if (nextRound) {
      return {
        phase: 'between-rounds',
        label: 'Between Rounds',
        isPublic: true,
        isVoting: false,
        canNominate: false,
        nextRound: nextRound,
        startsAt: nextRound.start_date,
        timeRemaining: getTimeRemaining(nextRound.start_date),
      };
    }
  }

  // Fallback
  return {
    phase: 'unknown',
    label: status || 'Unknown',
    isPublic: isLive(status) || isPublished(status),
    isVoting: false,
    canNominate: false,
  };
}

/**
 * Find currently active voting round
 */
function findActiveVotingRound(votingRounds, now) {
  if (!Array.isArray(votingRounds)) return null;

  return votingRounds.find((round) => {
    const start = round.start_date ? new Date(round.start_date) : null;
    const end = round.end_date ? new Date(round.end_date) : null;

    if (!start || !end) return false;
    // End-exclusive to match computeTimelinePhase / getCurrentPhase: a round is
    // no longer "active" once its end instant is reached.
    return now >= start && now < end;
  });
}

/**
 * Find next upcoming voting round
 */
function findNextVotingRound(votingRounds, now) {
  if (!Array.isArray(votingRounds)) return null;

  const upcoming = votingRounds
    .filter((round) => {
      const start = round.start_date ? new Date(round.start_date) : null;
      return start && start > now;
    })
    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

  return upcoming[0] || null;
}

/**
 * Find currently active nomination period
 */
function findActiveNominationPeriod(nominationPeriods, now) {
  if (!Array.isArray(nominationPeriods)) return null;

  return nominationPeriods.find((period) => {
    const start = period.start_date ? new Date(period.start_date) : null;
    const end = period.end_date ? new Date(period.end_date) : null;

    if (!start || !end) return false;
    // End-exclusive, consistent with the voting-round window above.
    return now >= start && now < end;
  });
}

/**
 * Determine specific round phase based on round properties.
 *
 * Returns `{ phase, label, tier, roundType }` where:
 * - `phase` is one of 'voting' | 'finals' | 'resurrection'
 * - `label` is the host-defined display name (tier_label || title || `Round N`)
 * - `tier` is the explicit tier_label (or null)
 * - `roundType` is the underlying round_type column value
 */
function determineRoundPhase(round) {
  const title = (round.title || '').toLowerCase();
  const roundType = (round.round_type || 'voting').toLowerCase();
  const tier = round.tier_label || null;
  const roundNum = round.round_order || 1;
  const label = tier || round.title || `Round ${roundNum}`;

  if (roundType === 'resurrection' || title.includes('resurrection')) {
    return { phase: 'resurrection', label, tier, roundType: 'resurrection' };
  }

  if (
    roundType === 'finale' ||
    roundType === 'finals' ||
    title.includes('final')
  ) {
    return { phase: 'finals', label, tier, roundType: 'finale' };
  }

  return { phase: 'voting', label, tier, roundType };
}

/**
 * Calculate time remaining until a date
 */
export function getTimeRemaining(endDate) {
  if (!endDate) return null;

  const end = new Date(endDate);
  const now = new Date();
  const diff = end - now;

  if (diff <= 0) {
    return {
      expired: true,
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      total: 0,
    };
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return {
    expired: false,
    days,
    hours,
    minutes,
    seconds,
    total: diff,
    formatted: formatTimeRemaining(days, hours, minutes),
  };
}

/**
 * Format time remaining for display
 */
function formatTimeRemaining(days, hours, minutes) {
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

/**
 * Check if competition is in a voting phase
 */
export function isVotingPhase(phase) {
  return ['voting', 'resurrection', 'finals'].includes(phase);
}

/**
 * Check if competition is publicly visible
 */
export function isPublicPhase(phase) {
  return [
    'coming-soon',
    'nominations',
    'voting',
    'resurrection',
    'finals',
    'results',
    'between-rounds',
  ].includes(phase);
}

export default getCompetitionPhase;
