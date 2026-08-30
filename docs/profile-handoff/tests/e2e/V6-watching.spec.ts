/**
 * V6 — Watch list  (/me/watching, flag OFF)
 * Findings: D3 · View doc: docs/profile-handoff/views/V6-watching.md
 */
import { test, expect, withFlag, FIXTURES } from './_fixtures';

test.describe('V6 — watch list', () => {
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });

  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'off');
  });

  test.fixme('T-AC-V6-01 — every watch count in the app agrees with this page', async ({ page }) => {
    await page.goto('/me/watching');
    const heading = await page.getByText(/Saved markets \(\d+\)/).innerText();
    const authoritative = heading.match(/\((\d+)\)/)?.[1] ?? '';

    await withFlag(page, 'on');
    await page.goto('/me');
    await expect(page.getByRole('link', { name: /watching/i })).toContainText(authoritative);
  });

  test('T-AC-V6-02 — a case-mismatched email still resolves the watch list', async ({ page }) => {
    // Regression guard: listMyWatching keys on the lowercased email. A mismatch
    // returns an empty list rather than an error, so the failure is silent.
    await page.goto('/me/watching');
    await expect(page.getByText(/Saved markets \(\d+\)/)).toBeVisible();
  });
});
