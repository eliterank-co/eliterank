/**
 * T-AC-V3-01 / T-AC-V3-02 / T-AC-V3-03 — social handle acceptance.
 *
 * Proves finding P1: the profile editor rejects a pasted social URL, while the
 * contestant editor accepts one, even though both write the same columns.
 *
 * Destination: eliterank-app/src/lib/actions/__tests__/social-handle.test.ts
 *
 * Current behaviour (the bug):
 *   src/lib/actions/profile.ts:38-43 validates each social field against a
 *   handle charset (letters, digits, '.', '_', '-'). A pasted URL contains ':'
 *   and '/', fails the refine, and saveOwnProfile returns the form-level code
 *   'invalid_input' (line 76) — which names no field.
 *
 * Target behaviour (the fix):
 *   Normalize URL -> handle server-side, matching what the contestant editor
 *   already accepts, and return a per-field error for genuinely bad input.
 *
 * The `normalizeSocialHandle` import below does not exist yet. It is the
 * contract this fix should satisfy; these tests are written against it
 * deliberately, so implementing the export turns them green.
 */
import { describe, expect, it } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { normalizeSocialHandle, saveOwnProfile } from '@/lib/actions/profile';

const PASTED_URLS: ReadonlyArray<readonly [string, string, string]> = [
  ['instagram', 'https://instagram.com/crystalkendzior', 'crystalkendzior'],
  ['instagram', 'https://www.instagram.com/crystalkendzior/', 'crystalkendzior'],
  ['tiktok', 'https://www.tiktok.com/@crystalkendzior', 'crystalkendzior'],
  ['twitter', 'https://x.com/crispykendz', 'crispykendz'],
  ['twitter', 'https://twitter.com/crispykendz', 'crispykendz'],
  ['linkedin', 'https://linkedin.com/in/crystalkendzior', 'crystalkendzior'],
];

const BARE_HANDLES: ReadonlyArray<readonly [string, string]> = [
  ['@crystalkendzior', 'crystalkendzior'],
  ['crystalkendzior', 'crystalkendzior'],
  ['crispy.kendz', 'crispy.kendz'],
  ['crispy_kendz', 'crispy_kendz'],
  ['crispy-kendz', 'crispy-kendz'],
  ['', ''],
];

describe('T-AC-V3-01 — a pasted profile URL is accepted and stored as a handle', () => {
  it.each(PASTED_URLS)('%s: %s -> %s', (network, pasted, expected) => {
    expect(normalizeSocialHandle(network, pasted)).toBe(expected);
  });
});

describe('T-AC-V3-03 — bare handles are unchanged, and the @ prefix is stripped', () => {
  it.each(BARE_HANDLES)('%s -> %s', (input, expected) => {
    expect(normalizeSocialHandle('instagram', input)).toBe(expected);
  });
});

describe('T-AC-V3-02 — genuinely invalid input is rejected by field, not form', () => {
  const INVALID = [
    'javascript:alert(1)',
    'data:text/html,<script>',
    'https://instagram.com/a/b/c/d',
    'two words',
  ];

  it.each(INVALID)('rejects %s', (bad) => {
    expect(normalizeSocialHandle('instagram', bad)).toBeNull();
  });

  // saveOwnProfile checks the session BEFORE validation (profile.ts: getSession
  // -> 'unauthenticated' -> only then safeParse), so in bare Vitest this test
  // exercises the auth guard, not the validator. Runs only with a session mock;
  // the e2e T-AC-V3-02 covers the same criterion through the real form.
  it.skipIf(!process.env.SESSION_MOCK)('saveOwnProfile names the offending field rather than returning invalid_input', async () => {
    const result = await saveOwnProfile({
      displayName: 'Test Member',
      firstName: 'Test',
      lastName: 'Member',
      city: 'Chicago',
      headline: '',
      bio: '',
      instagram: 'two words',
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
    // The bug: today this is the bare string 'invalid_input'.
    // The fix must carry enough for the client to mark the input (REQ-11).
    expect(result.error).not.toBe('invalid_input');
    expect(JSON.stringify(result)).toContain('instagram');
  });
});

describe('T-AC-V3-03 — parity with the contestant editor', () => {
  /**
   * /me/contestant advertises "@yourhandle or full URL" and accepts both.
   * Any value that editor accepts must be accepted here (REQ-12, RQ-V3-3).
   * Point this at the contestant-side normalizer once both share one helper —
   * the end state is a single function, at which point this becomes trivial.
   */
  it.each(PASTED_URLS)('profile editor accepts what the contestant editor accepts: %s', (network, pasted) => {
    expect(normalizeSocialHandle(network, pasted)).not.toBeNull();
  });
});
