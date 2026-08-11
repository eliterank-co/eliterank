import { describe, it, expect } from 'vitest';
import { blendedScores, bucketKey } from './judgingScore';

describe('bucketKey', () => {
  it('uses one global bucket when the split is off', () => {
    expect(bucketKey('male', false)).toBe(bucketKey('female', false));
  });
  it('separates genders when the split is on', () => {
    expect(bucketKey('male', true)).not.toBe(bucketKey('female', true));
  });
  it('groups null-gender contestants together under the split', () => {
    expect(bucketKey(null, true)).toBe(bucketKey(undefined, true));
  });
});

describe('blendedScores — per-gender normalization', () => {
  // A finale-round field where each gender has a distinct top vote-getter and
  // top-scored contestant, and one gender's totals dwarf the other's — the
  // exact shape where "normalize per gender" vs "normalize globally" diverge.
  const rows = [
    { id: 'M_A', gender: 'male', judgeAvg: 44, votes: 10000 }, // vote-strong man
    { id: 'M_B', gender: 'male', judgeAvg: 48, votes: 6000 }, // judge-strong man
    { id: 'F_A', gender: 'female', judgeAvg: 50, votes: 40000 }, // dominant woman
    { id: 'F_B', gender: 'female', judgeAvg: 30, votes: 20000 },
  ];
  const byId = (result) => Object.fromEntries(result.map((r) => [r.id, r]));

  it('normalizes each gender against its own top scorer (judges 60 / votes 40)', () => {
    const r = byId(blendedScores({ rows, judgeWeight: 60, splitByGender: true }));
    // Men normalized to male max (judge 48, votes 10000)
    expect(r.M_A.final).toBeCloseTo(0.6 * (44 / 48) + 0.4 * (10000 / 10000), 6); // 0.95
    expect(r.M_B.final).toBeCloseTo(0.6 * (48 / 48) + 0.4 * (6000 / 10000), 6); // 0.84
    // Women normalized to female max (judge 50, votes 40000)
    expect(r.F_A.final).toBeCloseTo(1.0, 6);
    expect(r.F_B.final).toBeCloseTo(0.6 * (30 / 50) + 0.4 * (20000 / 40000), 6); // 0.56
  });

  it('crowns the right contestant per gender', () => {
    const r = byId(blendedScores({ rows, judgeWeight: 60, splitByGender: true }));
    expect(r.M_A.final).toBeGreaterThan(r.M_B.final); // vote-strong man wins his division
    expect(r.F_A.final).toBeGreaterThan(r.F_B.final);
  });

  it('produces a different winner than global normalization (proves the fix matters)', () => {
    const perGender = byId(blendedScores({ rows, judgeWeight: 60, splitByGender: true }));
    const global = byId(blendedScores({ rows, judgeWeight: 60, splitByGender: false }));
    // Per gender, the vote-strong man (M_A) wins the men's division.
    expect(perGender.M_A.final).toBeGreaterThan(perGender.M_B.final);
    // Globally, the woman's huge vote total compresses every man's vote
    // component, so judges dominate and the winner flips to the judge-strong
    // man (M_B). Same inputs, different winner — this is the bug the migration
    // fixes.
    expect(global.M_B.final).toBeGreaterThan(global.M_A.final);
  });
});

describe('blendedScores — global (split off) is unchanged behavior', () => {
  const rows = [
    { id: 'A', gender: 'male', judgeAvg: 30, votes: 500 },
    { id: 'B', gender: 'female', judgeAvg: 40, votes: 250 },
  ];
  it('normalizes everyone against a single competition-wide maximum', () => {
    const r = Object.fromEntries(
      blendedScores({ rows, judgeWeight: 50, splitByGender: false }).map((x) => [x.id, x])
    );
    // Global max judge 40, max votes 500.
    expect(r.A.final).toBeCloseTo(0.5 * (30 / 40) + 0.5 * (500 / 500), 6);
    expect(r.B.final).toBeCloseTo(0.5 * (40 / 40) + 0.5 * (250 / 500), 6);
  });
  it('handles a bucket with no judge scores (max 0 → vote-only)', () => {
    const r = blendedScores({
      rows: [{ id: 'X', judgeAvg: 0, votes: 100 }],
      judgeWeight: 60,
      splitByGender: false,
    });
    expect(r[0].normJudges).toBe(0);
    expect(r[0].final).toBeCloseTo(0.4 * 1.0, 6);
  });
});
