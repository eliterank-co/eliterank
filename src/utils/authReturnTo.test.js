import { describe, expect, it } from 'vitest';
import {
  AUTH_RETURN_TO_MAX_AGE_MS,
  AUTH_RETURN_TO_STORAGE_KEY,
  addPendingFanToProfileReturnTo,
  buildLegacySignupRedirectSearch,
  buildPasswordRecoveryRedirect,
  clearPendingAuthReturnTo,
  consumePendingAuthReturnTo,
  getReturnToFromSearch,
  isSafeAuthReturnTo,
  normalizeLegacyAuthReturnTo,
  normalizeEmail,
  readPendingAuthReturnTo,
  savePendingAuthReturnTo,
} from './authReturnTo';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    keyCount: () => values.size,
    raw: (key) => values.get(key),
  };
}

describe('auth return destination helpers', () => {
  it('accepts local fan paths and rejects external or malformed redirects', () => {
    expect(isSafeAuthReturnTo('/FanClub/contestant?pendingFan=1#details')).toBe(true);
    expect(isSafeAuthReturnTo('https://evil.example/steal')).toBe(false);
    expect(isSafeAuthReturnTo('//evil.example/steal')).toBe(false);
    expect(isSafeAuthReturnTo('/\\\\evil.example')).toBe(false);
    expect(isSafeAuthReturnTo('/%2F%2Fevil.example')).toBe(false);
    expect(isSafeAuthReturnTo('/FanClub/%ZZ')).toBe(false);
    expect(isSafeAuthReturnTo('FanClub/contestant')).toBe(false);
  });

  it('uses URLSearchParams decoding once and fails closed for double encoding', () => {
    expect(getReturnToFromSearch('?returnTo=%2FFanClub%2Fcontestant%3FpendingFan%3D1')).toEqual({
      provided: true,
      value: '/FanClub/contestant?pendingFan=1',
    });
    expect(getReturnToFromSearch('?returnTo=%252F%252Fevil.example')).toEqual({
      provided: true,
      value: null,
    });
    expect(getReturnToFromSearch('?other=1')).toEqual({ provided: false, value: null });
  });

  it('normalizes email only at the auth operation boundary', () => {
    expect(normalizeEmail('  Voter@Example.COM  ')).toBe('voter@example.com');
    expect(normalizeEmail(null)).toBe('');
  });

  it('normalizes the receipt producer absolute profile URL only at the signup boundary', () => {
    const origin = 'https://eliterank.example';
    const absoluteProfile = `${origin}/profile/contestant-1?source=receipt#fan`;

    expect(normalizeLegacyAuthReturnTo(absoluteProfile, origin)).toBe(
      '/profile/contestant-1?source=receipt#fan',
    );
    expect(addPendingFanToProfileReturnTo('/profile/contestant-1?source=receipt#fan')).toBe(
      '/profile/contestant-1?source=receipt&pendingFan=1#fan',
    );

    const rewritten = buildLegacySignupRedirectSearch(
      `?returnTo=${encodeURIComponent(absoluteProfile)}&source=receipt`,
      origin,
    );
    const params = new URLSearchParams(rewritten);
    expect(params.get('returnTo')).toBe(
      '/profile/contestant-1?source=receipt&pendingFan=1#fan',
    );
    expect(params.get('source')).toBe('receipt');
  });

  it('rejects cross-origin, credentialed, protocol-relative, and malformed receipt URLs', () => {
    const origin = 'https://eliterank.example';

    expect(normalizeLegacyAuthReturnTo('https://evil.example/profile/1', origin)).toBeNull();
    expect(normalizeLegacyAuthReturnTo('https://user:pass@eliterank.example/profile/1', origin)).toBeNull();
    expect(normalizeLegacyAuthReturnTo('//evil.example/profile/1', origin)).toBeNull();
    expect(normalizeLegacyAuthReturnTo('https://eliterank.example/profile/%ZZ', origin)).toBeNull();
    expect(normalizeLegacyAuthReturnTo('http://eliterank.example/profile/1', origin)).toBeNull();

    const invalid = buildLegacySignupRedirectSearch(
      `?returnTo=${encodeURIComponent('https://evil.example/profile/1')}`,
      origin,
    );
    const params = new URLSearchParams(invalid);
    expect(params.has('returnTo')).toBe(true);
    expect(params.get('returnTo')).toBe('https://evil.example/profile/1');
    expect(addPendingFanToProfileReturnTo('/FanClub')).toBe('/FanClub');
  });

  it('survives a new-tab or reload-style read from the shared local storage record', () => {
    const storage = createStorage();
    const path = '/FanClub/contestant?pendingFan=1';

    expect(savePendingAuthReturnTo(path, { storage, now: 1000 })).toBe(true);
    expect(storage.raw(AUTH_RETURN_TO_STORAGE_KEY)).toContain('path');
    expect(storage.raw(AUTH_RETURN_TO_STORAGE_KEY)).not.toMatch(/voter@example|token|password/i);

    // A second helper invocation represents the reset page in a fresh tab.
    expect(readPendingAuthReturnTo({ storage, now: 1000 + 5000 })).toBe(path);
    expect(consumePendingAuthReturnTo({ storage, now: 1000 + 5000 })).toBe(path);
    expect(storage.raw(AUTH_RETURN_TO_STORAGE_KEY)).toBeUndefined();
  });

  it('expires old records and removes only the app-owned key', () => {
    const storage = createStorage();
    storage.setItem('unrelated', 'keep');
    savePendingAuthReturnTo('/FanClub', { storage, now: 1000 });

    expect(readPendingAuthReturnTo({
      storage,
      now: 1000 + AUTH_RETURN_TO_MAX_AGE_MS + 1,
    })).toBeNull();
    expect(storage.raw(AUTH_RETURN_TO_STORAGE_KEY)).toBeUndefined();
    expect(storage.raw('unrelated')).toBe('keep');

    storage.setItem(AUTH_RETURN_TO_STORAGE_KEY, JSON.stringify({ path: '/FanClub', savedAt: 1000 }));
    clearPendingAuthReturnTo({ storage });
    expect(storage.keyCount()).toBe(1);
  });

  it('tolerates storage failures and still builds a one-time encoded recovery URL', () => {
    const failingStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
      removeItem: () => { throw new Error('blocked'); },
    };

    expect(savePendingAuthReturnTo('/FanClub', { storage: failingStorage, now: 1000 })).toBe(false);
    expect(readPendingAuthReturnTo({ storage: failingStorage, now: 1000 })).toBeNull();
    expect(() => clearPendingAuthReturnTo({ storage: failingStorage })).not.toThrow();

    const redirect = buildPasswordRecoveryRedirect(
      'https://eliterank.example',
      '/FanClub/contestant?pendingFan=1',
    );
    const parsed = new URL(redirect);
    expect(parsed.pathname).toBe('/reset-password');
    expect(parsed.searchParams.get('returnTo')).toBe('/FanClub/contestant?pendingFan=1');
  });
});
