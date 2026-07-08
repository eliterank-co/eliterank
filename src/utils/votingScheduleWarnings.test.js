import { describe, it, expect } from 'vitest';
import { getVotingBeforeNominationsWarning } from './votingScheduleWarnings';

const NOM_CLOSE = '2026-11-18T09:00:00.000Z';

describe('getVotingBeforeNominationsWarning', () => {
  it('flags voting rounds that start before nominations close', () => {
    // The real bug: rounds seeded from an earlier planned-launch date sit
    // before the host's actual nomination window.
    const rounds = [
      { round_type: 'voting', start_date: '2026-08-04T22:21:00.000Z' },
      { round_type: 'voting', start_date: '2026-08-14T22:21:00.000Z' },
    ];
    const result = getVotingBeforeNominationsWarning(rounds, NOM_CLOSE);
    expect(result).toEqual({
      earliestStartIso: '2026-08-04T22:21:00.000Z',
      nominationCloseIso: NOM_CLOSE,
    });
  });

  it('returns null when voting starts after nominations close', () => {
    const rounds = [
      { round_type: 'voting', start_date: '2026-11-23T09:00:00.000Z' },
      { round_type: 'voting', start_date: '2026-12-05T09:00:00.000Z' },
    ];
    expect(getVotingBeforeNominationsWarning(rounds, NOM_CLOSE)).toBeNull();
  });

  it('uses the earliest voting round, not array order', () => {
    const rounds = [
      { round_type: 'voting', start_date: '2026-12-01T09:00:00.000Z' },
      { round_type: 'voting', start_date: '2026-08-04T09:00:00.000Z' }, // earliest, out of order
    ];
    const result = getVotingBeforeNominationsWarning(rounds, NOM_CLOSE);
    expect(result?.earliestStartIso).toBe('2026-08-04T09:00:00.000Z');
  });

  it('ignores judging rounds when finding the earliest voting start', () => {
    const rounds = [
      { round_type: 'judging', start_date: '2026-08-01T09:00:00.000Z' },
      { round_type: 'voting', start_date: '2026-11-23T09:00:00.000Z' },
    ];
    expect(getVotingBeforeNominationsWarning(rounds, NOM_CLOSE)).toBeNull();
  });

  it('returns null when there is not enough data', () => {
    expect(getVotingBeforeNominationsWarning([], NOM_CLOSE)).toBeNull();
    expect(getVotingBeforeNominationsWarning([{ round_type: 'voting' }], NOM_CLOSE)).toBeNull();
    expect(getVotingBeforeNominationsWarning(null, NOM_CLOSE)).toBeNull();
    expect(
      getVotingBeforeNominationsWarning([{ round_type: 'voting', start_date: '2026-08-04T09:00:00.000Z' }], null)
    ).toBeNull();
  });
});
