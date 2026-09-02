import { describe, expect, it } from 'vitest';
import { formatInIanaTimezone, resolveIanaLocalDateTime } from './ianaDateTime';

describe('resolveIanaLocalDateTime', () => {
  it('resolves an ordinary local time to the competition zone', () => {
    expect(resolveIanaLocalDateTime('2026-08-31T10:00', 'America/Chicago')).toEqual({
      instantIso: '2026-08-31T15:00:00.000Z',
      ambiguous: false,
    });
  });

  it('rejects a DST gap', () => {
    expect(() => resolveIanaLocalDateTime('2026-03-08T02:30', 'America/Chicago'))
      .toThrowError(expect.objectContaining({ code: 'nonexistent_local_time' }));
  });

  it('selects the later instant for a DST fold', () => {
    expect(resolveIanaLocalDateTime('2026-11-01T01:30', 'America/Chicago')).toEqual({
      instantIso: '2026-11-01T07:30:00.000Z',
      ambiguous: true,
    });
  });
});

describe('formatInIanaTimezone', () => {
  it('formats an instant in the competition zone with a zone abbreviation', () => {
    // dateStyle/timeStyle cannot be combined with timeZoneName in ECMA-402;
    // the first shipped version did exactly that and threw on every render.
    expect(formatInIanaTimezone('2026-12-01T13:00:00Z', 'America/Chicago')).toBe('Dec 1, 2026, 7:00 AM CST');
    expect(formatInIanaTimezone('2026-12-01T13:00:00Z', 'UTC')).toBe('Dec 1, 2026, 1:00 PM UTC');
  });

  it('never throws on an unrecognised zone; falls back to the ISO instant', () => {
    expect(formatInIanaTimezone('2026-12-01T13:00:00Z', 'Not/AZone')).toBe('2026-12-01T13:00:00.000Z');
  });
});
