/**
 * V9 — Contestant public profile  (/o/[org]/c/[competition]/[contestant])
 * Findings: S6 · View doc: docs/profile-handoff/views/V9-contestant-public.md
 *
 * Marked Verify, not Defect: profile-vote-panel.tsx is rendered by
 * /p/[voterId], a different route with a different data path, so its presence
 * there proves nothing about its presence here. Confirm before filing.
 */
import { test, expect, withFlag } from './_fixtures';

const CONTESTANT_PATH = process.env.FIXTURE_CONTESTANT_PATH ?? '';

test.describe('V9 — contestant public profile', () => {
  test.skip(!CONTESTANT_PATH, 'set FIXTURE_CONTESTANT_PATH to /o/<org>/c/<comp>/<contestant>');

  for (const flag of ['off', 'on'] as const) {
    test.describe(`flag ${flag}`, () => {
      test.beforeEach(async ({ page }) => {
        await withFlag(page, flag);
      });

      test.fixme('T-AC-V9-01 — an open round presents a working vote affordance', async ({ page }) => {
        await page.goto(CONTESTANT_PATH);
        await expect(page.getByRole('button', { name: /vote/i })).toBeVisible();
        await page.getByRole('button', { name: /vote/i }).click();
        await expect(page.getByRole('dialog')).toBeVisible();
      });

      test.fixme('T-AC-V9-02 — outside a round, any disabled state says why', async ({ page }) => {
        await page.goto(CONTESTANT_PATH);
        const vote = page.getByRole('button', { name: /vote/i });
        if (await vote.count()) {
          await expect(vote).toBeDisabled();
          await expect(page.getByText(/round|closed|not open/i)).toBeVisible();
        }
      });
    });
  }
});
