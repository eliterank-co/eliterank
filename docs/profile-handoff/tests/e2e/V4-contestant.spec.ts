/**
 * V4 — Contestant self-service  (/me/contestant, flag OFF)
 * Findings: G4 · View doc: docs/profile-handoff/views/V4-contestant.md
 */
import { test, expect, withFlag, FIXTURES } from './_fixtures';

test.describe('V4 — contestant self-service', () => {
  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'off');
  });

  test.describe('active contestant', () => {
    test.use({ storageState: FIXTURES.MEMBER_CONTESTANT_ACTIVE });

    test.fixme('T-AC-V4-01 — a surviving contestant sees their tier label', async ({ page }) => {
      await page.goto('/me/contestant');
      // G4: today this surface shows Placement #n and Active/Eliminated only.
      // Derivation to mirror: legacy ProfileView.jsx:190-207 (contestants_advance).
      await expect(page.getByText(/Top \d+ Contestant|Entry Round/i)).toBeVisible();
    });
  });

  test.describe('eliminated contestant', () => {
    test.use({ storageState: FIXTURES.MEMBER_CONTESTANT_OUT });

    test.fixme('T-AC-V4-02 — an eliminated contestant keeps the tier they earned', async ({ page }) => {
      await page.goto('/me/contestant');
      await expect(page.getByText(/Top \d+ Contestant|Entry Round/i)).toBeVisible();
      // "Eliminated" must not be the only descriptor of the result.
      const body = await page.locator('main').innerText();
      const hasTier = /Top \d+ Contestant|Entry Round/i.test(body);
      expect(hasTier).toBe(true);
    });

  });

  test.describe('multi-competition contestant', () => {
    test.use({ storageState: FIXTURES.MEMBER_CONTESTANT_MULTI });

    test.fixme('T-AC-V4-03 — multi-competition contestants see tier per competition', async ({ page }) => {
      await page.goto('/me/contestant');
      const rows = page.getByTestId('contestant-competition-row'); // REQ-19
      const count = await rows.count();
      expect(count).toBeGreaterThan(1);
      for (let i = 0; i < count; i++) {
        await expect(rows.nth(i)).toContainText(/Top \d+|Entry Round|#\d+/);
      }
    });
  });
});
