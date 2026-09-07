import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { checkAndAwardProfileBonuses } from '../lib/bonusVotes';

/**
 * Supabase authentication hook
 * - Real authentication only (no demo mode)
 * - Single auth state change handler
 */
export default function useSupabaseAuth() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  // Simple profile fetch — also checks if user hosts any competitions
  // and whether the user is a nominee or contestant
  const fetchProfile = useCallback(async (userId, userEmail) => {
    if (!supabase || !userId) return null;

    try {
      const [profileResult, hostResult, contestantResult, nomineeResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle(),
        supabase
          .from('competitions')
          .select('id')
          .eq('host_id', userId)
          .limit(1),
        supabase
          .from('contestants')
          .select('id')
          .eq('user_id', userId)
          .limit(1),
        userEmail
          ? supabase
              .from('nominees')
              .select('id')
              .eq('email', userEmail)
              .limit(1)
          : Promise.resolve({ data: [] }),
      ]);

      if (profileResult.error) throw profileResult.error;
      if (!profileResult.data) return null;

      return {
        ...profileResult.data,
        is_host: (hostResult.data?.length ?? 0) > 0,
        is_nominee_or_contestant:
          (contestantResult.data?.length ?? 0) > 0 ||
          (nomineeResult.data?.length ?? 0) > 0,
      };
    } catch {
      return null;
    }
  }, []);

  // Load profile for user
  const loadProfile = useCallback(async (userId, userEmail) => {
    if (!userId || !mountedRef.current) return;

    setProfileLoading(true);
    const profileData = await fetchProfile(userId, userEmail);

    if (mountedRef.current) {
      setProfile(profileData);
      setProfileLoading(false);
    }
  }, [fetchProfile]);

  // Initialize auth - runs once
  useEffect(() => {
    mountedRef.current = true;

    if (!supabase) {
      setAuthLoading(false);
      setError('Supabase not configured');
      return;
    }

    // Get initial session
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (mountedRef.current) {
          const currentUser = session?.user ?? null;
          setUser(currentUser);
          setAuthLoading(false);

          if (currentUser) {
            loadProfile(currentUser.id, currentUser.email);
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err.message);
          setAuthLoading(false);
        }
      }
    };

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!mountedRef.current) return;

        const currentUser = session?.user ?? null;
        setUser(currentUser);

        if (event === 'SIGNED_IN' && currentUser) {
          loadProfile(currentUser.id, currentUser.email);
        } else if (event === 'SIGNED_OUT') {
          setProfile(null);
        }
      }
    );

    initAuth();

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  // Listen for external profile updates (e.g. entry flow writing profile after account creation).
  // Multiple components call useSupabaseAuth() independently — this event keeps them all in sync.
  useEffect(() => {
    const handler = () => {
      if (mountedRef.current && user) {
        loadProfile(user.id, user.email);
      }
    };
    window.addEventListener('profile-updated', handler);
    return () => window.removeEventListener('profile-updated', handler);
  }, [user, loadProfile]);

  // Sign in
  const signIn = useCallback(async (email, password) => {
    if (!supabase) return { user: null, error: 'Supabase not configured' };

    setError(null);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) throw signInError;
      return { user: data.user, error: null };
    } catch (err) {
      setError(err.message);
      return { user: null, error: err.message };
    }
  }, []);

  // Sign up
  const signUp = useCallback(async (email, password, metadata = {}, signUpOptions = {}) => {
    if (!supabase) return { user: null, error: 'Supabase not configured' };

    setError(null);

    try {
      const options = { data: metadata };
      if (signUpOptions?.emailRedirectTo) {
        options.emailRedirectTo = signUpOptions.emailRedirectTo;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options,
      });

      if (signUpError) throw signUpError;
      return { user: data.user, error: null };
    } catch (err) {
      setError(err.message);
      return { user: null, error: err.message };
    }
  }, []);

  // Sign out
  const signOut = useCallback(async () => {
    if (!supabase) return;

    try {
      await supabase.auth.signOut();
    } catch {
      // Silent fail on signout
    }

    // Also clear local hook state (Supabase onAuthStateChange will fire,
    // but clearing eagerly avoids stale reads between the signOut call
    // and the async event callback)
    setUser(null);
    setProfile(null);
  }, []);

  // Update profile
  const updateProfile = useCallback(async (updates) => {
    if (!supabase) return { error: 'Supabase not configured' };
    if (!user) return { error: 'Not authenticated' };

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, email: user.email, ...updates }, { onConflict: 'id' });

      if (updateError) throw updateError;

      // Sync avatar to nominees table so cards stay up to date
      if (updates.avatar_url !== undefined) {
        supabase
          .from('nominees')
          .update({ avatar_url: updates.avatar_url })
          .eq('user_id', user.id)
          .then(() => {}); // fire-and-forget
      }

      const updatedProfile = { ...profile, ...updates };
      setProfile(updatedProfile);

      // Fire-and-forget: check and award profile-based bonus votes
      // This catches users who complete their profile after becoming a contestant
      (async () => {
        try {
          const { data: contestants } = await supabase
            .from('contestants')
            .select('id, competition_id')
            .eq('user_id', user.id)
            .eq('status', 'active');

          if (contestants?.length) {
            for (const c of contestants) {
              await checkAndAwardProfileBonuses(c.competition_id, c.id, user.id, updatedProfile);
            }
          }
        } catch (err) {
          console.warn('Error checking profile bonuses:', err);
        }
      })();

      return { error: null };
    } catch (err) {
      return { error: err.message };
    }
  }, [user, profile]);

  // Refresh profile
  const refreshProfile = useCallback(() => {
    if (user) {
      loadProfile(user.id, user.email);
    }
  }, [user, loadProfile]);

  return {
    user,
    profile,
    loading: authLoading,
    profileLoading,
    error,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
    updateProfile,
    refreshProfile,
  };
}
