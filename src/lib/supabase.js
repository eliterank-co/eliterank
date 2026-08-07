import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create Supabase client
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export const isSupabaseConfigured = () => !!supabase;

/**
 * Detects the "my session went stale" class of Postgres/PostgREST errors:
 * an expired JWT (PGRST301 / 401), or an RLS violation caused by auth.uid()
 * being null because the token lapsed (42501). These are recoverable — the
 * refresh token is usually still good — unlike a genuine permission denial.
 */
function looksLikeStaleAuth(err) {
  if (!err) return false;
  const code = err.code || '';
  const msg = err.message || '';
  return (
    code === 'PGRST301' ||
    code === '42501' ||
    err.status === 401 ||
    /jwt|token expired|not authorized|row-level security/i.test(msg)
  );
}

/**
 * Run a Supabase query/rpc thunk and, if it fails because the access token
 * went stale (a common race when a tab wakes from sleep and fires a request
 * before autoRefreshToken catches up), refresh the session once and retry.
 *
 * This turns the intermittent "it didn't work" that users hit after leaving
 * a tab open into a transparent self-heal. Non-auth errors pass straight
 * through so callers can surface them.
 *
 * @template T
 * @param {() => Promise<{ data: T, error: any }>} run - a thunk returning a
 *   Supabase result. Must be a thunk (not an awaited promise) so it can be
 *   re-invoked for the retry.
 * @returns {Promise<{ data: T, error: any }>}
 */
export async function withFreshSession(run) {
  let result = await run();
  if (supabase && looksLikeStaleAuth(result?.error)) {
    const { data, error } = await supabase.auth.refreshSession();
    if (!error && data?.session) {
      result = await run();
    }
  }
  return result;
}
