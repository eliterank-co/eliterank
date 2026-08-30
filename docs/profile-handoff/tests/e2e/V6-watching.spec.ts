/**
 * V6 — Watch list. Finding: R8 (cross-surface consistency) + guard.
 * View doc: views/V6-watching.md
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

test.describe('V6 — watching consistency (both experiences in one spec)', () => {
  test.skip(!CAN_SELECT_DASHBOARD, DASHBOARD_TODO);
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });

  test.fixme('T-AC-V6-01 — every watching number agrees with the list', async ({ page, context }) => {
    await selectExperience(context, BASE_URL, 'dashboard');
    await page.goto('/me/watching');
    const rows = await page.locator('[data-testid="watching-row"]').count();

    await page.goto('/me');
    // Quick action shows "N saved" (real, me/page.tsx:195-199); the stat tile
    // must agree or be renamed (R8: today it counts competitions voted in).
    await expect(page.getByText(`${rows} saved`)).toBeVisible();
    const tile = await statValue(page, 'Markets watched').catch(() => null);
    if (tile !== null) expect(Number(tile)).toBe(rows);

    await selectExperience(context, BASE_URL, 'profile');
    await page.goto('/me');
    expect(await heroCountValue(page, 'Watching')).toBe(rows);
  });
});

test.describe('V6 — mixed-case email guard', () => {
  // The loader (listMyWatching, keyed by lowercased email) runs identically
  // under either experience; selecting profile keeps this guard runnable
  // while the dashboard off-selection remains an app-owned TODO.
  // Skips without its fixture — a vacuous pass is worse than a skip.
  const EXPECTED = Number(process.env.MIXEDCASE_WATCH_COUNT ?? NaN);
  test.skip(
    !process.env.SS_MEMBER_MIXEDCASE || !Number.isInteger(EXPECTED) || EXPECTED < 1,
    'needs SS_MEMBER_MIXEDCASE fixture and MIXEDCASE_WATCH_COUNT (its seeded watch count, >= 1)',
  );
  test.use({ storageState: process.env.SS_MEMBER_MIXEDCASE });

  test('T-AC-V6-02 — guard: uppercase auth email still lists watches', async ({ page, context }) => {
    await selectExperience(context, BASE_URL, 'profile');
    await page.goto('/me/watching');
    // The regression this guards (lowercasing moved out of the loader) yields
    // an EMPTY list, not an error — so assert the seeded rows actually render.
    // The panel title renders the real count today: "Saved markets (N)"
    // (me/watching/page.tsx:42).
    await expect(page.getByText(`Saved markets (${EXPECTED})`)).toBeVisible();
    await expect(page.getByText(/couldn.t load|error/i)).toHaveCount(0);
  });
});
