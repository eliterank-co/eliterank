/**
 * Honeypot rules for the anonymous-vote endpoint.
 *
 * Kept in its own `_`-prefixed module (Vercel skips these when building
 * routes) so the decision can be unit-tested without pulling in the handler's
 * runtime-only dependencies — same reasoning as _vote-timing.js.
 *
 * History, because this trap has been wrong twice:
 *
 *   #668 stripped the trap's name/id/placeholder so browser autofill would
 *   stop keying on it, and added a log line carrying the UA.
 *   #675 stopped rejecting values that echoed a visible field, on the theory
 *   that autofill was writing the voter's own name back into the trap.
 *   #676 added the fields needed to check that theory.
 *
 * Fourteen hours of production data then said both were wrong. Every single
 * honeypot event was `verdict: 'unrelated'` — never an echo, so #675 helped
 * nobody — and every one was `shape: 'textLike'` with a browser fingerprint,
 * a 4-29s fill time, and distinct values across distinct networks and
 * distinct contestant pages. Those are real voters whose browsers wrote a
 * saved profile field into the trap, not bots.
 *
 * So the text trap only ever produced false positives, and the rule below
 * stops treating arbitrary text as evidence. What replaces it is a checkbox
 * on the client, which autofill cannot tick at all — see the honeypot input
 * in CompetitionCardVoting.jsx.
 */

const norm = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');

/** What a ticked honeypot checkbox submits. Autofill never produces this. */
export const CHECKBOX_TRIPPED = 'on';

/**
 * Which visible field the honeypot value duplicates, if any. Diagnostic only —
 * the reject decision no longer turns on it, but it stays in the logs so a
 * change in the mix is visible.
 *
 * @param {unknown} value the honeypot field's submitted value
 * @param {{firstName?: unknown, lastName?: unknown, email?: unknown}} fields
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
 * Coarse shape of the value. Deliberately does not return the value — an
 * organization or address line the browser had saved is the voter's PII, and
 * we only need to know it reads like one.
 *
 * @param {unknown} value
 * @returns {'empty'|'link'|'long'|'textLike'|'other'}
 */
export function honeypotShape(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return 'empty';
  if (/https?:\/\/|<[a-z]|\[url|\bwww\./i.test(raw)) return 'link';
  if (raw.length > 60) return 'long';
  if (/^[\p{L}\p{M}\p{N} .,'&()/@+-]+$/u.test(raw)) return 'textLike';
  return 'other';
}

/**
 * The rule. Rejects only on evidence that survived contact with production:
 *
 *   - a ticked checkbox, which no autofill implementation can produce;
 *   - a link or markup payload, which no address book holds;
 *   - something longer than any name, organization or address line.
 *
 * Everything else passes. Short text in this field means a browser wrote a
 * saved profile value into it, which is what 100% of measured events were.
 * A voter is not a bot because Chrome filled a field they cannot see.
 *
 * Passing here is not "no checks" — device fingerprint+IP dedup, per-voter
 * email dedup, the per-IP email cap and the active-round check all still run.
 *
 * @param {unknown} value
 * @param {{firstName?: unknown, lastName?: unknown, email?: unknown}} fields
 * @returns {{verdict: string, shape: string, reject: boolean, rule: string}}
 */
export function shouldRejectHoneypot(value, fields = {}) {
  const verdict = classifyHoneypot(value, fields);
  const shape = honeypotShape(value);

  // A truthy value that is not a string never came out of a form control.
  if (value && typeof value !== 'string') return { verdict, shape, reject: true, rule: 'payload' };

  if (verdict === 'empty') return { verdict, shape, reject: false, rule: 'empty' };
  if (norm(value) === CHECKBOX_TRIPPED) return { verdict, shape, reject: true, rule: 'checkbox' };
  if (shape === 'link' || shape === 'long' || shape === 'other') {
    return { verdict, shape, reject: true, rule: 'payload' };
  }

  return { verdict, shape, reject: false, rule: 'autofill' };
}
