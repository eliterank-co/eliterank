/**
 * V8 — Public member profile  (/p/[voterId], flag ON — 404s when OFF)
 * Findings: P4, X2, S2, S4, S5 · View doc: docs/profile-handoff/views/V8-public-profile.md
 */
import { test, expect, withFlag, FIXTURES } from './_fixtures';

test.describe('V8 — public member profile', () => {
  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'on');
  });

  test.describe('as the owner', () => {
    test.use({ storageState: FIXTURES.MEMBER_WITH_FANS });

    test.fixme('T-AC-V8-01 — the owner can get back from "View as visitor"', async ({ page }) => {
      await page.goto('/me');
      await page.getByRole('link', { name: /view as visitor/i }).click();
      await expect(page).toHaveURL(/\/p\//);
      // P4: the page has no /me reference at all today.
      await expect(page.getByText(/previewing your public profile/i)).toBeVisible();
      await page.getByRole('link', { name: /back to your view/i }).click();
      await expect(page).toHaveURL(/\/me$/);
    });

    test('T-AC-V8-07 — the owner-only Watching count never renders here', async ({ page }) => {
      // Regression guard: currently correct, and must survive fixes to the
      // shared hero made for G2/G3 (see T-AC-V2-05).
      await page.goto('/me');
      await page.getByRole('link', { name: /view as visitor/i }).click();
      await expect(page.getByText(/watching/i)).toHaveCount(0);
    });
  });

  test.describe('as a visitor', () => {
    test.use({ storageState: FIXTURES.MEMBER_PLAIN });

    test.fixme('T-AC-V8-02 — a non-owner sees no preview strip', async ({ page, context }) => {
      const targetVoterId = process.env.FIXTURE_VOTER_ID ?? '';
      test.skip(!targetVoterId, 'set FIXTURE_VOTER_ID to a seeded member');
      await page.goto(`/p/${targetVoterId}`);
      await expect(page.getByText(/previewing your public profile/i)).toHaveCount(0);
      await expect(page.getByRole('link', { name: /back to your view/i })).toHaveCount(0);
      void context;
    });

    test.fixme('T-AC-V8-03 — one term names the member relationship everywhere', async ({ page }) => {
      const targetVoterId = process.env.FIXTURE_VOTER_ID ?? '';
      test.skip(!targetVoterId, 'set FIXTURE_VOTER_ID to a seeded member');
      await page.goto(`/p/${targetVoterId}`);
      const body = await page.locator('main').innerText();
      // X2: pick one. Both terms present means the rename is incomplete.
      const hasFan = /\bfan\b/i.test(body);
      const hasWatch = /\bwatch(ing)?\b/i.test(body);
      expect(hasFan && hasWatch).toBe(false);
    });

    test.fixme('T-AC-V8-05 — social marks are inline SVG with no raw hex', async ({ page }) => {
      const targetVoterId = process.env.FIXTURE_VOTER_ID ?? '';
      test.skip(!targetVoterId, 'set FIXTURE_VOTER_ID to a seeded member');
      await page.goto(`/p/${targetVoterId}`);
      const fills = await page.locator('svg [fill]').evaluateAll((els) =>
        els.map((e) => e.getAttribute('fill') ?? ''),
      );
      // REQ-05: currentColor or a token, never a literal hex.
      expect(fills.filter((f) => /^#[0-9a-f]{3,8}$/i.test(f))).toHaveLength(0);
    });

    test.fixme('T-AC-V8-06 — the share control carries a label at mobile widths', async ({ page }) => {
      const targetVoterId = process.env.FIXTURE_VOTER_ID ?? '';
      test.skip(!targetVoterId, 'set FIXTURE_VOTER_ID to a seeded member');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/p/${targetVoterId}`);
      // S5: today this is a bare glyph on mobile.
      await expect(page.getByRole('button', { name: /share/i })).toContainText(/share/i);
    });

    test.fixme('T-AC-V8-04 — the story card renders and downloads', async ({ page }) => {
      const targetVoterId = process.env.FIXTURE_VOTER_ID ?? '';
      test.skip(!targetVoterId, 'set FIXTURE_VOTER_ID to a seeded member');
      const res = await page.request.get(`/p/${targetVoterId}/story-card`);
      expect(res.status()).toBe(200);
      expect(res.headers()['content-type']).toContain('image/png');
    });
  });
});
