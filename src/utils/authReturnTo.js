/**
 * Small helpers for carrying a fan's local destination through authentication.
 *
 * Return destinations are deliberately restricted to app-relative paths. A
 * recovery link is an untrusted input, and the value should be navigated as-is
 * after URLSearchParams has decoded the query parameter once.
 */

export const DEFAULT_AUTH_RETURN_TO = '/profile';
export const AUTH_RETURN_TO_STORAGE_KEY = 'eliterank.auth.pending-return-to.v1';
export const AUTH_RETURN_TO_MAX_AGE_MS = 60 * 60 * 1000;
export const AUTH_RETURN_TO_MAX_LENGTH = 2048;

const VALIDATION_ORIGIN = 'https://eliterank.invalid';

function containsControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

/**
 * Normalize an email at the boundary where it is sent to Auth or a query.
 *
 * Supabase treats email addresses case-insensitively for this flow. Keeping
 * normalization here avoids checking one spelling while operating on another.
 */
export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Return true only for a local app path with an optional query and hash.
 *
 * The value passed here has already gone through URLSearchParams.get(). Do not
 * decode it again: encoded spaces and other query characters belong to the
 * destination supplied by the caller.
 */
export function isSafeAuthReturnTo(value) {
  if (typeof value !== 'string' || !value || value.length > AUTH_RETURN_TO_MAX_LENGTH) {
    return false;
  }

  if (
    value !== value.trim() ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    value.includes('\\') ||
    value.includes('://') ||
    containsControlCharacter(value) ||
    /%(?![0-9a-f]{2})/i.test(value)
  ) {
    return false;
  }

  // Encoded slash/backslash prefixes can become an authority separator after
  // another URL parser gets involved. Keep redirects conservative without
  // decoding the destination used for navigation.
  if (/%(?:2f|5c)/i.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value, VALIDATION_ORIGIN);
    return parsed.origin === VALIDATION_ORIGIN && parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}

/**
 * Return a safe destination or the supplied fallback when the input is absent
 * or malformed. Fallbacks are validated too, so callers cannot accidentally
 * turn this helper into an open redirect.
 */
export function getSafeAuthReturnTo(value, fallback = null) {
  if (isSafeAuthReturnTo(value)) return value;
  return isSafeAuthReturnTo(fallback) ? fallback : null;
}

/**
 * Convert a legacy absolute return URL into a local path at the compatibility
 * boundary only. The general redirect validator remains relative-path-only.
 *
 * This accepts the receipt producer's `${APP_URL}/profile/:id` shape when its
 * origin matches the current app. Credentials, protocol-relative URLs, other
 * schemes, and malformed values are rejected before any path is returned.
 */
export function normalizeLegacyAuthReturnTo(value, origin) {
  if (typeof value !== 'string' || !value || value !== value.trim()) return null;
  if (isSafeAuthReturnTo(value)) return value;
  if (
    value.startsWith('//') ||
    value.includes('\\') ||
    containsControlCharacter(value) ||
    /%(?![0-9a-f]{2})/i.test(value) ||
    !/^https?:\/\//i.test(value)
  ) {
    return null;
  }

  let appOrigin;
  try {
    appOrigin = new URL(
      origin || (typeof window !== 'undefined' ? window.location.origin : ''),
    );
    const parsed = new URL(value);
    if (
      appOrigin.username ||
      appOrigin.password ||
      parsed.username ||
      parsed.password ||
      parsed.origin !== appOrigin.origin
    ) {
      return null;
    }

    const localPath = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return isSafeAuthReturnTo(localPath) ? localPath : null;
  } catch {
    return null;
  }
}

/**
 * Receipt links invite the recipient to become a fan after sign-in. Preserve
 * that explicit opt-in affordance only for an exact public profile target;
 * this never inserts a fan row or changes any other destination.
 */
export function addPendingFanToProfileReturnTo(value) {
  const path = getSafeAuthReturnTo(value);
  if (!path) return null;

  try {
    const parsed = new URL(path, VALIDATION_ORIGIN);
    if (!/^\/profile\/[^/]+$/.test(parsed.pathname)) return path;

    const params = new URLSearchParams(parsed.search);
    params.set('pendingFan', '1');
    const search = params.toString();
    return `${parsed.pathname}${search ? `?${search}` : ''}${parsed.hash}`;
  } catch {
    return null;
  }
}

/**
 * Rewrite only the legacy signup query's returnTo value. Keeping an invalid
 * parameter present makes the next login boundary fail closed instead of
 * mistaking its absence for permission to use an old local fallback.
 */
export function buildLegacySignupRedirectSearch(search, origin) {
  const params = new URLSearchParams(search || '');
  if (!params.has('returnTo')) return search || '';

  const rawReturnTo = params.get('returnTo');
  const normalized = normalizeLegacyAuthReturnTo(rawReturnTo, origin);
  const target = normalized ? addPendingFanToProfileReturnTo(normalized) : rawReturnTo;
  params.set('returnTo', target || '');
  const serialized = params.toString();
  return serialized ? `?${serialized}` : '';
}

/**
 * Read returnTo once from a URL search string. `provided` distinguishes an
 * absent parameter from an explicitly malformed one; callers must not use a
 * stored fallback for the latter.
 */
export function getReturnToFromSearch(search) {
  const params = new URLSearchParams(search || '');
  if (!params.has('returnTo')) {
    return { provided: false, value: null };
  }

  return {
    provided: true,
    value: getSafeAuthReturnTo(params.get('returnTo')),
  };
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function removeStoredReturnTo(storage) {
  const target = resolveStorage(storage);
  if (!target) return;

  try {
    target.removeItem(AUTH_RETURN_TO_STORAGE_KEY);
  } catch {
    // Private browsing and blocked storage must not break authentication.
  }
}

/**
 * Store only a validated local path and timestamp. This fallback exists for
 * the hosted email template that drops redirectTo when opening a new tab.
 */
export function savePendingAuthReturnTo(value, options = {}) {
  const path = getSafeAuthReturnTo(value);
  if (!path) return false;

  const target = resolveStorage(options.storage);
  if (!target) return false;

  try {
    target.setItem(
      AUTH_RETURN_TO_STORAGE_KEY,
      JSON.stringify({ path, savedAt: options.now ?? Date.now() }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a still-fresh stored path. Invalid and expired records are removed from
 * the one exact key they occupy; no broad storage cleanup is performed.
 */
export function readPendingAuthReturnTo(options = {}) {
  const target = resolveStorage(options.storage);
  if (!target) return null;

  let raw;
  try {
    raw = target.getItem(AUTH_RETURN_TO_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) return null;

  try {
    const record = JSON.parse(raw);
    const savedAt = Number(record?.savedAt);
    const path = getSafeAuthReturnTo(record?.path);
    const age = (options.now ?? Date.now()) - savedAt;

    if (!path || !Number.isFinite(savedAt) || age < 0 || age > AUTH_RETURN_TO_MAX_AGE_MS) {
      removeStoredReturnTo(target);
      return null;
    }

    return path;
  } catch {
    removeStoredReturnTo(target);
    return null;
  }
}

/** Clear only the app-owned pending destination record. */
export function clearPendingAuthReturnTo(options = {}) {
  removeStoredReturnTo(options.storage);
}

/**
 * Consume a destination after a successful auth action. Reading and clearing
 * are intentionally separate operations so a failed login/reset keeps the
 * user's pending fan destination available for a retry.
 */
export function consumePendingAuthReturnTo(options = {}) {
  const path = readPendingAuthReturnTo(options);
  clearPendingAuthReturnTo(options);
  return path;
}

/**
 * Build the redirect URL supplied to Supabase Auth. The returnTo query is
 * encoded exactly once by URLSearchParams and remains optional.
 */
export function buildPasswordRecoveryRedirect(origin, returnTo) {
  const base = typeof origin === 'string' && origin ? origin : VALIDATION_ORIGIN;
  const redirect = new URL('/reset-password', base);
  const path = getSafeAuthReturnTo(returnTo);
  if (path) redirect.searchParams.set('returnTo', path);
  return redirect.toString();
}

/** Build the email-confirmation redirect used by a signup with a local target. */
export function buildLoginRedirect(origin, returnTo) {
  const base = typeof origin === 'string' && origin ? origin : VALIDATION_ORIGIN;
  const redirect = new URL('/login', base);
  const path = getSafeAuthReturnTo(returnTo);
  if (path) redirect.searchParams.set('returnTo', path);
  return redirect.toString();
}
