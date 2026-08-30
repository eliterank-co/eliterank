/**
 * V2 — Member profile, 748px owner view (profile experience).
 * Findings: R2, R3, R13 (+guards). View doc: views/V2-member-profile.md
 */
import { test, expect, selectExperience, FIXTURES, BASE_URL } from './_fixtures';

test.describe('V2 — active contestant with an approved bonus submission', () => {
  test.use({ storageState: FIXTURES.MEMBER_CONTESTANT_ACTIVE });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V2-01 — the checklist reflects real completion', async ({ page }) => {
    await page.goto('/me');
    // R2: page-v3.tsx:46 hardcodes completed:false — "0/N Done" forever.
    const done = page.getByText(/^\d+\/\d+ Done$/);
    await expect(done).toBeVisible();
    await expect(done).not.toHaveText(/^0\//);
    await expect(page.locator('[data-testid="bonus-task-row"][data-completed="true"]')).not.toHaveCount(0);
  });
});

test.describe('V2 — contestant live in two competitions', () => {
  test.use({ storageState: FIXTURES.MEMBER_CONTESTANT_MULTI });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V2-02 — each live round shows its own task list', async ({ page }) => {
    await page.goto('/me');
    const modules = page.locator('section[aria-label^="Vote for"]');
    await expect(modules).toHaveCount(2);
    // R2: today competition #1's tasks render under both modules
    // (one bonusTasks array, profile-vote-module.tsx:67-71).
    const first = await modules.nth(0).locator('[data-testid="bonus-task-row"]').allInnerTexts();
    const second = await modules.nth(1).locator('[data-testid="bonus-task-row"]').allInnerTexts();
    expect(first).not.toEqual(second);
  });
});

test.describe('V2 — plain member', () => {
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test('T-AC-V2-03 — guard: settings, votes, watching reachable in ≤2 interactions', async ({ page }) => {
    // R3 (discoverability): the profile experience drops the tab bar
    // (me/layout.tsx:76-81), but the app-shell avatar menu still links every
    // member destination (menu.ts:182-194) at all widths. This guards the
    // reachability floor; the discoverability decision itself is manual.
    for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
      await page.setViewportSize(viewport);
      await page.goto('/me');
      await page.getByRole('button', { name: 'Profile menu' }).click();
      const menu = page.getByRole('menu');
      for (const target of ['/me/settings', '/me/votes', '/me/watching']) {
        await expect(menu.locator(`a[href="${target}"]`)).toBeVisible();
      }
    }
  });

  test.fixme('T-AC-V2-04 — leaving for the public render always has a way back', async ({ page }) => {
    await page.goto('/me');
    const link = page.getByRole('link', { name: 'View as visitor' });
    if (await link.count()) {
      await link.click();
      // R13: /p/[voterId] passes isOwner={false} unconditionally (page.tsx:64).
      await expect(page.getByRole('link', { name: /back to your (view|profile)/i })).toBeVisible();
    }
    // Preview Mode must round-trip regardless.
    await page.goto('/me');
    await page.getByRole('button', { name: 'Preview Mode' }).click();
    await expect(page.getByRole('button', { name: 'Exit Preview' })).toBeVisible();
  });

  test('T-AC-V2-07 — guard: preview hides owner-only modules but keeps the exit', async ({ page }) => {
    await page.goto('/me');
    await page.getByRole('button', { name: 'Preview Mode' }).click();
    // Owner-only data is gone from the preview render (REQ-15)…
    await expect(page.getByText('Watching', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Bonus Vote Tasks')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toHaveCount(0);
    // …but the owner strip MUST remain: it hosts Exit Preview
    // (profile-page-view.tsx:75-100) — without it AC-V2-04's round trip is
    // impossible. Absence of the strip is checked on /p/ by T-AC-V8-08.
    await expect(page.getByText('Viewing profile as a public visitor')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Exit Preview' })).toBeVisible();
  });
});
