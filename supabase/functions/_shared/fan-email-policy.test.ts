import { describe, expect, it } from 'vitest'
import {
  isEffectivePromotionStart,
  isWeeklyDigestDue,
  retryAt,
  type PromotionWindow,
} from './fan-email-policy'

const windows: PromotionWindow[] = [
  {
    id: 'two', competition_id: 'comp', multiplier: 2,
    starts_at: '2026-08-31T15:00:00Z', ends_at: '2026-08-31T19:00:00Z', cancelled_at: null,
  },
  {
    id: 'three', competition_id: 'comp', multiplier: 3,
    starts_at: '2026-08-31T16:00:00Z', ends_at: '2026-08-31T18:00:00Z', cancelled_at: null,
  },
  {
    id: 'lower-hidden', competition_id: 'comp', multiplier: 2,
    starts_at: '2026-08-31T16:30:00Z', ends_at: '2026-08-31T17:30:00Z', cancelled_at: null,
  },
]

describe('fan email occurrence policy', () => {
  it('schedules Thursday at 10 in each IANA timezone', () => {
    expect(isWeeklyDigestDue(new Date('2026-09-03T15:30:00Z'), 'America/Chicago')).toBe(true)
    expect(isWeeklyDigestDue(new Date('2026-09-03T14:30:00Z'), 'America/Chicago')).toBe(false)
  })

  it('allows 1-to-2 and 2-to-3 effective transitions', () => {
    expect(isEffectivePromotionStart(windows[0]!, windows)).toBe(true)
    expect(isEffectivePromotionStart(windows[1]!, windows)).toBe(true)
  })

  it('suppresses a lower promotion starting under an active higher one', () => {
    expect(isEffectivePromotionStart(windows[2]!, windows)).toBe(false)
  })

  it('suppresses a 2x boost scheduled on a day that is already a double-vote day', () => {
    // Compatibility double-vote days are part of the effective multiplier. A
    // 2x boost opening on one is 2 -> 2, not 1 -> 2, so announcing it would
    // promise a change no voter can observe. 2026-08-31 is the local date of
    // the `two` window's start in America/Chicago.
    const compat = { dates: ['2026-08-31'], timezone: 'America/Chicago' }
    expect(isEffectivePromotionStart(windows[0]!, windows, compat)).toBe(false)
    // 3x still clears it: the effective value really does rise from 2 to 3.
    expect(isEffectivePromotionStart(windows[1]!, windows, compat)).toBe(true)
  })

  it('uses deterministic capped retry backoff', () => {
    expect(retryAt(new Date('2026-08-31T00:00:00Z'), 1)).toBe('2026-08-31T00:05:00.000Z')
    expect(retryAt(new Date('2026-08-31T00:00:00Z'), 20)).toBe('2026-09-01T00:00:00.000Z')
  })
})
