/**
 * T-AC-V8-06 / T-AC-V8-07 / T-AC-V4-02 — track-record honesty.
 * Destination: eliterank-app/src/lib/data/track-record-labels.acceptance.unit.test.ts
 *
 * ============================================================================
 * DOES NOT COMPILE until `deriveTier`, `derivePlacementLabel`, and
 * `deriveHostedDates` are exported from `src/lib/data/track-record.ts` — do
 * NOT add this file to CI before the R10/R11 fixes land. CONTRACT-FIRST: at
 * c2f45dd deriveTier and derivePlacementLabel exist but are module-private
 * (track-record.ts:57-75), and deriveHostedDates does not exist at all (the
 * hosted-dates expression is inlined at track-record.ts:210). Exporting all
 * three is part of those fixes.
 * ============================================================================
 */
import { describe, expect, it } from 'vitest';
import {
  deriveTier,
  derivePlacementLabel,
  deriveHostedDates, // new export — part of the R10 fix
} from '@/lib/data/track-record';

describe('T-AC-V8-07 — the label never claims more than the record shows', () => {
  it('keeps the podium labels', () => {
    expect(derivePlacementLabel(1, 'completed')).toBe('WINNER');
    expect(derivePlacementLabel(2, 'completed')).toBe('2ND');
    expect(derivePlacementLabel(3, 'completed')).toBe('3RD');
  });

  it('does NOT call a first-round exit a finalist', () => {
    // R11: today placement 42 (or null) in a concluded competition returns
    // "FINALIST" (track-record.ts:74). Whatever ladder the product decision
    // lands on, the fallback must not be FINALIST.
    expect(derivePlacementLabel(42, 'completed')).not.toBe('FINALIST');
    expect(derivePlacementLabel(null, 'completed')).not.toBe('FINALIST');
  });

  it('mirrors the tier: no "finalist" ring for a non-qualifying result', () => {
    expect(deriveTier(42, 'completed')).not.toBe('finalist');
  });
});

describe('T-AC-V8-06 — hosted entries never advertise a past close', () => {
  const past = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const future = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  it('a concluded hosted competition reads as concluded', () => {
    // R10: today any voting_ends_at yields `CLOSES <date>` forever
    // (track-record.ts:210).
    expect(deriveHostedDates({ votingEndsAt: past, phase: 'completed' })).not.toMatch(/^CLOSES/);
  });

  it('a live hosted competition may advertise its close', () => {
    expect(deriveHostedDates({ votingEndsAt: future, phase: 'voting' })).toMatch(/^CLOSES/);
  });
});

describe('T-AC-V4-02 — one ladder across surfaces', () => {
  it('the contestant tab imports the same derivation (compile-time check)', async () => {
    // The real assertion is structural: /me/contestant/page.tsx must import
    // derivePlacementLabel rather than branching on eliminatedAt. This test
    // pins the export surface so the page CAN; the e2e T-AC-V4-01 pins the
    // rendered result.
    expect(typeof derivePlacementLabel).toBe('function');
    expect(typeof deriveTier).toBe('function');
  });
});
