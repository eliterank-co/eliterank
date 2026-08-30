/**
 * V2 — Social profile v3  (/me, social_profile ON)
 * Findings: G1, G2, G3, S3 · View doc: docs/profile-handoff/views/V2-me-social-profile.md
 */
import { test, expect, withFlag, FIXTURES } from './_fixtures';

test.describe('V2 — social profile (v3)', () => {
  test.beforeEach(async ({ page }) => {
    await withFlag(page, 'on');
  });

  test.describe('host identity', () => {
    test.use({ storageState: FIXTURES.MEMBER_HOST });

    test.fixme('T-AC-V2-01 — a host sees their organization named in the hero', async ({ page }) => {
      await page.goto('/me');
      // G2: hero.tsx takes no role or organization prop today.
      await expect(page.getByTestId('profile-hero')).toContainText(/organization|host/i);
    });
  });

  test.describe('non-host', () => {
    test.use({ storageState: FIXTURES.MEMBER_PLAIN });

    test.fixme('T-AC-V2-01b — a non-host sees no host affordance in the hero', async ({ page }) => {
      await page.goto('/me');
      await expect(page.getByTestId('profile-hero')).not.toContainText(/host/i);
    });

    test.fixme('T-AC-V2-04 — Interests panel is editable-backed, or absent', async ({ page }) => {
      await page.goto('/me');
      const interests = page.getByRole('heading', { name: 'Interests' });
      if (await interests.count()) {
        // G1: the empty state currently points at a control that does not exist.
        await expect(page.getByText(/add interests in profile settings/i)).toHaveCount(0);
      }
    });

    test('T-AC-V2-05 — the owner-only Watching count renders for the owner', async ({ page }) => {
      // Regression guard: currently correct. A fix to G2/G3 touches the shared
      // hero and must not move this onto the public page (see T-AC-V8-07).
      await page.goto('/me');
      await expect(page.getByRole('link', { name: /watching/i })).toBeVisible();
    });
  });

  test.describe('contestant', () => {
    test.use({ storageState: FIXTURES.MEMBER_CONTESTANT_ACTIVE });

    test.fixme('T-AC-V2-02 — open bonus tasks appear on the member’s own profile', async ({ page }) => {
      await page.goto('/me');
      // G3: the actionable checklist lives on the competition page only.
      await expect(page.getByRole('heading', { name: /bonus/i })).toBeVisible();
      await expect(page.getByRole('link', { name: /complete|share|review/i }).first()).toBeVisible();
    });
  });
});
