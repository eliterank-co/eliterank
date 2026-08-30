/**
 * V1 — Member dashboard  (/me, social_profile OFF)
 * Findings: D1, D2, D3 · View doc: docs/profile-handoff/views/V1-me-dashboard.md
 *
 * These reproduce ONLY with the flag off — this page does not render when v3 is on.
 * Fixture note: AC-V1-02/03 need MEMBER_WINNER (a member with crowned entries);
 * running them as MEMBER_PLAIN would pass vacuously once the literal '0' is removed.
 */
import { test, expect, withFlag, FIXTURES, statValue } from './_fixtures';

test.describe('V1 — member dashboard (plain member)', () => {
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

  test.fixme('T-AC-V1-04 — the watch tile matches /me/watching, or is renamed', async ({ page }) => {
    await page.goto('/me');
    const tileValue = await statValue(page, 'Markets watched');
    await page.goto('/me/watching');
    const heading = await page.getByText(/Saved markets \((\d+)\)/).innerText();
    const actual = heading.match(/\((\d+)\)/)?.[1] ?? '';
    // D3: the tile counts distinct competitions VOTED IN (lib/data/voter.ts:122).
    expect(tileValue).toBe(actual);
  });

  test.fixme('T-AC-V1-05a — tile labels for a non-host (compare with 05b)', async ({ page }) => {
    // AC-V1-05 is a two-pass check: this test and 05b (host fixture below) each
    // record the label set; the criterion is that the SETS are identical.
    // Requires data-testid="stat-label" — REQ-19.
    await page.goto('/me');
    const labels = await page.locator('[data-testid="stat-label"]').allInnerTexts();
    expect(labels.length).toBeGreaterThan(0);
    test.info().annotations.push({ type: 'labels', description: JSON.stringify(labels) });
  });
});

test.describe('V1 — member dashboard (winner)', () => {
  test.use({ storageState: FIXTURES.MEMBER_WINNER });

  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'off');
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
    const heroCrowns = await page.getByRole('link', { name: /crowns/i }).innerText();
    expect(heroCrowns).toContain(dashboardWins);
  });
});

test.describe('V1 — member dashboard (host)', () => {
  test.use({ storageState: FIXTURES.MEMBER_HOST });

  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'off');
  });

  test.fixme('T-AC-V1-05b — tile labels for a host (compare with 05a)', async ({ page }) => {
    // D2: today the third tile reads "Orgs owned" here and "Active wins" for
    // everyone else. Assert the label that must NOT be role-dependent.
    await page.goto('/me');
    const labels = await page.locator('[data-testid="stat-label"]').allInnerTexts();
    expect(labels.length).toBeGreaterThan(0);
    expect(labels).not.toContain('Orgs owned'); // role-swapped tile must be gone
    test.info().annotations.push({ type: 'labels', description: JSON.stringify(labels) });
  });
});
