import { describe, it, expect } from 'vitest';
import { isSuspiciouslyFast } from './_vote-timing.js';

/**
 * `mountedAt` is stamped by Date.now() in the BROWSER and compared against
 * Date.now() on the SERVER. The two clocks are not the same clock, so a device
 * running even slightly fast produces a negative elapsed time — which the
 * original `elapsed < 1500` test read as "submitted before the form existed"
 * and rejected. Those voters saw "Submitted too fast", and because this path
 * logged nothing they were invisible among the generic 400s.
 */
describe('isSuspiciouslyFast', () => {
  const now = 1_000_000_000_000;

  it('rejects a genuine sub-1.5s submission', () => {
    expect(isSuspiciouslyFast(now - 400, now)).toBe(true);
  });

  it('allows a submission that took longer than the floor', () => {
    expect(isSuspiciouslyFast(now - 5_000, now)).toBe(false);
  });

  it('allows a device whose clock runs ahead of the server', () => {
    // Phone is 10s fast: elapsed reads as -10s. Not a bot — an unsynced clock.
    expect(isSuspiciouslyFast(now + 10_000, now)).toBe(false);
  });

  it('allows a device that is only slightly ahead', () => {
    expect(isSuspiciouslyFast(now + 200, now)).toBe(false);
  });

  it('skips the check when the client sent no timestamp', () => {
    expect(isSuspiciouslyFast(undefined, now)).toBe(false);
    expect(isSuspiciouslyFast(null, now)).toBe(false);
  });

  it('skips the check when the timestamp is not a finite number', () => {
    expect(isSuspiciouslyFast('not-a-number', now)).toBe(false);
    expect(isSuspiciouslyFast(NaN, now)).toBe(false);
    expect(isSuspiciouslyFast(Infinity, now)).toBe(false);
  });

  it('treats the boundary as fast enough to allow', () => {
    expect(isSuspiciouslyFast(now - 1500, now)).toBe(false);
  });
});
