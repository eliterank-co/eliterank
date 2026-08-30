/**
 * T-AC-V8-05 — no brand literal as a data fallback.
 * Destination: eliterank-app/src/components/share/share-card-fallback.acceptance.unit.test.ts
 *
 * Compiles and runs at c2f45dd (filesystem-based, no app imports).
 * POST-FIX ACCEPTANCE — describe.skip until the R9 fix lands: today
 * share-card-modal.tsx:38 defaults `competitionTitle = "Most Eligible"`, so
 * the assertion fails by design. Un-skipping is part of the fix.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe.skip('T-AC-V8-05 — no brand literal as a data fallback (un-skip with the R9 fix)', () => {
  it('share-card-modal has no literal default for competitionTitle', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/share/share-card-modal.tsx'),
      'utf8',
    );
    // Target the fallback EXPRESSION, not the string "Most Eligible" anywhere
    // in the file: a renamed literal in the same default position still fails,
    // and an innocent comment mentioning the brand does not. The rendered
    // behavior for an absent competition (omit the line) is covered by the
    // e2e specs' story-card interactions; this pins the source contract.
    expect(src).not.toMatch(/competitionTitle\s*=\s*["'][^"']+["']/);
  });
});
