/**
 * T-AC-V3-01 (unit half) + T-AC-V3-02 — social handle acceptance, v2.
 * Destination: eliterank-app/src/lib/actions/social-handle.acceptance.unit.test.ts
 *
 * ============================================================================
 * DOES NOT COMPILE until `extractSocialHandle` is exported from
 * `src/lib/social-handle.ts` — do NOT add this file to CI before the R5 fix
 * lands. CONTRACT-FIRST: at c2f45dd the normalizer exists but is
 * module-private inside src/lib/actions/profile.ts:39, and that file is
 * 'use server' (line 6), which may only export async functions. Part of the
 * R5 fix is extracting the pure helper to a plain module (suggested:
 * src/lib/social-handle.ts) and re-importing it from the action. These tests
 * are written against that moved export.
 * ============================================================================
 *
 * T-AC-V3-02 guards behavior that SHIPS today (6b665a8 normalizes pasted
 * URLs) — but this test of it compiles only after the extraction. It exists
 * so the R5 error-contract fix cannot regress the normalization.
 */
import { describe, expect, it } from 'vitest';
// Part of the R5 fix: extract the pure helper out of the 'use server' module.
import { extractSocialHandle } from '@/lib/social-handle';
import { saveOwnProfile } from '@/lib/actions/profile';

const PASTED_URLS: ReadonlyArray<readonly [string, string, string]> = [
  ['instagram', 'https://instagram.com/crystalkendzior', 'crystalkendzior'],
  ['instagram', 'https://www.instagram.com/crystalkendzior/', 'crystalkendzior'],
  ['tiktok', 'https://www.tiktok.com/@crystalkendzior', 'crystalkendzior'],
  ['twitter', 'https://x.com/crispykendz', 'crispykendz'],
  ['twitter', 'https://twitter.com/crispykendz', 'crispykendz'],
  ['linkedin', 'https://linkedin.com/in/crystalkendzior', 'crystalkendzior'],
];

describe('T-AC-V3-02 — guard: pasted URLs normalize to handles (behavior ships since 6b665a8)', () => {
  it.each(PASTED_URLS)('%s: %s -> %s', (network, pasted, expected) => {
    expect(extractSocialHandle(network, pasted)).toBe(expected);
  });

  it.each([
    ['@crystalkendzior', 'crystalkendzior'],
    ['crystalkendzior', 'crystalkendzior'],
    ['crispy.kendz', 'crispy.kendz'],
    ['', ''],
  ])('bare handle %s -> %s', (input, expected) => {
    expect(extractSocialHandle('instagram', input)).toBe(expected);
  });

  it('strips query and fragment', () => {
    expect(
      extractSocialHandle('instagram', 'https://instagram.com/ada?igsh=x#top'),
    ).toBe('ada');
  });
});

describe('T-AC-V3-01 — invalid input is rejected by field, in a structured shape', () => {
  // saveOwnProfile checks the session BEFORE validation, so this needs a
  // session mock; the e2e half of T-AC-V3-01 covers the rendered copy.
  it.skipIf(!process.env.SESSION_MOCK)(
    'saveOwnProfile names the offending field rather than returning invalid_input',
    async () => {
      const result = await saveOwnProfile({
        displayName: 'Test Member',
        firstName: 'Test',
        lastName: 'Member',
        city: 'Chicago',
        headline: '',
        bio: '',
        instagram: 'two words', // survives normalization, fails HANDLE_CHARSET
        tiktok: '',
        linkedin: '',
        website: '',
        twitter: '',
        interests: [],
        pinnedLinkUrl: '',
        pinnedLinkLabel: '',
        returnTo: 'me',
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // The bug (R5): today this is the bare string 'invalid_input'
      // (src/lib/actions/profile.ts:100). The fix carries the field.
      expect(result.error).not.toBe('invalid_input');
      expect(JSON.stringify(result)).toContain('instagram');
    },
  );
});
