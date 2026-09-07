/**
 * LoginPageWrapper - Login page with pending nominations handling
 * 
 * Wraps the auth feature's LoginPage and handles:
 * - Post-login redirection
 * - Pending nominations check
 * - Return URL handling
 */

import React, { lazy, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores';
import {
  consumePendingAuthReturnTo,
  getReturnToFromSearch,
  getSafeAuthReturnTo,
  readPendingAuthReturnTo,
} from '../utils/authReturnTo';

const LoginPage = lazy(() => import('../features/auth/LoginPage'));

/**
 * Check for pending nominations for a user
 */
async function checkPendingNominations(userEmail) {
  if (!userEmail || !supabase) return null;

  try {
    const { data: nominees, error } = await supabase
      .from('nominees')
      .select(`
        id,
        name,
        email,
        invite_token,
        claimed_at,
        status,
        user_id,
        nominator_name,
        nominator_anonymous,
        nomination_reason,
        competition:competitions(
          id,
          name,
          season,
          status,
          nomination_end,
          city:cities(name),
          organization:organizations(name, slug, logo_url)
        )
      `)
      .eq('email', userEmail)
      .eq('nominated_by', 'third_party')
      .not('status', 'in', '("rejected","declined")')
      .or('converted_to_contestant.is.null,converted_to_contestant.eq.false')
      .is('claimed_at', null);

    if (error || !nominees?.length) {
      return null;
    }

    // Filter to only pending nominations
    const pending = nominees.filter(n => {
      if (n.competition?.nomination_end) {
        const endDate = new Date(n.competition.nomination_end);
        if (new Date() > endDate) return false;
      }
      return true;
    });

    return pending.length ? pending : null;
  } catch (err) {
    console.error('Error checking pending nominations:', err);
    return null;
  }
}

export default function LoginPageWrapper({
  onPendingNominations
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const loading = useAuthStore(s => s.isLoading);

  // Resolve the query exactly once. URLSearchParams already decodes a query
  // value, so navigating through decodeURIComponent here would decode a
  // legitimate destination twice. An explicit malformed value fails closed
  // and never falls back to an older stored destination.
  const [returnToContext] = useState(() => {
    const parsed = getReturnToFromSearch(searchParams.toString());
    return {
      ...parsed,
      value: parsed.provided ? parsed.value : readPendingAuthReturnTo(),
    };
  });
  const returnTo = returnToContext.value;

  // Track whether user is actively logging in through the form.
  // This prevents the auto-redirect useEffect from racing with handleLogin.
  const isLoggingInRef = useRef(false);

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleLogin = useCallback(async (userData) => {
    isLoggingInRef.current = true;

    // Check for pending nominations first
    if (userData?.email) {
      const pending = await checkPendingNominations(userData.email);

      if (pending?.length && onPendingNominations) {
        onPendingNominations(pending);
        consumePendingAuthReturnTo();
        navigate('/profile', { replace: true });
        return;
      }
    }

    // No pending nominations - normal flow
    consumePendingAuthReturnTo();
    navigate(getSafeAuthReturnTo(returnTo, '/profile') || '/profile', { replace: true });
  }, [returnTo, navigate, onPendingNominations]);

  // If already authenticated (e.g. navigated to /login while logged in), redirect.
  // Skip this redirect when the user is actively logging in through the form —
  // handleLogin manages the post-login navigation including pending-nomination checks.
  useEffect(() => {
    if (!loading && isAuthenticated && !isLoggingInRef.current) {
      consumePendingAuthReturnTo();
      navigate(getSafeAuthReturnTo(returnTo, '/profile') || '/profile', { replace: true });
    }
  }, [loading, isAuthenticated, returnTo, navigate]);

  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#0a0a0c' }} />}>
      <LoginPage
        onLogin={handleLogin}
        onBack={handleBack}
        returnTo={returnTo}
        returnToProvided={returnToContext.provided}
      />
    </Suspense>
  );
}
