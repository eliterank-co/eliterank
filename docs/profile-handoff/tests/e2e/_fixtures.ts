/**
 * Shared Playwright helpers for the member-profile acceptance suite.
 * Destination: eliterank-app/e2e/_fixtures.ts
 */
import { test as base, type Page } from '@playwright/test';

export type FlagState = 'on' | 'off';

/**
 * REQ-18 — every spec declares its flag state rather than inheriting ambient
 * state. `social_profile` resolves cookie -> feature_flags row -> off, so the
 * cookie wins and scopes the override to this browser context only.
 */
export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';

export async function withFlag(page: Page, state: FlagState): Promise<void> {
  await page.context().addCookies([
    {
      name: 'ui_override',
      value: `social_profile=${state}`,
      domain: new URL(BASE_URL).hostname,
      path: '/',
    },
  ]);
}

/**
 * Fixture accounts. Point these at seeded test members — several specs write
 * profile fields, so never aim them at real production accounts.
 * Each value is a path to a Playwright storageState JSON file.
 */
export const FIXTURES = {
  MEMBER_PLAIN: process.env.SS_MEMBER_PLAIN ?? 'e2e/.auth/member-plain.json',
  MEMBER_HOST: process.env.SS_MEMBER_HOST ?? 'e2e/.auth/member-host.json',
  MEMBER_WINNER: process.env.SS_MEMBER_WINNER ?? 'e2e/.auth/member-winner.json',
  MEMBER_CONTESTANT_ACTIVE:
    process.env.SS_CONTESTANT_ACTIVE ?? 'e2e/.auth/contestant-active.json',
  MEMBER_CONTESTANT_OUT:
    process.env.SS_CONTESTANT_OUT ?? 'e2e/.auth/contestant-out.json',
  /** Claimed contestant in two or more competitions — required by AC-V4-03. */
  MEMBER_CONTESTANT_MULTI:
    process.env.SS_CONTESTANT_MULTI ?? 'e2e/.auth/contestant-multi.json',
  MEMBER_WITH_FANS: process.env.SS_MEMBER_FANS ?? 'e2e/.auth/member-fans.json',
} as const;

/** Reads the numeric value out of a stat tile by its visible label. */
export async function statValue(page: Page, label: string): Promise<string> {
  const tile = page.locator('div', { hasText: new RegExp(`^${label}$`, 'i') }).first();
  return (await tile.locator('xpath=following-sibling::div[1]').innerText()).trim();
}

export const test = base;
export { expect } from '@playwright/test';
