import { getCompetitionPublicPath } from '../config/competitionAliases';

/**
 * Slug Generation Utilities
 *
 * SINGLE SOURCE OF TRUTH for all slug generation in the app.
 * Used by: CompetitionsManager, navigation handlers, URL construction
 */

/**
 * Convert text to URL-safe slug
 * @param {string} text - Text to slugify
 * @returns {string} URL-safe slug
 */
export function slugify(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')  // Remove special characters
    .replace(/[\s_]+/g, '-')        // Replace spaces/underscores with dashes
    .replace(/-+/g, '-')            // Collapse multiple dashes
    .replace(/^-|-$/g, '');         // Remove leading/trailing dashes
}

/**
 * Remove state suffix from city slug (e.g., "chicago-il" -> "chicago")
 * @param {string} citySlug - City slug potentially with state
 * @returns {string} City slug without state
 */
export function removeCityStateSuffix(citySlug) {
  if (!citySlug) return '';
  return citySlug.replace(/-[a-z]{2}$/i, '');
}

/**
 * Generate competition slug
 *
 * Format: {name}-{city}-{year} for open demographic
 * Format: {name}-{city}-{year}-{demographic} for specific demographic
 *
 * NOTE: new competitions use the shorter generateShortCompetitionSlug() below.
 * This longer form is kept for existing competitions and legacy callers.
 *
 * @param {Object} params
 * @param {string} params.name - Competition name (e.g., "Most Eligible")
 * @param {string} params.citySlug - City slug (e.g., "chicago" or "chicago-il")
 * @param {number} params.season - Season year (e.g., 2026)
 * @param {string} [params.demographicSlug] - Demographic slug (e.g., "women-21-39")
 * @returns {string} Competition slug
 *
 * @example
 * generateCompetitionSlug({ name: "Elite Single Women", citySlug: "chicago-il", season: 2026 })
 * // Returns: "elite-single-women-chicago-2026"
 *
 * @example
 * generateCompetitionSlug({ name: "Most Eligible", citySlug: "chicago", season: 2026, demographicSlug: "women-21-39" })
 * // Returns: "most-eligible-chicago-2026-women-21-39"
 */
export function generateCompetitionSlug({ name, citySlug, season, demographicSlug }) {
  const namePart = slugify(name || 'competition');
  const cityPart = removeCityStateSuffix(citySlug || 'unknown');
  const yearPart = season || new Date().getFullYear();

  // Open demographic or no demographic specified
  if (!demographicSlug || demographicSlug === 'open') {
    return `${namePart}-${cityPart}-${yearPart}`;
  }

  // Specific demographic
  return `${namePart}-${cityPart}-${yearPart}-${demographicSlug}`;
}

/**
 * Short, shareable code for a place used in competition slugs.
 * Multi-word cities → initials (San Francisco → "sf", New York → "ny");
 * single-word → first three letters (Chicago → "chi", Miami → "mia").
 * @param {string} cityName - City name or slug (state suffix is stripped first)
 * @returns {string}
 */
export function cityCode(cityName) {
  if (!cityName) return '';
  const cleaned = removeCityStateSuffix(String(cityName))
    .toLowerCase()
    .replace(/[^a-z\s-]/g, '')
    .trim();
  const words = cleaned.split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 3);
  return words[0].slice(0, 3);
}

/**
 * Generate a SHORT competition slug for sharing/SEO.
 *
 * Format: {name}-{code}-{yy}  (e.g. "creator-of-the-year-chi-26")
 * The org is the URL namespace (/{org}/{slug}) and the per-org uniqueness
 * boundary, so the slug itself stays short. Caller ensures uniqueness within
 * the org (appends -2, -3… on collision).
 *
 * @param {Object} params
 * @param {string} params.name - Competition name
 * @param {string} params.code - Place code: city code, 2-letter state, or "us"
 * @param {number} params.season - Season year (e.g. 2026)
 * @returns {string}
 */
export function generateShortCompetitionSlug({ name, code, season }) {
  const namePart = slugify(name || 'competition');
  const codePart = (code || '').toLowerCase().replace(/[^a-z0-9]/g, '') || 'x';
  const year = season || new Date().getFullYear();
  const yy = String(year).slice(-2);
  return `${namePart}-${codePart}-${yy}`;
}

/**
 * Generate competition URL path
 *
 * @param {string} orgSlug - Organization slug (e.g., "most-eligible")
 * @param {string} competitionSlug - Competition slug
 * @returns {string} URL path (e.g., "/most-eligible/elite-single-women-chicago-2026")
 */
export function getCompetitionUrl(orgSlug, competitionSlug) {
  const org = orgSlug || 'most-eligible';
  return getCompetitionPublicPath(org, competitionSlug) || `/${org}/${competitionSlug}`;
}

/**
 * Generate competition URL by ID (fallback)
 *
 * @param {string} orgSlug - Organization slug
 * @param {string} competitionId - Competition UUID
 * @returns {string} URL path (e.g., "/most-eligible/id/abc-123")
 */
export function getCompetitionUrlById(orgSlug, competitionId) {
  const org = orgSlug || 'most-eligible';
  return `/${org}/id/${competitionId}`;
}

/**
 * Check if a URL path segment looks like a competition slug
 * (contains a 4-digit year)
 *
 * @param {string} segment - URL path segment
 * @returns {boolean}
 */
export function isCompetitionSlug(segment) {
  if (!segment) return false;
  // Long/legacy slugs contain a 4-digit year anywhere.
  if (/\d{4}/.test(segment)) return true;
  // Short slugs end with -{code}-{yy} (e.g. "creator-of-the-year-chi-26").
  return /-[a-z]{2,3}-\d{2}$/i.test(segment);
}

/**
 * Check if a URL path segment is an ID route
 *
 * @param {string} segment - URL path segment
 * @returns {boolean}
 */
export function isIdRoute(segment) {
  return segment === 'id';
}

/**
 * Extract year from competition slug
 *
 * @param {string} slug - Competition slug
 * @returns {number|null} Year or null if not found
 */
export function extractYearFromSlug(slug) {
  if (!slug) return null;
  const match = slug.match(/\d{4}/);
  return match ? parseInt(match[0], 10) : null;
}

/**
 * Reserved paths that should NOT be treated as organization slugs
 */
export const RESERVED_PATHS = [
  'c',        // Legacy competition route prefix
  'org',      // Organization routes
  'login',    // Auth
  'claim',    // Claim nomination
  'claim-judge', // Claim judge invite
  'judge',    // Judge dashboard / scoring
  'admin',    // Admin panel
  'profile',  // User profile
  'api',      // API routes
  'auth',     // Auth callbacks
  'rewards',  // Rewards
  'events',   // Events
  'news',     // News/announcements
  'about',    // About page
  'host',     // Host marketing page
  'join',     // Join/signup
  'photobooth', // Temporary event photo booth
];

/**
 * Check if a path segment is reserved
 *
 * @param {string} segment - URL path segment
 * @returns {boolean}
 */
export function isReservedPath(segment) {
  if (!segment) return false;
  return RESERVED_PATHS.includes(segment.toLowerCase());
}
