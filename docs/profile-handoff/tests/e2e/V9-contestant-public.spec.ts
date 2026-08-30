/**
 * V9 — Contestant public profile. Guard only (old S6 resolved).
 * View doc: views/V9-contestant-public.md
 * Needs a live contestant path fixture.
 */
import { test, expect, selectExperience, BASE_URL } from './_fixtures';

const CONTESTANT_PATH = process.env.LIVE_CONTESTANT_PATH ?? ''; // /o/…/c/…/…

test.describe('V9 — vote affordances stay mounted', () => {
  test.skip(!CONTESTANT_PATH, 'needs LIVE_CONTESTANT_PATH (a contestant in an open round)');

  test('T-AC-V9-01 — guard: the contestant page offers a vote path', async ({ page, context }) => {
    await selectExperience(context, BASE_URL, 'profile');
    await page.goto(CONTESTANT_PATH);
    await expect(
      page.getByRole('button', { name: /vote/i }).or(page.getByRole('link', { name: /vote/i })).first(),
    ).toBeVisible();
  });
});
