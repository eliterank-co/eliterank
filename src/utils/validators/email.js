/**
 * Email validation + normalization — the single source of truth for how the
 * app decides an email is well-formed and how it stores one.
 *
 * Every form (client-side validation) and every write path (before an insert
 * or update) should use these helpers instead of ad-hoc `.includes('@')`
 * checks or inline `.trim()` / `.toLowerCase()`. Keeping one definition is
 * what prevents the drift that let values like "idk" get saved as a nominee
 * email on some entry points while others rejected them.
 */

// Loose, pragmatic shape check: local@domain.tld with no whitespace. This is a
// syntactic gate meant to stop junk (idk, n/a, blanks, "foo@bar" with no TLD),
// not a proof of deliverability — the email provider verifies that downstream.
// Intentionally NOT full RFC 5322; that regex is unreadable and rejects almost
// nothing extra in practice.
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Normalize an email for storage and comparison.
 *
 * - Pulls the bare address out of a "Name <addr>" contact string (some pickers
 *   hand us that shape).
 * - Trims surrounding whitespace.
 * - Lowercases, so there is a single canonical form. Emails are effectively
 *   case-insensitive, and storing one casing keeps unique constraints and
 *   lookups (dedupe, claim-by-email) from splitting the same person in two.
 *
 * Returns '' when there is nothing usable, so callers can do
 * `normalizeEmail(x) || null` for nullable columns.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeEmail(raw) {
  if (!raw) return '';
  const str = String(raw).trim();
  const bracketed = str.match(/<([^>]+)>\s*$/);
  const addr = bracketed ? bracketed[1] : str;
  return addr.trim().toLowerCase();
}

/**
 * True when the value is a well-formed email address. Accepts raw user input —
 * it normalizes internally — so callers can pass exactly what was typed.
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function isValidEmail(raw) {
  return EMAIL_REGEX.test(normalizeEmail(raw));
}
