/**
 * V5 — Votes, transactions, history  (flag OFF)
 * Findings: P3, X3, D3 · View doc: docs/profile-handoff/views/V5-vote-records.md
 */
import { test, expect, withFlag, FIXTURES } from './_fixtures';

test.describe('V5 — vote records', () => {
  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'off');
  });

  test.describe('host member', () => {
    test.use({ storageState: FIXTURES.MEMBER_HOST });

    test.fixme('T-AC-V5-01 — a host sees competitions they ran in /me/history', async ({ page }) => {
      await page.goto('/me/history');
      // P3: getMyCompetitionHistory reads votes + notify_me_subscriptions only.
      await expect(page.getByText(/hosted/i)).toBeVisible();
    });

    test.fixme('T-AC-V5-02 — each history entry names the member’s role', async ({ page }) => {
      await page.goto('/me/history');
      const entries = page.getByTestId('history-entry');
      const n = await entries.count();
      expect(n).toBeGreaterThan(0);
      for (let i = 0; i < n; i++) {
        await expect(entries.nth(i)).toContainText(/hosted|competed|voted|watching/i);
      }
    });
  });

  test.describe('plain member', () => {
    test.use({ storageState: FIXTURES.MEMBER_PLAIN });

    test.fixme('T-AC-V5-03 — cast and paid records live on one surface', async ({ page }) => {
      await page.goto('/me/votes');
      // X3: /me/transactions is the same rows filtered to amountPaidCents > 0.
      await expect(page.getByRole('button', { name: /paid|filter/i })).toBeVisible();
    });

    test.fixme('T-AC-V5-05 — paid records stay framed as a vote ledger', async ({ page }) => {
      await page.goto('/me/votes');
      const body = await page.locator('main').innerText();
      expect(body).toMatch(/vote (ledger|record)/i);
      expect(body).not.toMatch(/card statement/i);
    });
  });
});
