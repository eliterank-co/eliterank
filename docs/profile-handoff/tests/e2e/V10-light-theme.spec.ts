/**
 * V10 — Light theme resolution. Criterion: AC-V10-02.
 * View doc: views/V10-light-theme.md
 *
 * Palette-agnostic: asserts resolution semantics, not colors. Runnable once
 * the light block and the explicit-choice mechanism exist. How the explicit
 * choice is SET and STAMPED is app-owned; setExplicitTheme() below is the one
 * seam to update when the app team lands it (assumed: a control on
 * /me/settings). Assertions observe only `color-scheme` on the root — the
 * resolved-theme observable AC-V10-02 requires — not any particular stamping
 * mechanism (`data-theme` is an example in the view doc, not a mandate).
 */
import { test, expect, selectExperience, FIXTURES, BASE_URL } from './_fixtures';
import type { Page } from '@playwright/test';

async function resolvedColorScheme(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
}

async function setExplicitTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.goto('/me/settings');
  await page.getByRole('radio', { name: new RegExp(theme, 'i') })
    .or(page.getByRole('button', { name: new RegExp(theme, 'i') }))
    .first()
    .click();
}

test.describe('V10 — viewer theme resolution', () => {
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V10-02a — system default follows prefers-color-scheme', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/me');
    expect(await resolvedColorScheme(page)).toContain('light');

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.reload();
    expect(await resolvedColorScheme(page)).toContain('dark');
  });

  test.fixme('T-AC-V10-02b — an explicit choice beats system, both directions', async ({ page }) => {
    // The observable is the resolved color-scheme diverging from the emulated
    // system preference — proof an explicit, persisted choice won. Whatever
    // root marker the app team stamps (data-theme, a class, …) is theirs.
    await page.emulateMedia({ colorScheme: 'dark' });
    await setExplicitTheme(page, 'light');
    await page.goto('/me');
    expect(await resolvedColorScheme(page)).toContain('light');

    await page.emulateMedia({ colorScheme: 'light' });
    await setExplicitTheme(page, 'dark');
    await page.goto('/me');
    expect(await resolvedColorScheme(page)).toContain('dark');
  });

  test.fixme('T-AC-V10-02c — no wrong-theme flash on first paint', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    // The root must carry its resolved scheme before first paint — i.e. the
    // stamp is server-rendered or applied by a blocking inline script, never
    // a post-hydration effect.
    await page.goto('/me', { waitUntil: 'commit' });
    expect(await resolvedColorScheme(page)).toContain('light');
  });
});
