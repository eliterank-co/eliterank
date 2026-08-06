import { useState, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabase';

/**
 * Pull the real error message out of a Supabase Functions error. supabase-js
 * wraps a non-2xx response as FunctionsHttpError with a generic message, but
 * exposes the actual Response on `err.context`. The connect-onboard function
 * returns { error, details } (details carries Stripe's own message), so surface
 * that instead of the opaque "non-2xx status code".
 */
async function extractFnError(err, fallback) {
  try {
    const res = err?.context;
    if (res && typeof res.json === 'function') {
      const body = await res.clone().json();
      if (body?.details) return `${body.error || 'Onboarding failed'}: ${body.details}`;
      if (body?.error) return body.error;
    }
  } catch (_) {
    // fall through to the generic message
  }
  return err?.message || fallback;
}

/**
 * useStripeConnect
 *
 * Thin client for the `connect-onboard` edge function (§5.1). Handles starting
 * Stripe Connect Express onboarding for a host organization and syncing the
 * KYC/capability status back after the host returns from Stripe.
 *
 * The platform never sees the host's SSN/EIN — Stripe collects it in its hosted
 * onboarding (Invariant 15). We only ever read back `kyc_status` + flags.
 */
export function useStripeConnect() {
  const [starting, setStarting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  // Synchronous re-entrancy guard. `starting` (state) only disables the button
  // after a re-render, so a fast double-click — or two open tabs — could fire
  // two onboarding requests before that lands. This ref flips synchronously, so
  // the second call bails immediately and we never create a duplicate account.
  const inFlightRef = useRef(false);

  /**
   * Create (or reuse) the org's Express account and redirect the browser to
   * Stripe's hosted onboarding. Returns nothing — it navigates away on success.
   */
  const startOnboarding = useCallback(async (organizationId, country) => {
    if (!organizationId) {
      setError('No organization to connect.');
      return;
    }
    if (inFlightRef.current) return; // already opening — ignore the re-fire
    inFlightRef.current = true;
    setStarting(true);
    setError(null);
    try {
      const base = window.location.origin + window.location.pathname;
      const { data, error: fnError } = await supabase.functions.invoke('connect-onboard', {
        body: {
          action: 'create_account_link',
          organization_id: organizationId,
          // Host's legal-entity country (US | CA). Only honored on first connect,
          // before the Stripe account exists; the account's country is fixed
          // once created. Omitted → the function defaults to the org's country.
          ...(country ? { country } : {}),
          return_url: `${base}?connect=return&org=${organizationId}`,
          refresh_url: `${base}?connect=refresh&org=${organizationId}`,
        },
      });
      if (fnError) throw fnError;
      if (!data?.url) throw new Error('No onboarding URL returned.');
      window.location.href = data.url;
    } catch (err) {
      console.error('Failed to start Stripe onboarding:', err);
      setError(await extractFnError(err, 'Could not start onboarding.'));
      setStarting(false);
      // Re-open is allowed after a failure (success navigates away, so no reset
      // needed there — the page unloads).
      inFlightRef.current = false;
    }
  }, []);

  /**
   * Pull the latest account status from Stripe and persist it. Returns the
   * status payload (or null on failure).
   */
  const syncStatus = useCallback(async (organizationId) => {
    if (!organizationId) return null;
    setSyncing(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('connect-onboard', {
        body: { action: 'sync_status', organization_id: organizationId },
      });
      if (fnError) throw fnError;
      return data;
    } catch (err) {
      console.error('Failed to sync Stripe status:', err);
      setError(await extractFnError(err, 'Could not refresh status.'));
      return null;
    } finally {
      setSyncing(false);
    }
  }, []);

  return { startOnboarding, syncStatus, starting, syncing, error };
}

export default useStripeConnect;
