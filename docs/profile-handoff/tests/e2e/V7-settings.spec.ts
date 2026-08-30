/**
 * V7 — Settings and account  (/me/settings, flag OFF)
 * Findings: G5, X1 · View doc: docs/profile-handoff/views/V7-settings.md
 *
 * AC-V7-03..05 are gated on AC-V7-06 — the retention policy. Do not implement
 * the guards these specs describe until that document exists (REQ-14).
 */
import { test, expect, withFlag, FIXTURES } from './_fixtures';

test.describe('V7 — settings and account', () => {
  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'off');
  });

  test.describe('reachability', () => {
    test.use({ storageState: FIXTURES.MEMBER_PLAIN });

    test.fixme('T-AC-V7-01 — password and email are reachable in one step', async ({ page }) => {
      await page.goto('/me/settings');
      // G5: settings links only to /me/profile, /me/history, /me/transactions.
      await expect(page.getByRole('link', { name: /password|account/i })).toBeVisible();
    });
  });

  test.describe('deletion guards', () => {
    test.use({ storageState: FIXTURES.MEMBER_HOST });

    test.fixme('T-AC-V7-03 — a host with a run competition cannot self-delete', async ({ page }) => {
      await page.goto('/me/settings');
      await page.getByRole('button', { name: /delete (my )?account/i }).click();
      // X1: account-deletion.ts has no preconditions today.
      const alert = page.getByRole('alert');
      await expect(alert).toBeVisible();
      await expect(alert).toContainText(/competition/i);
      // REQ-V7-5: a refusal must state the route to resolution.
      await expect(alert).toContainText(/contact|support|transfer/i);
    });
  });

  test.describe('contestant review path', () => {
    test.use({ storageState: FIXTURES.MEMBER_CONTESTANT_ACTIVE });

    test.fixme('T-AC-V7-04 — an active contestant enters review, not deletion', async ({ page }) => {
      await page.goto('/me/settings');
      await page.getByRole('button', { name: /delete (my )?account/i }).click();
      await expect(page.getByText(/review|request/i)).toBeVisible();
    });
  });

  test.describe('winner records', () => {
    test.use({ storageState: FIXTURES.MEMBER_WINNER });

    test.fixme('T-AC-V7-05 — deleting a winner preserves the result record', async ({ page }) => {
      // Verify against the competition's public result page after deletion,
      // per whatever the retention policy (AC-V7-06) specifies for attribution.
      test.skip(true, 'blocked on AC-V7-06 — retention policy not yet written');
    });
  });
});
