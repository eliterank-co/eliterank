/**
 * Competition System Type Definitions & Constants
 *
 * This file defines the data structures and constants used throughout
 * the competition management system.
 */

// =============================================================================
// STATUS CONSTANTS
// =============================================================================

// Re-export from competitionPhase.js for backwards compatibility
// COMPETITION_STATUSES is the single source of truth
import { COMPETITION_STATUSES } from '../utils/competitionPhase';
export const COMPETITION_STATUS = COMPETITION_STATUSES;

export const STATUS_CONFIG = {
  [COMPETITION_STATUS.DRAFT]: {
    label: 'Draft',
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.2)',
    description: 'Only visible to super admin',
  },
  pending_approval: {
    label: 'Pending approval',
    color: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.2)',
    description: 'Submitted by host — awaiting EliteRank approval',
  },
  approved: {
    label: 'Approved',
    color: '#3b82f6',
    bg: 'rgba(59, 130, 246, 0.2)',
    description: 'Approved — host can publish to public',
  },
  [COMPETITION_STATUS.PUBLISH]: {
    label: 'Published',
    color: '#d4af37',
    bg: 'rgba(212, 175, 55, 0.2)',
    description: 'Public can view interest form',
  },
  [COMPETITION_STATUS.LIVE]: {
    label: 'Live',
    color: '#22c55e',
    bg: 'rgba(34, 197, 94, 0.2)',
    description: 'Competition is active',
  },
  [COMPETITION_STATUS.ARCHIVE]: {
    label: 'Archived',
    color: '#6b7280',
    bg: 'rgba(107, 114, 128, 0.2)',
    description: 'Hidden from public',
  },
  [COMPETITION_STATUS.COMPLETED]: {
    label: 'Completed',
    color: '#8b5cf6',
    bg: 'rgba(139, 92, 246, 0.2)',
    description: 'Competition has ended',
  },
};

// =============================================================================
// SELECTION CRITERIA
// =============================================================================

export const SELECTION_CRITERIA = {
  VOTES: 'votes',
  HYBRID: 'hybrid',
};

export const SELECTION_CRITERIA_CONFIG = {
  [SELECTION_CRITERIA.VOTES]: {
    label: 'Public Votes Only',
    description: 'Winner determined 100% by public votes',
  },
  [SELECTION_CRITERIA.HYBRID]: {
    label: 'Hybrid (Votes + Judges)',
    description: 'Combination of public votes and judge scores',
  },
};

// =============================================================================
// INTEREST TYPES
// =============================================================================

export const INTEREST_TYPE = {
  HOSTING: 'hosting',
  SPONSORING: 'sponsoring',
  COMPETING: 'competing',
  JUDGING: 'judging',
};

export const INTEREST_TYPE_CONFIG = {
  [INTEREST_TYPE.HOSTING]: {
    label: 'Host a Competition',
    description: 'Organize and run a competition in your city',
  },
  [INTEREST_TYPE.SPONSORING]: {
    label: 'Become a Sponsor',
    description: 'Support the competition and gain brand visibility',
  },
  [INTEREST_TYPE.COMPETING]: {
    label: 'Enter the Arena',
    description: 'Compete and show your city you\'re the most eligible',
  },
  [INTEREST_TYPE.JUDGING]: {
    label: 'Judging',
    description: 'Help evaluate and score contestants',
  },
};

// =============================================================================
// US STATES
// =============================================================================

export const US_STATES = [
  { code: 'AL', name: 'Alabama' },
  { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' },
  { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' },
  { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' },
  { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' },
  { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' },
  { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' },
  { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' },
  { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' },
  { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' },
  { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' },
  { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' },
  { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' },
  { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' },
  { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' },
  { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' },
  { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' },
  { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' },
  { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' },
  { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' },
  { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' },
  { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' },
  { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' },
  { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' },
  { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' },
  { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'District of Columbia' },
];

// =============================================================================
// PRICE BUNDLER CONFIG
// =============================================================================

export const PRICE_BUNDLER_TIERS = [
  { minVotes: 1,   maxVotes: 9,    discount: 0,  pricePerVote: 1.00 },
  { minVotes: 10,  maxVotes: 19,   discount: 10, pricePerVote: 0.90 },
  { minVotes: 20,  maxVotes: 49,   discount: 15, pricePerVote: 0.85 },
  { minVotes: 50,  maxVotes: 99,   discount: 20, pricePerVote: 0.80 },
  { minVotes: 100, maxVotes: 249,  discount: 30, pricePerVote: 0.70 },
  { minVotes: 250, maxVotes: 499,  discount: 50, pricePerVote: 0.50 },
  { minVotes: 500, maxVotes: 1000, discount: 60, pricePerVote: 0.40 },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate a URL-safe slug from a string
 */
export function generateSlug(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate a city slug from name and state
 */
export function generateCitySlug(cityName, stateCode) {
  return `${generateSlug(cityName)}-${stateCode.toLowerCase()}`;
}

/**
 * Generate a competition URL path
 * Format: /{org}/{name}-{city}-{year} for open demographic
 * Format: /{org}/{name}-{city}-{year}-{demographic} for specific demographic
 * @param {string} orgSlug - Organization slug
 * @param {string} nameSlug - Competition name slug
 * @param {string} citySlug - City slug (without state, e.g., "chicago" not "chicago-il")
 * @param {number} season - Season year
 * @param {string} [demographicSlug] - Demographic slug (omit for "open")
 */
export function generateCompetitionUrl(orgSlug, nameSlug, citySlug, season, demographicSlug) {
  // Extract just the city name part if slug includes state (e.g., "chicago-il" -> "chicago")
  const cityPart = citySlug.replace(/-[a-z]{2}$/i, '');

  // Format: name-city-year-demographics
  if (!demographicSlug || demographicSlug === 'open') {
    return `/${orgSlug}/${nameSlug}-${cityPart}-${season}`;
  }
  return `/${orgSlug}/${nameSlug}-${cityPart}-${season}-${demographicSlug}`;
}

/**
 * Parse a competition URL slug to extract components
 * New format: {name}-{city}-{year} or {name}-{city}-{year}-{demographic}
 * @param {string} slug - The slug part (e.g., "most-eligible-chicago-2028" or "most-eligible-chicago-2028-men-21-39")
 * @returns {{ slug: string, year: number, demographic: string|null }|null}
 */
export function parseCompetitionSlug(slug) {
  if (!slug) return null;

  // Known demographic slugs (must match database)
  const demographicSlugs = [
    'women-21-39',
    'women-40-plus',
    'men-21-39',
    'men-40-plus',
    'lgbtq-plus-21-39',
    'lgbtq-plus-40-plus',
    'all-genders-29-45',
    'all-genders-45-plus',
  ];

  // New format: {name}-{city}-{year}-{demographic} or {name}-{city}-{year}
  // Demographic is at the END (after year) if present

  let demographic = null;
  let remaining = slug;

  // Check if slug ends with a known demographic
  for (const demoSlug of demographicSlugs) {
    if (slug.endsWith(`-${demoSlug}`)) {
      demographic = demoSlug;
      remaining = slug.slice(0, -(demoSlug.length + 1)); // Remove "-{demographic}"
      break;
    }
  }

  // Year should be at the end of remaining (4 digits)
  const yearMatch = remaining.match(/-(\d{4})$/);
  if (!yearMatch) return null;

  const year = parseInt(yearMatch[1], 10);
  const nameAndCity = remaining.slice(0, -5); // Remove "-YYYY"

  // Return the full slug for direct lookup, plus extracted components
  return { slug, nameAndCity, demographic, year };
}

/**
 * Calculate vote price based on bundler tiers.
 * tier.pricePerVote is a multiplier against the competition's base price
 * (e.g. 0.90 = 10% off), matching the admin bundler preview.
 */
export function calculateVotePrice(voteCount, useBundler = false, basePricePerVote = 1.00) {
  if (!useBundler) {
    return voteCount * basePricePerVote;
  }

  const tier = PRICE_BUNDLER_TIERS.find(
    t => voteCount >= t.minVotes && voteCount <= t.maxVotes
  ) || PRICE_BUNDLER_TIERS[PRICE_BUNDLER_TIERS.length - 1];

  return voteCount * basePricePerVote * tier.pricePerVote;
}

/**
 * Get the current competition phase based on dates
 * Supports both nomination_periods array and flat nomination fields
 */
export function getCurrentPhase(settings, nominationPeriods = []) {
  if (!settings) return null;

  const now = new Date();
  const finaleDate = settings.finals_date ? new Date(settings.finals_date) : null;

  // After finale
  if (finaleDate && now >= finaleDate) {
    return { phase: 'completed', label: 'Completed' };
  }

  // Check voting/judging rounds
  const votingRounds = settings.voting_rounds || [];
  const sortedRounds = [...votingRounds].sort((a, b) => (a.round_order || 0) - (b.round_order || 0));

  // Check if in any voting or judging round
  for (const round of sortedRounds) {
    const roundStart = round.start_date ? new Date(round.start_date) : null;
    const roundEnd = round.end_date ? new Date(round.end_date) : null;
    if (roundStart && roundEnd && now >= roundStart && now < roundEnd) {
      const phase = round.round_type === 'judging' ? 'judging' : 'voting';
      return { phase, label: round.title, round };
    }
  }

  // Check nomination periods (new system)
  const periods = nominationPeriods.length > 0 ? nominationPeriods : [];
  if (periods.length > 0) {
    const sortedPeriods = [...periods].sort((a, b) => (a.period_order || 0) - (b.period_order || 0));

    for (const period of sortedPeriods) {
      const periodStart = period.start_date ? new Date(period.start_date) : null;
      const periodEnd = period.end_date ? new Date(period.end_date) : null;
      if (periodStart && periodEnd && now >= periodStart && now < periodEnd) {
        return { phase: 'nomination', label: period.title || 'Nominations Open', period };
      }
    }

    const firstPeriod = sortedPeriods[0];
    const firstStart = firstPeriod?.start_date ? new Date(firstPeriod.start_date) : null;
    if (firstStart && now < firstStart) {
      return { phase: 'upcoming', label: 'Coming Soon' };
    }

    const lastPeriod = sortedPeriods[sortedPeriods.length - 1];
    const lastEnd = lastPeriod?.end_date ? new Date(lastPeriod.end_date) : null;
    if (lastEnd && now >= lastEnd) {
      const firstRound = sortedRounds[0];
      if (firstRound && now < new Date(firstRound.start_date)) {
        return { phase: 'between', label: 'Nominations Closed' };
      }
    }
  } else {
    // Fallback to flat fields
    const nominationStart = settings.nomination_start ? new Date(settings.nomination_start) : null;
    const nominationEnd = settings.nomination_end ? new Date(settings.nomination_end) : null;

    if (nominationStart && nominationEnd) {
      if (now >= nominationStart && now < nominationEnd) {
        return { phase: 'nomination', label: 'Nominations Open' };
      }
      if (now < nominationStart) {
        return { phase: 'upcoming', label: 'Coming Soon' };
      }
    }

    // Between nomination end and first voting round
    if (nominationEnd && now >= nominationEnd) {
      const firstRound = sortedRounds[0];
      if (firstRound && now < new Date(firstRound.start_date)) {
        return { phase: 'between', label: 'Nominations Closed' };
      }
    }
  }

  // Check if after last round
  if (sortedRounds.length > 0) {
    const lastRound = sortedRounds[sortedRounds.length - 1];
    const lastRoundEnd = lastRound?.end_date ? new Date(lastRound.end_date) : null;
    if (lastRoundEnd && now >= lastRoundEnd) {
      return { phase: 'between', label: 'Awaiting Finals' };
    }
  }

  return { phase: 'unknown', label: 'TBD' };
}

/**
 * Check if competition should auto-complete
 */
export function shouldAutoComplete(competition, settings) {
  if (competition.status === COMPETITION_STATUS.COMPLETED) return false;
  if (competition.status !== COMPETITION_STATUS.LIVE) return false;

  const finaleDate = settings?.finals_date ? new Date(settings.finals_date) : null;
  if (!finaleDate) return false;

  return new Date() >= finaleDate;
}

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const DEFAULT_COMPETITION = {
  organization_id: null,
  city_id: null,
  season: new Date().getFullYear() + 1,
  status: COMPETITION_STATUS.DRAFT,
  entry_type: 'nominations',
  has_events: false,
  number_of_winners: 5,
  winner_placement_labels: null,
  selection_criteria: SELECTION_CRITERIA.VOTES,
  host_id: null,
  description: '',
  rules_doc_url: '',
};

export const DEFAULT_COMPETITION_SETTINGS = {
  price_per_vote: 1.00,
  use_price_bundler: false,
  nomination_start: null,
  nomination_end: null,
  finals_date: null,
};

export const DEFAULT_VOTING_ROUND = {
  title: '',
  round_order: 1,
  round_type: 'voting', // 'voting' | 'judging' | 'resurrection' | 'finale'
  start_date: null,
  end_date: null,
  contestants_advance: 10,
  tier_label: '',
  votes_reset_at_start: false,
};

export const DEFAULT_NOMINATION_PERIOD = {
  title: '',
  period_order: 1,
  start_date: null,
  end_date: null,
  max_submissions: null, // null = unlimited
};

export const ROUND_TYPES = {
  VOTING: 'voting',
  JUDGING: 'judging',
  RESURRECTION: 'resurrection',
  FINALE: 'finale',
};

export const ROUND_TYPE_CONFIG = {
  voting: {
    label: 'Public Voting',
    description: 'Public can vote for contestants',
    icon: 'Vote',
    color: '#22c55e',
  },
  judging: {
    label: 'Judging',
    description: 'Judges score contestants',
    icon: 'Award',
    color: '#8b5cf6',
  },
  resurrection: {
    label: 'Resurrection',
    description: 'Eliminated contestants compete for wildcard spots',
    icon: 'Vote',
    color: '#22c55e',
  },
  finale: {
    label: 'Finale',
    description: 'Final round — top finishers crowned as winners',
    icon: 'Trophy',
    color: '#22c55e',
  },
};

export const DEFAULT_PRIZE = {
  title: '',
  description: '',
  image_url: null,
  value: '',
  external_url: '',
  sort_order: 0,
};

export const DEFAULT_RULE_SECTION = {
  section_title: '',
  section_content: '',
  sort_order: 0,
};
