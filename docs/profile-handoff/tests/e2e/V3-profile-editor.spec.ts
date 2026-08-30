/**
 * V3 — Profile editor  (/me/profile, both flag paths)
 * Findings: P1, P2, S1, G1, G6 · View doc: docs/profile-handoff/views/V3-profile-editor.md
 *
 * P1 is also covered by unit tests, which need no session — prefer those for
 * the validation matrix and keep these for the round trip through the form.
 */
import { test, expect, withFlag, FIXTURES } from './_fixtures';

test.describe('V3 — profile editor', () => {
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });

  for (const flag of ['off', 'on'] as const) {
    test.describe(`flag ${flag}`, () => {
      test.beforeEach(async ({ page }) => {
        await withFlag(page, flag);
        await page.goto('/me/profile');
      });

      test.fixme('T-AC-V3-01 — a pasted Instagram URL saves as a handle', async ({ page }) => {
        await page.getByLabel('Instagram').fill('https://instagram.com/crystalkendzior');
        await page.getByRole('button', { name: /save changes/i }).click();
        await expect(page.getByRole('alert')).toHaveCount(0);
        await page.goto('/me/profile');
        await expect(page.getByLabel('Instagram')).toHaveValue('crystalkendzior');
      });

      test.fixme('T-AC-V3-02 — an invalid social value names its field', async ({ page }) => {
        await page.getByLabel('Instagram').fill('two words');
        await page.getByRole('button', { name: /save changes/i }).click();
        const alert = page.getByRole('alert');
        await expect(alert).toBeVisible();
        // P1: today this is one form-level 'invalid_input' naming nothing.
        await expect(alert).toContainText(/instagram/i);
      });

      test.fixme('T-AC-V3-04 — saving after a video upload reports no error', async ({ page }) => {
        await page.getByLabel(/intro video/i).setInputFiles('e2e/fixtures/intro-sample.mp4');
        await expect(page.getByText(/uploading/i)).toHaveCount(0, { timeout: 60_000 });
        await page.getByRole('button', { name: /save changes/i }).click();
        // P2: the media interlock surfaces as "couldn't save" for work that committed.
        await expect(page.getByRole('alert')).toHaveCount(0);
      });

      test.fixme('T-AC-V3-05 — a saved intro video renders a poster, not black', async ({ page }) => {
        await page.goto('/me');
        const video = page.locator('video').first();
        await expect(video).toHaveAttribute('poster', /.+/);
      });

      test.fixme('T-AC-V3-06 — interests are editable here, or absent from V2', async ({ page }) => {
        await expect(page.getByLabel(/interests/i)).toBeVisible();
      });

      test.fixme('T-AC-V3-08 — Link and Pinned Link are distinguishable', async ({ page }) => {
        const link = page.getByLabel('Link');
        const pinned = page.getByLabel('Pinned Link');
        const a = await link.getAttribute('placeholder');
        const b = await pinned.getAttribute('placeholder');
        // S1: today these are https://yourwebsite.com and https://yourlink.com.
        expect(a).not.toBe(b);
        await expect(page.getByText(/button text|shown as a button|featured/i)).toBeVisible();
      });
    });
  }
});
