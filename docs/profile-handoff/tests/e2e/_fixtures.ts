/**
 * Shared Playwright helpers for the member-profile acceptance suite (v2).
 * Destination: eliterank-app/e2e/profile-acceptance/_fixtures.ts
 */
import { test as base, type BrowserContext, type Page } from '@playwright/test';
// App-owned experience seam (REQ-01). If the app team changes the switching
// mechanism, update THIS wrapper only — no spec touches the mechanism.
import { enableUiSurfaces } from '../helpers/ui-flags';

export type Experience = 'profile' | 'dashboard';

/**
 * The app's Playwright config derives its baseURL from PORT, default 3010
 * (eliterank-app/playwright.config.ts:62-63). Keep this default in sync.
 */
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3010';

/**
 * App-owned TODO this suite depends on (REQ-01): the app's e2e helpers expose
 * an on-selection only (`enableUiSurfaces`). There is no app-owned way to
 * select the dashboard experience (an off-selection) yet. Until the app team
 * ships one, dashboard-experience specs skip with DASHBOARD_TODO as the
 * reason — they must NOT inline the switching mechanism here.
 */
export const CAN_SELECT_DASHBOARD = false;
export const DASHBOARD_TODO =
  'Blocked on an app-owned dashboard/off experience-selection helper ' +
  '(REQ-01): e2e/helpers/ui-flags.ts exports enableUiSurfaces (on) only. ' +
  'When the app team ships the off-selection, wire it into ' +
  'selectExperience and flip CAN_SELECT_DASHBOARD.';

/**
 * REQ-18 — every spec declares the experience under test rather than
 * inheriting ambient state. Thin delegation to the app-owned helper.
 */
export async function selectExperience(
  context: BrowserContext,
  baseURL: string,
  experience: Experience,
): Promise<void> {
  if (experience === 'profile') {
    await enableUiSurfaces(context, baseURL, ['social_profile']);
    return;
  }
  // Deliberately not implemented here: encoding the off-state would hard-code
  // the switching mechanism this packet forbids itself from mandating.
  throw new Error(`selectExperience('dashboard'): ${DASHBOARD_TODO}`);
}

/** Fixture accounts — storageState paths; see tests/README.md#fixtures. */
export const FIXTURES = {
  MEMBER_PLAIN: process.env.SS_MEMBER_PLAIN ?? 'e2e/.auth/member-plain.json',
  MEMBER_HOST: process.env.SS_MEMBER_HOST ?? 'e2e/.auth/member-host.json',
  MEMBER_WINNER: process.env.SS_MEMBER_WINNER ?? 'e2e/.auth/member-winner.json',
  MEMBER_CONTESTANT_ACTIVE:
    process.env.SS_CONTESTANT_ACTIVE ?? 'e2e/.auth/contestant-active.json',
  MEMBER_CONTESTANT_MULTI:
    process.env.SS_CONTESTANT_MULTI ?? 'e2e/.auth/contestant-multi.json',
  MEMBER_CONTESTANT_OUT:
    process.env.SS_CONTESTANT_OUT ?? 'e2e/.auth/contestant-out.json',
  MEMBER_WITH_FANS: process.env.SS_MEMBER_FANS ?? 'e2e/.auth/member-fans.json',
  MEMBER_WITH_VIDEO:
    process.env.SS_MEMBER_VIDEO ?? 'e2e/.auth/member-video.json',
  MEMBER_WITH_TAGS: process.env.SS_MEMBER_TAGS ?? 'e2e/.auth/member-tags.json',
} as const;

/** Reads the numeric value out of a dashboard stat tile by its visible label. */
export async function statValue(page: Page, label: string): Promise<string> {
  const tile = page
    .locator('[data-testid="stat-label"]', { hasText: new RegExp(`^${label}$`, 'i') })
    .first();
  return (await tile.locator('xpath=following-sibling::div[1]').innerText()).trim();
}

/**
 * Reads a profile-hero count (Fans / Crowns / Competitions / Watching) by its
 * label. Selects on data-testid="hero-count-label" (REQ-19 instrumentation —
 * added by the fixes, does not exist at c2f45dd).
 */
export async function heroCountValue(page: Page, label: string): Promise<number> {
  const el = page
    .locator('[data-testid="hero-count-label"]', { hasText: new RegExp(`^${label}$`, 'i') })
    .first();
  const raw = await el.locator('xpath=preceding-sibling::div[1]').innerText();
  return Number(raw.replace(/,/g, ''));
}

export const test = base;
export { expect } from '@playwright/test';
