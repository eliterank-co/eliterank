/**
 * V4 — Contestant self-service. Finding: R18. View doc: views/V4-contestant.md
 * Needs the dashboard experience — skipped until the app-owned off-selection
 * helper exists (see DASHBOARD_TODO in _fixtures.ts).
 */
import {
  test,
  expect,
  selectExperience,
  FIXTURES,
  BASE_URL,
  CAN_SELECT_DASHBOARD,
  DASHBOARD_TODO,
} from './_fixtures';

test.describe('V4 — eliminated contestant', () => {
  test.skip(!CAN_SELECT_DASHBOARD, DASHBOARD_TODO);
  test.use({ storageState: FIXTURES.MEMBER_CONTESTANT_OUT });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'dashboard'));

  test.fixme('T-AC-V4-01 — the result reads as an achievement, not "Eliminated"', async ({ page }) => {
    await page.goto('/me/contestant');
    // R18: contestant/page.tsx:175-182 renders the bare binary status.
    await expect(page.getByText(/^Eliminated$/)).toHaveCount(0);
    await expect(page.getByText(/winner|2nd|3rd|top \d+|round \d+|competed/i).first()).toBeVisible();
  });
});
