/**
 * V1 — Member dashboard  (/me, social_profile OFF)
 * Findings: D1, D2, D3 · View doc: docs/profile-handoff/views/V1-me-dashboard.md
 *
 * These reproduce ONLY with the flag off — this page does not render when v3 is on.
 */
import { test, expect, withFlag, FIXTURES, statValue } from './_fixtures';

test.describe('V1 — member dashboard', () => {
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });

  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'off');
  });

  test.fixme('T-AC-V1-01 — no hardcoded tier renders anywhere on /me', async ({ page }) => {
    await page.goto('/me');
    // D1: "Gold" is a string literal in both page.tsx and _components/header.tsx.
    await expect(page.getByText('Gold member')).toHaveCount(0);
    await expect(page.getByText('Member tier')).toHaveCount(0);
  });

  test.fixme('T-AC-V1-02 — a member with crowned entries sees a real win count', async ({ page }) => {
    await page.goto('/me');
    // D2: value is the literal '0' for every non-host.
    expect(await statValue(page, 'Active wins')).not.toBe('0');
  });

  test.fixme('T-AC-V1-03 — the wins tile agrees with the v3 hero Crowns count', async ({ page }) => {
    await page.goto('/me');
    const dashboardWins = await statValue(page, 'Active wins');
    await withFlag(page, 'on');
    await page.goto('/me');
    const heroCrowns = await page
      .getByRole('link', { name: /crowns/i })
      .innerText();
    expect(heroCrowns).toContain(dashboardWins);
  });

  test.fixme('T-AC-V1-04 — the watch tile matches /me/watching, or is renamed', async ({ page }) => {
    await page.goto('/me');
    const tileValue = await statValue(page, 'Markets watched');
    await page.goto('/me/watching');
    const heading = await page.getByText(/Saved markets \((\d+)\)/).innerText();
    const actual = heading.match(/\((\d+)\)/)?.[1] ?? '';
    // D3: the tile counts distinct competitions VOTED IN (lib/data/voter.ts:122).
    expect(tileValue).toBe(actual);
  });

  test.fixme('T-AC-V1-05 — no tile changes meaning between host and non-host', async ({ page }) => {
    await page.goto('/me');
    const plainLabels = await page.locator('[data-testid="stat-label"]').allInnerTexts();
    await page.context().clearCookies();
    // Re-run as a host fixture; labels must be identical, values may differ.
    await page.goto('/me');
    const hostLabels = await page.locator('[data-testid="stat-label"]').allInnerTexts();
    expect(hostLabels).toEqual(plainLabels);
  });
});
