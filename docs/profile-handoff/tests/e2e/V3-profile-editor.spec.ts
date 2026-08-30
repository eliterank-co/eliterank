/**
 * V3 — Profile editor. Findings: R4, R5, R17, R22, R24.
 * View doc: views/V3-profile-editor.md
 * The editor renders under either experience; these specs pin profile.
 */
import { test, expect, selectExperience, FIXTURES, BASE_URL } from './_fixtures';

test.describe('V3 — profile editor', () => {
  test.use({ storageState: FIXTURES.MEMBER_PLAIN });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V3-01 — a validation failure marks the field in human copy', async ({ page }) => {
    await page.goto('/me/profile');
    await page.getByLabel('Instagram').fill('two words');
    await page.getByRole('button', { name: /save changes/i }).click();
    // R5: today this renders "Couldn't save: invalid_input" with no field
    // marked (profile-edit.tsx:760-768; profile.ts:100).
    await expect(page.getByText(/invalid_input|profile_update_failed/)).toHaveCount(0);
    await expect(page.getByLabel('Instagram')).toHaveAttribute('aria-invalid', 'true');
  });

  test.fixme('T-AC-V3-03 — LinkedIn renders on the profile once saved', async ({ page }) => {
    await page.goto('/me/profile');
    await page.getByLabel('LinkedIn').fill('crystalkendzior');
    await page.getByRole('button', { name: /save changes/i }).click();
    await page.waitForURL(/\/me$/);
    // R4: the hero renders no LinkedIn chip (profile-hero.tsx:113-178).
    await expect(page.getByRole('link', { name: 'LinkedIn' })).toBeVisible();
  });

  test.fixme('T-AC-V3-05 — the two link fields are distinguishable', async ({ page }) => {
    await page.goto('/me/profile');
    // R22: today "Link" + "Pinned Link" with near-identical placeholders.
    await expect(page.getByLabel(/^Link$/)).toHaveCount(0);
    await expect(page.getByLabel('Website')).toBeVisible();
    await expect(page.getByLabel(/featured link/i)).toBeVisible();
  });
});

test.describe('V3 — member with an uploaded intro video', () => {
  test.use({ storageState: FIXTURES.MEMBER_WITH_VIDEO });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V3-04 — the editor video preview never paints an unpostered frame', async ({ page }) => {
    await page.goto('/me/profile');
    // Fixture guarantees a video exists — the assertion must not be skippable.
    const video = page.locator('video');
    await expect(video).not.toHaveCount(0);
    // R24: panels.tsx:104-112 renders <video> with no poster attribute.
    await expect(video.first()).toHaveAttribute('poster', /.+/);
  });
});

test.describe('V3 — member with imported interest tags', () => {
  test.use({ storageState: FIXTURES.MEMBER_WITH_TAGS });
  test.beforeEach(async ({ context }) => selectExperience(context, BASE_URL, 'profile'));

  test.fixme('T-AC-V3-06 — interests are editable, or removed everywhere', async ({ page }) => {
    // AC-V3-06 has two legitimate resolutions; this asserts either arm.
    // Fixture has imported tags, so the "removed" arm cannot pass vacuously:
    // at c2f45dd there is no editor (profile-edit.tsx:303) AND the tags still
    // render a card on the profile (interests-and-fans.tsx:32) — both arms
    // fail today (R17).
    await page.goto('/me/profile');
    const editor = page.locator('[data-testid="interests-editor"]');
    if (await editor.count()) {
      // Editable arm: the control is visible and offers the taxonomy.
      await expect(editor.first()).toBeVisible();
      await expect(editor.locator('[role="option"], button').first()).toBeVisible();
    } else {
      // Removed arm: no editor may mean no interests anywhere — the card must
      // be gone from the rendered profile even though the fixture has tags.
      await page.goto('/me');
      await expect(page.getByRole('heading', { name: /interests/i })).toHaveCount(0);
    }
  });
});
