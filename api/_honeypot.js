/**
 * Honeypot diagnostics for the anonymous-vote endpoint.
 *
 * Kept in its own `_`-prefixed module (Vercel skips these when building
 * routes) so the classification can be unit-tested without pulling in the
 * handler's runtime-only dependencies — same reasoning as _vote-timing.js.
 *
 * #668 stripped the trap's name/id/placeholder so browser autofill would stop
 * keying on it, and added a log line carrying the UA. Production logs since
 * show the trap still fires ~18x/hour, every event a Chrome-family UA, at
 * human pace — so the UA alone cannot tell an autofill spill from a bot.
 *
 * These two functions add the missing discriminator without logging the value
 * itself: WHICH of the voter's own fields it echoes (autofill), and what shape
 * it has when it echoes none of them (a saved company name reads as text, a
 * spam payload does not).
 */

const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/**
 * Which visible field the honeypot value duplicates, if any.
 *
 * @param {unknown} value the honeypot field's submitted value
 * @param {{firstName?: unknown, lastName?: unknown, email?: unknown}} fields
 *   the visible fields from the same submission
 * @returns {'empty'|'firstName'|'lastName'|'fullName'|'email'|'unrelated'}
 */
export function classifyHoneypot(value, { firstName, lastName, email } = {}) {
  const hp = norm(value);
  if (!hp) return 'empty';

  const first = norm(firstName);
  const last = norm(lastName);

  if (first && hp === first) return 'firstName';
  if (last && hp === last) return 'lastName';
  if ((first || last) && hp === `${first} ${last}`.trim()) return 'fullName';
  if (hp === norm(email)) return 'email';

  return 'unrelated';
}

/**
 * Coarse shape of the value, for the 'unrelated' case. Deliberately does not
 * return the value — an organization or address line the browser had saved is
 * the voter's PII, and we only need to know it reads like one.
 *
 * @param {unknown} value
 * @returns {'empty'|'link'|'long'|'textLike'|'other'}
 */
export function honeypotShape(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return 'empty';
  if (/https?:\/\/|<[a-z]|\[url|\bwww\./i.test(raw)) return 'link';
  if (raw.length > 60) return 'long';
  if (/^[\p{L}\p{M}\p{N} .,'&()/-]+$/u.test(raw)) return 'textLike';
  return 'other';
}

/**
 * True when the value is the voter's own data, spilled into the trap by the
 * browser — not something a bot composed. `empty` is excluded deliberately: a
 * truthy non-string honeypot never came from autofill.
 *
 * @param {ReturnType<typeof classifyHoneypot>} verdict
 * @returns {boolean}
 */
export function isAutofillSpill(verdict) {
  return verdict !== 'empty' && verdict !== 'unrelated';
}
