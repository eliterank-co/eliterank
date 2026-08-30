/**
 * T-AC-V2-06 — superseded profile components are retired (R23).
 * Destination: eliterank-app/src/components/profile/dead-components.acceptance.unit.test.ts
 *
 * Compiles and runs at c2f45dd (filesystem-based, no app imports).
 * POST-FIX ACCEPTANCE — describe.skip until the R23 cleanup lands: today
 * hero.tsx and profile-vote-panel.tsx exist with no deprecation note, and
 * TWO files export `ProfileHero` (hero.tsx and profile-hero.tsx), so these
 * assertions fail by design. Un-skipping is part of the fix.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = process.cwd();

/** R23's dead components — delete, or mark with an @deprecated note. */
const DEAD = [
  'src/components/profile/hero.tsx',
  'src/components/vote/profile-vote-panel.tsx',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

describe.skip('T-AC-V2-06 — dead profile components retired (un-skip with the R23 cleanup)', () => {
  it('hero.tsx and profile-vote-panel.tsx are deleted or carry a deprecation note', () => {
    for (const rel of DEAD) {
      const p = join(APP_ROOT, rel);
      if (existsSync(p)) {
        expect(readFileSync(p, 'utf8'), `${rel} exists without @deprecated`).toMatch(/@deprecated/);
      }
    }
  });

  it('exactly one file exports ProfileHero', () => {
    const exporters = walk(join(APP_ROOT, 'src')).filter((p) =>
      /export\s+(function|const)\s+ProfileHero\b/.test(readFileSync(p, 'utf8')),
    );
    // Today: hero.tsx (dead) and profile-hero.tsx (live) both export it —
    // an import of the wrong one type-checks (R23).
    expect(exporters, exporters.join(', ')).toHaveLength(1);
  });
});
