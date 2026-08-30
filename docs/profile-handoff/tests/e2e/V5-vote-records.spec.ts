/**
 * V5 — Votes, transactions, history. Findings: R12, R16.
 * View doc: views/V5-vote-records.md
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

test.describe('V5 — host history', () => {
  test.skip(!CAN_SELECT_DASHBOARD, DASHBOARD_TODO);
  test.use({ storageState: FIXTURES.MEMBER_HOST });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'dashboard'));

  test.fixme('T-AC-V5-01 — hosting appears in competition history with a role', async ({ page }) => {
    await page.goto('/me/history');
    // R12: voter-history.ts reads votes + notify_me only (103, 161).
    await expect(
      page.locator('[data-testid="history-entry"][data-role="hosted"]'),
    ).not.toHaveCount(0);
  });
});

test.describe('V5 — vote ledger (after the R16 decision)', () => {
  test.skip(!CAN_SELECT_DASHBOARD, DASHBOARD_TODO);
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'dashboard'));

  test.fixme('T-AC-V5-02 — one surface; paid is a filter, not a page', async ({ page }) => {
    await page.goto('/me/votes');
    await expect(page.getByRole('button', { name: /paid/i })).toBeVisible();
    const res = await page.goto('/me/transactions');
    // Redirect (or an intentional re-scope recorded in the decision).
    expect(res?.url()).not.toContain('/me/transactions');
  });
});
