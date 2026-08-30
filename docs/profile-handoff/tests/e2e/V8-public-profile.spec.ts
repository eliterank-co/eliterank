/**
 * V8 — Public member profile. Findings: R1, R9, R15 (+guard).
 * View doc: views/V8-public-profile.md
 * Needs target voterIds (fixture-provided) and the profile experience.
 */
import { test, expect, selectExperience, FIXTURES, BASE_URL } from './_fixtures';

const TARGET = process.env.TARGET_VOTER_ID ?? '';
const TARGET_WINNER = process.env.TARGET_VOTER_ID_WINNER ?? '';

test.describe('V8 — visitor', () => {
  test.skip(!TARGET, 'needs TARGET_VOTER_ID (a fixture member with fans + a live entry, NO crown, NO org)');
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V8-01 — a signed-in visitor can become and stop being a fan', async ({ page }) => {
    await page.goto(`/p/${TARGET}`);
    // R1: FanButton is unmounted at c2f45dd — no toggle renders anywhere.
    const toggle = page.locator('[data-testid="fan-toggle"]');
    await expect(toggle).toBeVisible();
    const before = await toggle.innerText();
    await toggle.click();
    await expect(toggle).not.toHaveText(before);
  });

  test.fixme('T-AC-V8-03 — the story-card modal delivers the actual card', async ({ page }) => {
    await page.goto(`/p/${TARGET}`);
    await page.getByRole('button', { name: /story card/i }).click();
    // R9: today the modal offers navigator.share(url) and copy-link only;
    // the 1080x1920 route is unreachable from it.
    const download = page.getByRole('link', { name: /download/i })
      .or(page.getByRole('button', { name: /download/i }));
    await expect(download).toBeVisible();
  });

  test.fixme('T-AC-V8-04 (negative) — no unearned role tabs for a crownless, org-less member', async ({ page }) => {
    await page.goto(`/p/${TARGET}`); // fixture target has NO crown and NO org
    await page.getByRole('button', { name: /story card/i }).click();
    // R9: all five tabs render for everyone today.
    await expect(page.getByRole('button', { name: 'WINNER' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'HOST' })).toHaveCount(0);
  });

  test('T-AC-V8-08 — guard: owner-only data absent on the public render', async ({ page }) => {
    await page.goto(`/p/${TARGET}`);
    await expect(page.getByText('Watching', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Bonus Vote Tasks')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Edit Profile' })).toHaveCount(0);
    await expect(page.getByText('Viewing your official member profile')).toHaveCount(0);
  });
});

test.describe('V8 — crowned member (positive half of AC-V8-04)', () => {
  // Without this half, a fix that deletes ALL role tabs would pass the
  // negative test above while breaking earned self-presentation.
  test.skip(!TARGET_WINNER, 'needs TARGET_VOTER_ID_WINNER (public profile of the crowned fixture)');
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V8-04 (positive) — a crowned member keeps the WINNER tab', async ({ page }) => {
    await page.goto(`/p/${TARGET_WINNER}`);
    await page.getByRole('button', { name: /story card/i }).click();
    await expect(page.getByRole('button', { name: 'WINNER' })).toBeVisible();
  });
});

test.describe('V8 — naming (after the R15 decision)', () => {
  test.skip(!TARGET, 'needs TARGET_VOTER_ID');
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V8-02 — one term for the fan relationship', async ({ page }) => {
    await page.goto(`/p/${TARGET}`);
    // Placeholder until the term is chosen: assert the LOSING term is absent.
    // Update on decision: e.g. if "Fans" wins, "Followers" must not appear.
    const counts = await page.locator('[data-testid="hero-count-label"]').allInnerTexts();
    expect(counts.filter((c) => /fan|follow/i.test(c)).length).toBeLessThanOrEqual(1);
  });
});
