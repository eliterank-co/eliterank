/**
 * Competition Phase Utilities
 *
 * Host launch lifecycle (see HostLaunchStatus):
 *   draft → pending_approval → approved → publish → live → completed
 *
 * Status System:
 * - draft: Not viewable on public page
 * - pending_approval: Submitted by host — awaiting EliteRank approval ("under review")
 * - approved: Approved by EliteRank — host can publish to public
 * - publish: Viewable with "Coming Soon" teaser, shows interest forms
 * - live: Full visibility, follows timeline dates (nomination → voting → finale)
 * - completed: Competition over, winners displayed
 * - archive: Hidden from public but data preserved
 * - cancelled: Terminal — competition was cancelled
 *
 * Timeline dates control the phase ONLY when status is "live" (or a live
 * sub-phase like nomination/voting/finals is stored directly in status).
 */

// Valid competition statuses (host lifecycle + super-admin controls)
export const COMPETITION_STATUSES = {
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  PUBLISH: 'publish',
  LIVE: 'live',
  COMPLETED: 'completed',
  ARCHIVE: 'archive',
  CANCELLED: 'cancelled',
};

// Timeline-based phases (used when status is "live")
export const TIMELINE_PHASES = {
  NOMINATION: 'nomination',   // During any active prospecting period
  VOTING: 'voting',           // During an active voting round
  JUDGING: 'judging',         // During an active judging round
  BETWEEN_ROUNDS: 'between',  // Between rounds/periods
  COMPLETED: 'completed',     // After finale date
};

// =============================================================================
// STATUS NORMALIZATION - Single source of truth for status variants
// =============================================================================

/**
 * Normalize competition status to canonical form.
 * Handles variations like 'published' -> 'publish', 'coming-soon' -> 'publish'.
 *
 * @param {string} status - Raw status string from database or elsewhere
 * @returns {string} Normalized canonical status value
 */
export function normalizeStatus(status) {
  // Handle null/undefined - treat as draft
  if (!status) return COMPETITION_STATUSES.DRAFT;

  const s = String(status).toLowerCase().trim();

  // Handle empty string - treat as draft
  if (!s) return COMPETITION_STATUSES.DRAFT;

  // Map variants to canonical values
  // Include common variations and typos
  const statusMap = {
    // Draft variants
    'draft': COMPETITION_STATUSES.DRAFT,
    // Pending-approval ("under review") variants
    'pending_approval': COMPETITION_STATUSES.PENDING_APPROVAL,
    'pending-approval': COMPETITION_STATUSES.PENDING_APPROVAL,
    'pending': COMPETITION_STATUSES.PENDING_APPROVAL,
    'under_review': COMPETITION_STATUSES.PENDING_APPROVAL,
    'review': COMPETITION_STATUSES.PENDING_APPROVAL,
    // Approved variants
    'approved': COMPETITION_STATUSES.APPROVED,
    // Publish variants
    'published': COMPETITION_STATUSES.PUBLISH,
    'publish': COMPETITION_STATUSES.PUBLISH,
    'coming_soon': COMPETITION_STATUSES.PUBLISH,
    'coming-soon': COMPETITION_STATUSES.PUBLISH,
    'coming soon': COMPETITION_STATUSES.PUBLISH,
    'comingsoon': COMPETITION_STATUSES.PUBLISH,
    'upcoming': COMPETITION_STATUSES.PUBLISH,
    // Live variants — including live sub-phases sometimes stored in `status`.
    // These are timeline-driven once live, so treat them as LIVE and let the
    // timeline computation resolve the exact sub-phase.
    'live': COMPETITION_STATUSES.LIVE,
    'active': COMPETITION_STATUSES.LIVE,
    'nomination': COMPETITION_STATUSES.LIVE,
    'nominations': COMPETITION_STATUSES.LIVE,
    'voting': COMPETITION_STATUSES.LIVE,
    'judging': COMPETITION_STATUSES.LIVE,
    'finals': COMPETITION_STATUSES.LIVE,
    'finale': COMPETITION_STATUSES.LIVE,
    // Completed variants
    'completed': COMPETITION_STATUSES.COMPLETED,
    'complete': COMPETITION_STATUSES.COMPLETED,
    'finished': COMPETITION_STATUSES.COMPLETED,
    'ended': COMPETITION_STATUSES.COMPLETED,
    // Archive variants
    'archived': COMPETITION_STATUSES.ARCHIVE,
    'archive': COMPETITION_STATUSES.ARCHIVE,
    // Cancelled variants
    'cancelled': COMPETITION_STATUSES.CANCELLED,
    'canceled': COMPETITION_STATUSES.CANCELLED,
  };

  return statusMap[s] || COMPETITION_STATUSES.DRAFT;
}

// =============================================================================
// STATUS CHECK HELPERS - Use these instead of direct string comparisons
// =============================================================================

/**
 * Check if competition status is draft
 * @param {string} status - Competition status
 * @returns {boolean}
 */
export function isDraft(status) {
  return normalizeStatus(status) === COMPETITION_STATUSES.DRAFT;
}

/**
 * Check if competition status is pending approval ("under review")
 * @param {string} status - Competition status
 * @returns {boolean}
 */
export function isPendingApproval(status) {
  return normalizeStatus(status) === COMPETITION_STATUSES.PENDING_APPROVAL;
}

/**
 * Check if competition status is approved (ready for host to publish)
 * @param {string} status - Competition status
 * @returns {boolean}
 */
export function isApproved(status) {
  return normalizeStatus(status) === COMPETITION_STATUSES.APPROVED;
}

/**
 * Check if competition status is cancelled
 * @param {string} status - Competition status
 * @returns {boolean}
 */
export function isCancelled(status) {
  return normalizeStatus(status) === COMPETITION_STATUSES.CANCELLED;
}

/**
 * Check if competition status is published (coming soon)
 * @param {string} status - Competition status
 * @returns {boolean}
 */
export function isPublished(status) {
  return normalizeStatus(status) === COMPETITION_STATUSES.PUBLISH;
}

/**
 * Check if competition status is live
 * @param {string} status - Competition status
 * @returns {boolean}
 */
export function isLive(status) {
  return normalizeStatus(status) === COMPETITION_STATUSES.LIVE;
}

/**
 * Check if competition status is completed
 * @param {string} status - Competition status
 * @returns {boolean}
 */
export function isCompleted(status) {
  return normalizeStatus(status) === COMPETITION_STATUSES.COMPLETED;
}

/**
 * Check if competition status is archived
 * @param {string} status - Competition status
 * @returns {boolean}
 */
export function isArchived(status) {
  return normalizeStatus(status) === COMPETITION_STATUSES.ARCHIVE;
}

/**
 * Compute the current phase of a competition.
 *
 * If status is "live", compute phase from timeline dates.
 * Otherwise, return the status directly.
 *
 * @param {Object} competition - Competition object
 * @returns {string} The current phase/status
 */
export function computeCompetitionPhase(competition) {
  if (!competition) return COMPETITION_STATUSES.DRAFT;

  // Normalize first so lifecycle statuses (pending_approval, approved,
  // cancelled) and live sub-phases stored in `status` (voting, finals, …)
  // resolve to a canonical value instead of leaking raw strings.
  const status = normalizeStatus(competition.status);

  // If not "live", the canonical status IS the phase
  if (!isLive(status)) {
    return status;
  }

  // Status is "live" - compute phase from timeline
  return computeTimelinePhase(competition);
}

/**
 * Compute the timeline-based phase for an active competition.
 *
 * Supports:
 * - nomination_periods array (multiple prospecting periods with custom names)
 * - voting_rounds array with round_type ('voting' or 'judging')
 * - Flat fields fallback for backwards compatibility
 *
 * @param {Object} competition - Competition with timeline fields
 * @returns {string} The timeline phase
 */
export function computeTimelinePhase(competition) {
  const now = new Date();

  // Get settings - could be nested under .settings or flat on competition
  const settings = competition.settings || {};

  // Helper to get date from either settings or competition (settings takes priority)
  const getDate = (settingsKey, compKey) => {
    const value = settings[settingsKey] || competition[compKey || settingsKey];
    return value ? new Date(value) : null;
  };

  const finalsDate = getDate('finals_date');

  // Phase 1: Completed - after finals date
  if (finalsDate && now >= finalsDate) {
    return TIMELINE_PHASES.COMPLETED;
  }

  // Get nomination periods (new system)
  const nominationPeriods = competition.nomination_periods || [];

  // Get voting/judging rounds
  const votingRounds = competition.voting_rounds || [];
  const sortedRounds = [...votingRounds].sort((a, b) => (a.round_order || 0) - (b.round_order || 0));

  // Check if currently in any voting or judging round
  for (const round of sortedRounds) {
    const roundStart = round.start_date ? new Date(round.start_date) : null;
    const roundEnd = round.end_date ? new Date(round.end_date) : null;
    if (roundStart && roundEnd && now >= roundStart && now < roundEnd) {
      // Return phase based on round_type
      if (round.round_type === 'judging') {
        return TIMELINE_PHASES.JUDGING;
      }
      return TIMELINE_PHASES.VOTING;
    }
  }

  // Check if currently in any nomination/prospecting period (new system)
  if (nominationPeriods.length > 0) {
    const sortedPeriods = [...nominationPeriods].sort((a, b) => (a.period_order || 0) - (b.period_order || 0));

    for (const period of sortedPeriods) {
      const periodStart = period.start_date ? new Date(period.start_date) : null;
      const periodEnd = period.end_date ? new Date(period.end_date) : null;
      if (periodStart && periodEnd && now >= periodStart && now < periodEnd) {
        return TIMELINE_PHASES.NOMINATION;
      }
    }

    // Get overall nomination window
    const firstPeriod = sortedPeriods[0];
    const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
    const nomStart = firstPeriod?.start_date ? new Date(firstPeriod.start_date) : null;
    const nomEnd = lastPeriod?.end_date ? new Date(lastPeriod.end_date) : null;

    // If before first nomination period starts
    if (nomStart && now < nomStart) {
      return TIMELINE_PHASES.NOMINATION; // Show as upcoming nominations
    }

    // If after all nomination periods but before first round
    if (nomEnd && now >= nomEnd) {
      const firstRound = sortedRounds[0];
      const firstRoundStart = firstRound?.start_date ? new Date(firstRound.start_date) : null;
      if (firstRoundStart && now < firstRoundStart) {
        return TIMELINE_PHASES.BETWEEN_ROUNDS;
      }
    }
  } else {
    // Fallback to flat fields for backwards compatibility
    const nominationStart = getDate('nomination_start');
    const nominationEnd = getDate('nomination_end');

    if (nominationStart && nominationEnd) {
      if (now >= nominationStart && now < nominationEnd) {
        return TIMELINE_PHASES.NOMINATION;
      }
      if (now < nominationStart) {
        return TIMELINE_PHASES.NOMINATION; // Upcoming
      }
      // After nominations, before first voting round — mirrors the periods
      // branch above so legacy flat-field competitions don't fall through
      // to the default NOMINATION return.
      const firstRound = sortedRounds[0];
      const firstRoundStart = firstRound?.start_date ? new Date(firstRound.start_date) : null;
      if (firstRoundStart && now < firstRoundStart) {
        return TIMELINE_PHASES.BETWEEN_ROUNDS;
      }
    }
  }

  // Check if between rounds (after all nomination periods and rounds)
  if (sortedRounds.length > 0) {
    const lastRound = sortedRounds[sortedRounds.length - 1];
    const lastRoundEnd = lastRound?.end_date ? new Date(lastRound.end_date) : null;
    if (lastRoundEnd && now >= lastRoundEnd) {
      // After last round but before finale
      return TIMELINE_PHASES.BETWEEN_ROUNDS;
    }
  }

  // Default to nomination phase if nothing else matches
  return TIMELINE_PHASES.NOMINATION;
}

/**
 * Check if a competition is visible on the public competitions list.
 * Visible statuses: publish, live, completed
 *
 * @param {string} status - The competition status
 * @returns {boolean}
 */
export function isCompetitionVisible(status) {
  const normalized = normalizeStatus(status);
  return [
    COMPETITION_STATUSES.PUBLISH,
    COMPETITION_STATUSES.LIVE,
    COMPETITION_STATUSES.COMPLETED,
  ].includes(normalized);
}

/**
 * Check if a competition is fully accessible (not just teaser).
 * Accessible statuses: live, completed
 *
 * @param {string} status - The competition status
 * @returns {boolean}
 */
export function isCompetitionAccessible(status) {
  const normalized = normalizeStatus(status);
  return [
    COMPETITION_STATUSES.LIVE,
    COMPETITION_STATUSES.COMPLETED,
  ].includes(normalized);
}

// Phases where the competition is actively running — people can still
// nominate, vote, or are being judged. Excludes "Coming Soon" (publish),
// completed, archived, and draft. 'live'/'finals' are included as a safety
// net for data that stores the phase directly in `status`.
const IN_PROGRESS_PHASES = new Set([
  TIMELINE_PHASES.NOMINATION,
  TIMELINE_PHASES.VOTING,
  TIMELINE_PHASES.JUDGING,
  TIMELINE_PHASES.BETWEEN_ROUNDS,
  'finals',
  'live',
]);

/**
 * Whether the competition is actively in progress (nominations through
 * finals), as opposed to Coming Soon or Completed. Use this to gate things
 * that only make sense while contestants can still act — e.g. the "How to
 * Win" guide.
 *
 * @param {Object} competition - Competition object (status, and timeline
 *   fields when available for an accurate live sub-phase).
 * @returns {boolean}
 */
export function isCompetitionInProgress(competition) {
  if (!competition) return false;
  return IN_PROGRESS_PHASES.has(computeCompetitionPhase(competition));
}

/**
 * Legacy function for backward compatibility.
 * @deprecated Use isCompetitionAccessible instead
 */
export function isCompetitionViewable(phase) {
  return isCompetitionAccessible(phase) ||
    [TIMELINE_PHASES.NOMINATION, TIMELINE_PHASES.VOTING, TIMELINE_PHASES.JUDGING, TIMELINE_PHASES.COMPLETED].includes(phase);
}

/**
 * Resolve the competition's nomination window into a simple state machine the
 * UI can gate on. Tolerant of both the new `nomination_periods` array and the
 * legacy flat fields, and of both camelCase (dashboard) and snake_case (raw row)
 * shapes.
 *
 * @param {Object} competition
 * @returns {{ state: 'no_date'|'upcoming'|'open'|'ended', start: Date|null, end: Date|null }}
 *   - no_date:  no nomination start set yet
 *   - upcoming: start date is in the future
 *   - open:     now is within [start, end)
 *   - ended:    end date has passed
 */
export function getNominationWindow(competition) {
  if (!competition) return { state: 'no_date', start: null, end: null };

  const periods = competition.nomination_periods || competition.nominationPeriods || [];
  let start = null;
  let end = null;

  if (periods.length > 0) {
    const sorted = [...periods].sort((a, b) => (a.period_order || 0) - (b.period_order || 0));
    start = sorted[0]?.start_date ? new Date(sorted[0].start_date) : null;
    end = sorted[sorted.length - 1]?.end_date ? new Date(sorted[sorted.length - 1].end_date) : null;
  } else {
    const s = competition.nominationStart || competition.nomination_start;
    const e = competition.nominationEnd || competition.nomination_end;
    start = s ? new Date(s) : null;
    end = e ? new Date(e) : null;
  }

  if (!start || Number.isNaN(start.getTime())) return { state: 'no_date', start: null, end };

  const now = new Date();
  if (now < start) return { state: 'upcoming', start, end };
  if (end && !Number.isNaN(end.getTime()) && now >= end) return { state: 'ended', start, end };
  return { state: 'open', start, end };
}

/**
 * Whether the host is allowed to add nominees right now. Adding is gated on the
 * nomination open date — a host can't seed nominees before nominations have
 * actually opened. True once the open date has passed (window open or ended).
 *
 * @param {Object} competition
 * @returns {boolean}
 */
export function canHostAddNominees(competition) {
  const { state } = getNominationWindow(competition);
  return state === 'open' || state === 'ended';
}

/**
 * Check if nomination dates are set (required for active status)
 * Supports both nomination_periods array and flat fields
 *
 * @param {Object} competition - Competition object
 * @returns {boolean}
 */
export function hasNominationDates(competition) {
  // Check for nomination_periods first (new system)
  const periods = competition?.nomination_periods || [];
  if (periods.length > 0) {
    const firstPeriod = periods[0];
    return !!(firstPeriod?.start_date && firstPeriod?.end_date);
  }

  // Fall back to flat fields
  const nominationStart = competition?.nomination_start || competition?.nominationStart;
  const nominationEnd = competition?.nomination_end || competition?.nominationEnd;
  return !!(nominationStart && nominationEnd);
}

/**
 * Validate if a competition can be set to a given status.
 *
 * @param {Object} competition - Competition object
 * @param {string} newStatus - The desired status
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateStatusChange(competition, newStatus) {
  const currentStatus = competition?.status;

  // Prevent invalid transitions
  if (currentStatus === COMPETITION_STATUSES.COMPLETED && newStatus === COMPETITION_STATUSES.LIVE) {
    return {
      valid: false,
      error: 'Cannot reactivate a completed competition. Create a new season instead.',
    };
  }

  if (currentStatus === COMPETITION_STATUSES.ARCHIVE && newStatus !== COMPETITION_STATUSES.DRAFT) {
    return {
      valid: false,
      error: 'Archived competitions can only be moved back to draft status.',
    };
  }

  if (newStatus === COMPETITION_STATUSES.LIVE) {
    if (!hasNominationDates(competition)) {
      return {
        valid: false,
        error: 'Nomination start and end dates must be set before going live.',
      };
    }
  }

  if (newStatus === COMPETITION_STATUSES.PUBLISH) {
    // Require city and organization for publishing
    // Check both city (joined data) and city_id (foreign key)
    if (!competition?.city && !competition?.city_id) {
      return {
        valid: false,
        error: 'City must be set before publishing a competition.',
      };
    }
  }

  return { valid: true };
}

/**
 * Validate timeline dates are in logical order.
 *
 * @param {Object} competition - Competition object with timeline fields
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTimelineDates(competition) {
  const errors = [];

  // Handle both camelCase and snake_case field names
  const nominationStart = competition?.nominationStart || competition?.nomination_start;
  const nominationEnd = competition?.nominationEnd || competition?.nomination_end;
  const votingStart = competition?.votingStart || competition?.voting_start;
  const votingEnd = competition?.votingEnd || competition?.voting_end;
  const finalsDate = competition?.finalsDate || competition?.finals_date;

  // Parse dates
  const nomStart = nominationStart ? new Date(nominationStart) : null;
  const nomEnd = nominationEnd ? new Date(nominationEnd) : null;
  const voteStart = votingStart ? new Date(votingStart) : null;
  const voteEnd = votingEnd ? new Date(votingEnd) : null;
  const finals = finalsDate ? new Date(finalsDate) : null;

  // Nomination end must be after nomination start
  if (nomStart && nomEnd && nomEnd <= nomStart) {
    errors.push('Nomination end date must be after nomination start date.');
  }

  // Voting start should be on or after nomination start (can overlap with nominations)
  if (nomStart && voteStart && voteStart < nomStart) {
    errors.push('Voting cannot start before nominations start.');
  }

  // Voting end must be after voting start
  if (voteStart && voteEnd && voteEnd <= voteStart) {
    errors.push('Voting end date must be after voting start date.');
  }

  // Finals must be after voting ends (if voting end is set)
  if (voteEnd && finals && finals < voteEnd) {
    errors.push('Finals date must be on or after voting ends.');
  }

  // Finals must be after voting starts (if no voting end but voting start is set)
  if (!voteEnd && voteStart && finals && finals < voteStart) {
    errors.push('Finals date must be after voting starts.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get the display configuration for a phase/status
 *
 * @param {string} phase - The phase or status
 * @returns {Object} Display configuration
 */
export function getPhaseDisplayConfig(phase) {
  const configs = {
    // Super admin statuses
    [COMPETITION_STATUSES.DRAFT]: {
      variant: 'secondary',
      label: 'DRAFT',
      icon: 'FileEdit',
      description: 'Not visible to public',
    },
    [COMPETITION_STATUSES.PENDING_APPROVAL]: {
      variant: 'warning',
      label: 'UNDER REVIEW',
      icon: 'Clock',
      description: 'Submitted — awaiting EliteRank approval',
    },
    [COMPETITION_STATUSES.APPROVED]: {
      variant: 'info',
      label: 'APPROVED',
      icon: 'CheckCircle',
      description: 'Approved — host can publish to public',
    },
    [COMPETITION_STATUSES.CANCELLED]: {
      variant: 'secondary',
      label: 'CANCELLED',
      icon: 'XCircle',
      description: 'Competition was cancelled',
    },
    [COMPETITION_STATUSES.PUBLISH]: {
      variant: 'warning',
      label: 'COMING SOON',
      icon: 'Clock',
      description: 'Visible with teaser page',
    },
    [COMPETITION_STATUSES.LIVE]: {
      variant: 'success',
      label: 'LIVE',
      icon: 'Activity',
      pulse: true,
      description: 'Following timeline dates',
    },
    [COMPETITION_STATUSES.COMPLETED]: {
      variant: 'gold',
      label: 'COMPLETED',
      icon: 'Trophy',
      description: 'Winners displayed',
    },
    [COMPETITION_STATUSES.ARCHIVE]: {
      variant: 'secondary',
      label: 'ARCHIVED',
      icon: 'Archive',
      description: 'Hidden from public',
    },

    // Timeline phases (shown when status is live)
    [TIMELINE_PHASES.NOMINATION]: {
      variant: 'warning',
      label: 'NOMINATIONS OPEN',
      icon: 'UserPlus',
      pulse: true,
    },
    [TIMELINE_PHASES.VOTING]: {
      variant: 'success',
      label: 'VOTING LIVE',
      icon: 'Vote',
      pulse: true,
    },
    [TIMELINE_PHASES.JUDGING]: {
      variant: 'info',
      label: 'JUDGING',
      icon: 'Award',
      pulse: true,
    },
    [TIMELINE_PHASES.BETWEEN_ROUNDS]: {
      variant: 'success',
      label: 'LIVE',
      icon: 'Activity',
      pulse: true,
    },
    [TIMELINE_PHASES.COMPLETED]: {
      variant: 'gold',
      label: 'COMPLETED',
      icon: 'Trophy',
    },

    // Legacy fallbacks
    setup: { variant: 'secondary', label: 'SETUP', icon: 'Settings' },
    assigned: { variant: 'warning', label: 'COMING SOON', icon: 'Clock' },
    voting: { variant: 'success', label: 'VOTING LIVE', icon: 'Vote', pulse: true },
    live: { variant: 'success', label: 'LIVE', icon: 'Activity', pulse: true },
    completed: { variant: 'gold', label: 'COMPLETED', icon: 'Trophy' },
  };

  return configs[phase] || configs[COMPETITION_STATUSES.DRAFT];
}

/**
 * Get status options for super admin dropdown
 *
 * @returns {Array<{ value: string, label: string, description: string }>}
 */
export function getStatusOptions() {
  return [
    {
      value: COMPETITION_STATUSES.DRAFT,
      label: 'Draft',
      description: 'Not visible to public',
    },
    {
      value: COMPETITION_STATUSES.PUBLISH,
      label: 'Published',
      description: 'Visible with "Coming Soon" teaser',
    },
    {
      value: COMPETITION_STATUSES.LIVE,
      label: 'Live',
      description: 'Full visibility - follows timeline dates',
    },
    {
      value: COMPETITION_STATUSES.COMPLETED,
      label: 'Completed',
      description: 'Winners displayed',
    },
    {
      value: COMPETITION_STATUSES.ARCHIVE,
      label: 'Archived',
      description: 'Hidden but data preserved',
    },
  ];
}

/**
 * Format a date for timeline display
 *
 * @param {string} dateStr - ISO date string
 * @param {Object} options - Formatting options
 * @returns {string|null} Formatted date or null if invalid
 */
export function formatTimelineDate(dateStr, options = {}) {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    const defaultOptions = {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      ...options,
    };

    return date.toLocaleDateString('en-US', defaultOptions);
  } catch {
    return null;
  }
}

/**
 * Get the status of a date period (upcoming, active, ended)
 *
 * @param {string} startDate - Start date ISO string
 * @param {string} endDate - End date ISO string (optional)
 * @returns {string|null} 'upcoming', 'active', 'ended', or null
 */
export function getDatePeriodStatus(startDate, endDate) {
  if (!startDate) return null;

  const now = new Date();
  const start = new Date(startDate);
  const end = endDate ? new Date(endDate) : null;

  if (now < start) return 'upcoming';
  if (end && now > end) return 'ended';
  if (!end && now > start) return 'ended';

  return 'active';
}

/**
 * Check if a competition should auto-transition from publish to live.
 * This happens when status is 'publish' and the first nomination period has started.
 *
 * Checks nomination_periods (new system) first, then falls back to
 * legacy nomination_start field for backwards compatibility.
 *
 * @param {Object} competition - Competition object (should include nomination_periods array)
 * @param {Object} settings - Competition settings (with nomination_start for legacy)
 * @returns {boolean} True if should transition to live
 */
export function shouldAutoTransitionToLive(competition, settings = null) {
  if (!competition) return false;

  // Only applies to competitions with status 'publish' (or variants like 'published')
  if (!isPublished(competition.status)) return false;

  const now = new Date();

  // NEW SYSTEM: Check nomination_periods first
  const nominationPeriods = competition?.nomination_periods || [];
  if (nominationPeriods.length > 0) {
    // Sort by period_order to get the first period
    const sortedPeriods = [...nominationPeriods].sort(
      (a, b) => (a.period_order || 0) - (b.period_order || 0)
    );
    const firstPeriodStart = sortedPeriods[0]?.start_date;

    if (firstPeriodStart) {
      const startDate = new Date(firstPeriodStart);
      // If first nomination period has started, should transition to live
      return now >= startDate;
    }
  }

  // LEGACY FALLBACK: Check flat nomination_start field
  const nominationStart = settings?.nomination_start || competition?.nomination_start;

  if (!nominationStart) return false;

  const startDate = new Date(nominationStart);

  // If nomination start has passed, should transition to live
  return now >= startDate;
}

/**
 * Check if a competition should auto-transition from live to completed.
 * This happens when status is 'live' and finals_date has passed.
 *
 * @param {Object} competition - Competition object
 * @param {Object} settings - Competition settings (with finals_date)
 * @returns {boolean} True if should transition to completed
 */
export function shouldAutoTransitionToCompleted(competition, settings = null) {
  if (!competition) return false;

  // Only applies to competitions with status 'live'
  if (competition.status !== COMPETITION_STATUSES.LIVE) return false;

  // Check finals_date from settings first, then from competition
  const finaleDate = settings?.finals_date || competition?.finals_date;

  if (!finaleDate) return false;

  const now = new Date();
  const endDate = new Date(finaleDate);

  // If finale date has passed, should transition to completed
  return now >= endDate;
}

/**
 * Get UI permissions based on the current phase.
 * Use this to determine what actions are allowed in the UI.
 *
 * @param {string} phase - The current phase (from computeCompetitionPhase)
 * @returns {Object} Permission flags for UI controls
 */
export function getPhasePermissions(phase) {
  return {
    allowVoting: phase === TIMELINE_PHASES.VOTING,
    allowJudging: phase === TIMELINE_PHASES.JUDGING,
    allowNominations: phase === TIMELINE_PHASES.NOMINATION,
    showResults: phase === TIMELINE_PHASES.COMPLETED || phase === 'completed',
    isActive: phase !== COMPETITION_STATUSES.DRAFT && phase !== COMPETITION_STATUSES.ARCHIVE,
    isBetweenRounds: phase === TIMELINE_PHASES.BETWEEN_ROUNDS,
  };
}

// =============================================================================
// LISTING ORDER - Rank competitions by how close they are to finalizing
// =============================================================================

// How far along a competition is, by phase. Higher = closer to finalizing.
// Mirrors the timeline order (nomination → voting → finals/judging → done),
// with the between-rounds gap treated as "awaiting finals".
const PHASE_PROGRESS = {
  [TIMELINE_PHASES.NOMINATION]: 0,
  [TIMELINE_PHASES.VOTING]: 1,
  [TIMELINE_PHASES.BETWEEN_ROUNDS]: 2,
  [TIMELINE_PHASES.JUDGING]: 3,
  [TIMELINE_PHASES.COMPLETED]: 4,
};

function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/**
 * The timestamp a competition is expected to wrap up — its finale date if set,
 * otherwise the end of its latest known phase. Used to break ties between
 * competitions sitting in the same phase.
 */
function finalizationTime(comp) {
  return toTime(comp.finals_date) ?? toTime(comp.voting_end) ?? toTime(comp.nomination_end);
}

/**
 * Comparator that orders competitions by proximity to finalizing: the one
 * furthest along (later phase) comes first, then the one finalizing soonest,
 * falling back to most-recently-created. Pass to Array.prototype.sort().
 *
 * @param {{phase: string, finals_date?, voting_end?, nomination_end?, createdAt?, created_at?}} a
 * @param {object} b
 */
export function compareByFinalizationProximity(a, b) {
  const progressA = PHASE_PROGRESS[a.phase] ?? -1;
  const progressB = PHASE_PROGRESS[b.phase] ?? -1;
  if (progressA !== progressB) return progressB - progressA; // later phase first

  const finalizeA = finalizationTime(a);
  const finalizeB = finalizationTime(b);
  if (finalizeA !== finalizeB) {
    if (finalizeA === null) return 1;  // unknown finalize date sinks
    if (finalizeB === null) return -1;
    return finalizeA - finalizeB;      // soonest to finalize first
  }

  // Stable fallback: newest first, matching the prior default ordering.
  const createdA = toTime(a.createdAt ?? a.created_at) ?? 0;
  const createdB = toTime(b.createdAt ?? b.created_at) ?? 0;
  return createdB - createdA;
}
