/**
 * T-AC-V10-01 / T-AC-V10-03 / T-AC-V10-05 — light-theme structure.
 * Destination: eliterank-app/src/app/light-theme-tokens.acceptance.unit.test.ts
 *
 * Compiles and runs at c2f45dd. Two readiness levels inside this file:
 *
 *  - RUNNABLE NOW: the brand-contract parity check (first describe). The
 *    three contract copies were verified byte-identical in this audit; this
 *    guards that invariant. It skips (not passes) when the sibling checkouts
 *    are absent.
 *  - POST-FIX ACCEPTANCE (describe.skip / it.skip): everything asserting the
 *    light theme itself. At c2f45dd the contract is v1 (dark-only), no light
 *    block exists in globals.css, and the profile surfaces carry 29 hardcoded
 *    colors — those assertions fail by design until the V10 work lands.
 *    Un-skipping each is part of the corresponding fix.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const APP_ROOT = process.cwd();
const GLOBALS = join(APP_ROOT, 'src/app/globals.css');

describe('T-AC-V10-01 — brand contract parity across repos (guards a current invariant)', () => {
  const app = join(APP_ROOT, 'design/brand-contract.json');
  // Sibling checkouts; CI should map these. Skip (not pass) when absent.
  const registry = process.env.REGISTRY_CONTRACT ?? '../eliterank-registry/design/brand-contract.json';
  const infra = process.env.INFRA_CONTRACT ?? '../eliterank-infra/design/brand-contract.json';

  it.skipIf(!existsSync(registry) || !existsSync(infra))(
    'app and infra copies are byte-identical to the registry contract',
    () => {
      const canonical = readFileSync(registry, 'utf8');
      expect(readFileSync(app, 'utf8')).toBe(canonical);
      expect(readFileSync(infra, 'utf8')).toBe(canonical);
    },
  );

  // POST-FIX: fails at c2f45dd (contract is v1, dark-only). Un-skip when
  // brand-contract v2 ships from the registry.
  it.skip('the contract declares a light palette (v2) — un-skip with the palette', () => {
    const contract = JSON.parse(readFileSync(app, 'utf8'));
    // AC-V10-01: v1 has a single dark palette. v2 must carry both. The exact
    // shape (e.g. customProperties + customPropertiesLight, or modes:{dark,light})
    // is the design system's call — assert presence, not shape details.
    expect(contract.version).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(contract)).toMatch(/light/i);
  });
});

/** Extracts the contents of every light-scoped block in a stylesheet. */
function lightScopedCss(css: string): string {
  const out: string[] = [];
  const re = /(?:\[data-theme=["']light["']\][^{]*|@media[^{]*prefers-color-scheme:\s*light[^{]*)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    out.push(css.slice(re.lastIndex, i));
  }
  return out.join('\n');
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(p)) out.push(p);
  }
  return out;
}

// POST-FIX ACCEPTANCE: no light block exists at c2f45dd, so the census fails
// by design. Un-skip when the light block lands in globals.css.
describe.skip('T-AC-V10-03 — every consumed color token is defined in both themes (un-skip with the light block)', () => {
  it('scripted census: consumed ∧ base-defined ⇒ light-defined', () => {
    const css = readFileSync(GLOBALS, 'utf8');
    const light = lightScopedCss(css);
    expect(light.length, 'no light-scoped block found in globals.css').toBeGreaterThan(0);
    const base = css.replace(light, '');

    const defs = (chunk: string): Map<string, string> => {
      const map = new Map<string, string>();
      for (const d of chunk.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(d[1]!, d[2]!.trim());
      return map;
    };
    const baseDefs = defs(base);
    const lightDefs = defs(light);

    // Color-bearing base tokens only — easing curves, radii, fonts are
    // theme-neutral. Tune this predicate with the implementation if the
    // token vocabulary grows.
    const colorish = (v: string): boolean =>
      /oklch|oklab|#[0-9a-fA-F]{3,8}|rgb|hsl|color-mix|gradient|var\(--(?:brand|color|gold|status|legacy)-/.test(v);

    const consumed = new Set<string>();
    for (const file of walk(join(APP_ROOT, 'src'))) {
      for (const u of readFileSync(file, 'utf8').matchAll(/var\((--[\w-]+)/g)) consumed.add(u[1]!);
    }

    const missing = [...consumed]
      .filter((t) => baseDefs.has(t) && colorish(baseDefs.get(t)!))
      .filter((t) => !lightDefs.has(t))
      // A base value defined entirely over re-valued primitives (pure
      // var()/color-mix over --brand-*) inherits the light palette; it still
      // must be VERIFIED visually (AC-V10-06/07) but needs no light override.
      .filter((t) => !/^(?:var\(|color-mix\()[^;]*$/.test(baseDefs.get(t)!) || /oklch|#[0-9a-fA-F]{3,8}|rgb|hsl/.test(baseDefs.get(t)!));

    expect(missing, `tokens with no light definition: ${missing.join(', ')}`).toEqual([]);
  });

  it('color-scheme is no longer unconditionally dark', () => {
    const css = readFileSync(GLOBALS, 'utf8');
    // Today: globals.css:238 `html { color-scheme: dark; }`.
    expect(css).not.toMatch(/html\s*\{\s*color-scheme:\s*dark;\s*\}/);
  });
});

// POST-FIX ACCEPTANCE: 29 unmarked instances at c2f45dd — fails by design.
// Un-skip when the AC-V10-05 cleanup drives the census to zero-or-classified.
describe.skip('T-AC-V10-05 — hardcoded-color census on profile surfaces (un-skip with the cleanup)', () => {
  it('every raw color is tokenized or marked theme-invariant', async () => {
    const { execSync } = await import('node:child_process');
    const out = execSync(
      String.raw`grep -rn -E 'rgba\(|#[0-9a-fA-F]{6}|bg-black|bg-white|text-white' ` +
        `src/components/profile src/components/share src/components/vote/profile-vote-module.tsx ` +
        `"src/app/(public)/(member)/me" "src/app/(public)/p" --include='*.tsx' || true`,
      { encoding: 'utf8', cwd: APP_ROOT },
    );
    const offending = out
      .split('\n')
      .filter(Boolean)
      .filter((l) => !l.includes('unit.test'))
      .filter((l) => !l.includes('theme-invariant'));
    expect(offending).toEqual([]);
  });
});
