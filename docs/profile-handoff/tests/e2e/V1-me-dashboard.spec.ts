/**
 * V1 — Member dashboard (dashboard experience). Findings: R6, R7, R8.
 * View doc: views/V1-me-dashboard.md
 *
 * Every describe here needs the dashboard experience, whose selection is an
 * app-owned TODO (see DASHBOARD_TODO in _fixtures.ts) — skipped until the
 * app team ships the off-selection helper.
 */
import {
  test,
  expect,
  selectExperience,
  FIXTURES,
  statValue,
  heroCountValue,
  BASE_URL,
  CAN_SELECT_DASHBOARD,
  DASHBOARD_TODO,
} from './_fixtures';

test.describe('V1 — plain member', () => {
  test.skip(!CAN_SELECT_DASHBOARD, DASHBOARD_TODO);
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'dashboard'));

  test.fixme('T-AC-V1-01 — no hardcoded tier renders on /me', async ({ page }) => {
    await page.goto('/me');
    // AC-V1-01 allows a DERIVED tier. Two passing shapes:
    //  - a tier element exists and names its derivation (data-source), or
    //  - no tier element renders at all.
    // Today (R6): the literals at me/page.tsx:111 and _components/header.tsx:75
    // render with neither the testid nor a derivation — the else-arm fails.
    const tier = page.locator('[data-testid="member-tier"]');
    if (await tier.count()) {
      await expect(tier.first()).toHaveAttribute('data-source', /.+/);
    } else {
      await expect(page.getByText('Gold member')).toHaveCount(0);
      await expect(page.getByText('Member tier')).toHaveCount(0);
    }
  });

  test.fixme('T-AC-V1-04 — watch tile matches /me/watching, or is renamed', async ({ page }) => {
    await page.goto('/me');
    const tile = await statValue(page, 'Markets watched'); // fails once renamed — then retarget
    await page.goto('/me/watching');
    const rows = await page.locator('[data-testid="watching-row"]').count();
    // R8: today the tile counts competitions VOTED IN (voter.ts:188).
    expect(Number(tile)).toBe(rows);
  });

  test.fixme('T-AC-V1-05 — host stats are additive, never renamed', async ({ browser }) => {
    // AC-V1-05: the non-host label set is a subset of the host label set —
    // hosts may gain an additive tile, but no shared tile is renamed by role.
    // R7: today the third tile is role-redefined ("Active wins" ↔ "Orgs
    // owned", me/page.tsx:107-109), so the subset assertion fails.
    const readLabels = async (storageState: string): Promise<string[]> => {
      const ctx = await browser.newContext({ storageState, baseURL: BASE_URL });
      await selectExperience(ctx, BASE_URL, 'dashboard');
      const p = await ctx.newPage();
      await p.goto('/me');
      const labels = await p.locator('[data-testid="stat-label"]').allInnerTexts();
      await ctx.close();
      return labels.map((l) => l.trim());
    };

    const plain = await readLabels(FIXTURES.MEMBER_PLAIN);
    const host = await readLabels(FIXTURES.MEMBER_HOST);

    expect(plain.length).toBeGreaterThan(0);
    // Nothing a non-host sees may disappear or be renamed for a host…
    for (const label of plain) expect(host).toContain(label);
    // …and anything extra must be additive, not a redefinition of a shared tile.
    expect(host.length).toBeGreaterThanOrEqual(plain.length);
  });
});

test.describe('V1 — winner', () => {
  test.skip(!CAN_SELECT_DASHBOARD, DASHBOARD_TODO);
  test.use({ storageState: FIXTURES.MEMBER_WINNER });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'dashboard'));

  test.fixme('T-AC-V1-02 — a crowned member sees a real win count', async ({ page }) => {
    await page.goto('/me');
    // R7: value is the literal '0' for every non-host (me/page.tsx:107-109).
    expect(await statValue(page, 'Active wins')).not.toBe('0');
  });

  test.fixme('T-AC-V1-03 — wins agree with the profile Crowns count', async ({ page, context }) => {
    await page.goto('/me');
    const wins = await statValue(page, 'Active wins');
    await selectExperience(context, BASE_URL, 'profile');
    await page.goto('/me');
    const crowns = await heroCountValue(page, 'Crowns');
    expect(crowns).toBe(Number(wins));
  });
});
