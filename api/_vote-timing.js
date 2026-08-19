/**
 * Shared timing guard for the anonymous-vote endpoint.
 *
 * Kept in its own `_`-prefixed module (Vercel skips these when building
 * routes) so the decision can be unit-tested without pulling in the handler's
 * runtime-only dependencies.
 */

export const MIN_SUBMIT_MS = 1500;

/**
 * True when a submission arrived implausibly soon after the form mounted.
 *
 * `mountedAt` comes from Date.now() in the browser and is compared against
 * Date.now() here — two different clocks. A device running fast yields a
 * NEGATIVE elapsed time, which is not evidence of a bot, it is evidence of an
 * unsynced clock. Treat any reading we cannot trust as "not fast" and let the
 * honeypot, BotID and rate limits do the filtering.
 *
 * @param {unknown} mountedAt client ms timestamp captured when the form mounted
 * @param {number} now server ms timestamp
 * @param {number} minMs minimum plausible fill time
 * @returns {boolean}
 */
export function isSuspiciouslyFast(mountedAt, now = Date.now(), minMs = MIN_SUBMIT_MS) {
  if (mountedAt === undefined || mountedAt === null || mountedAt === '') return false;

  const stamped = Number(mountedAt);
  if (!Number.isFinite(stamped)) return false;

  const elapsed = now - stamped;
  if (elapsed < 0) return false; // client clock ahead of ours — unusable reading

  return elapsed < minMs;
}
