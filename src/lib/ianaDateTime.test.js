import { describe, expect, it } from 'vitest';
import { resolveIanaLocalDateTime } from './ianaDateTime';

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
