/**
 * V7 — Settings and account. Findings: R14 (gated), R19.
 * View doc: views/V7-settings.md
 * Runs under the dashboard experience — skipped until the app-owned
 * off-selection helper exists (see DASHBOARD_TODO in _fixtures.ts).
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

test.describe('V7 — account controls', () => {
  test.skip(!CAN_SELECT_DASHBOARD, DASHBOARD_TODO);
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'dashboard'));

  test.fixme('T-AC-V7-01 — password and email management reachable from settings', async ({ page }) => {
    await page.goto('/me/settings');
    // R19: no /account link exists today.
    await expect(page.getByRole('link', { name: /password|account|email/i })).toBeVisible();
  });
});

test.describe('V7 — deletion guards (GATED on AC-V7-06, the written policy)', () => {
  test.skip(!CAN_SELECT_DASHBOARD, DASHBOARD_TODO);
  // Fixture: MEMBER_HOST must hold a competition in phase 'voting' when this
  // runs — the guard under test is "a host with a LIVE competition".
  test.use({ storageState: FIXTURES.MEMBER_HOST });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'dashboard'));

  test.fixme('T-AC-V7-03 — a host with a live competition cannot delete', async ({ page }) => {
    await page.goto('/me/settings');
    await page.getByRole('button', { name: /delete/i }).click();
    await expect(page.getByText(/live competition|transfer|close/i)).toBeVisible();
  });

  test.fixme('T-AC-V7-04 — an active contestant follows the approval path', async () => {
    // Specified after AC-V7-06; asserting a flow nobody has chosen would
    // encode the answer. Placeholder deliberately unimplemented.
  });

  test.fixme('T-AC-V7-05 — deleting a past winner preserves the result record', async () => {
    // Same gate. The assertion will read the competition's public result
    // after deletion of MEMBER_WINNER and expect the crowned entry present
    // in whatever tombstoned shape the policy names.
  });
});
