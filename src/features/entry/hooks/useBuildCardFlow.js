import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import { uploadPhoto } from '../utils/uploadPhoto';
import { getCityName } from '../utils/eligibilityEngine';
import { resolveNominationFormConfig } from '../../../utils/nominationFormDefaults';

/**
 * Split a persisted `eligibility_answers` blob into eligibility keys vs. host
 * custom-question answers (prefixed `cq_`) so each renders in the right step.
 */
function splitAnswers(blob) {
  const elig = {};
  const custom = {};
  if (blob && typeof blob === 'object') {
    Object.entries(blob).forEach(([k, v]) => {
      if (k.startsWith('cq_')) custom[k] = v;
      else elig[k] = v;
    });
  }
  return { elig, custom };
}

/** Race a promise against a timeout. Rejects if the promise doesn't settle in time. */
function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Request timed out. Please try again.')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * useBuildCardFlow - Unified "Build Your Card" orchestrator
 *
 * Three entry scenarios:
 * - 'self-auth':   Logged-in self-nominee  → eligibility, photo, details, bio, card
 * - 'self-anon':   Not-logged-in self-nom  → eligibility, photo, details, bio, password, card
 * - 'third-party': Third-party nominee     → accept, eligibility-confirm, photo, details, bio, password?, card
 *
 * @param {Object} options
 * @param {'self-auth'|'self-anon'|'third-party'} options.mode
 * @param {Object} options.competition - Full competition object
 * @param {Object|null} options.profile - User profile if logged in
 * @param {Object|null} options.user - Supabase auth user if logged in
 * @param {Object|null} options.nominee - Existing nominee record (third-party claims)
 * @param {boolean} options.needsPassword - Whether user needs to create/set password
 */
export function useBuildCardFlow({
  mode,
  competition,
  profile,
  user,
  nominee,
  needsPassword = false,
}) {
  // Host-defined custom questions for this competition. Answered by the nominee
  // themselves as they build their card — inserted right after 'bio' in every
  // mode (self-nominee resuming, or third-party nominee accepting).
  const customQuestions = useMemo(
    () => resolveNominationFormConfig(competition?.nomination_form_config).custom_questions,
    [competition?.nomination_form_config]
  );
  const hasCustomQuestions = customQuestions.length > 0;

  // Build step list based on mode
  const steps = useMemo(() => {
    // Append 'custom' immediately after 'bio' when the host added questions.
    const withCustom = (list) => {
      if (!hasCustomQuestions) return list;
      const idx = list.indexOf('bio');
      if (idx === -1) return list;
      return [...list.slice(0, idx + 1), 'custom', ...list.slice(idx + 1)];
    };

    switch (mode) {
      case 'self-auth':
        return withCustom(['eligibility', 'photo', 'details', 'bio', 'card']);
      case 'self-anon':
        return withCustom(['eligibility', 'photo', 'details', 'bio', 'password', 'card']);
      case 'third-party': {
        const base = ['accept', 'eligibility-confirm', 'photo', 'details', 'bio'];
        if (needsPassword) base.push('password');
        base.push('card');
        return withCustom(base);
      }
      default:
        return withCustom(['photo', 'details', 'bio', 'card']);
    }
  }, [mode, needsPassword, hasCustomQuestions]);

  // Flow state
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submittedData, setSubmittedData] = useState(null);
  const [nomineeId, setNomineeId] = useState(nominee?.id || null);
  const [inviteToken, setInviteToken] = useState(nominee?.invite_token || null);
  const [currentUser, setCurrentUser] = useState(user);

  // Sync currentUser when the user prop changes (e.g. auth loads after initial render,
  // or user signs out mid-flow)
  useEffect(() => {
    if (user && !currentUser) {
      setCurrentUser(user);
    } else if (!user && currentUser) {
      setCurrentUser(null);
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eligibility (for self modes) and host custom-question answers are stored in
  // the same `eligibility_answers` JSONB column but kept in separate state so
  // each renders in its own step. Split any persisted blob on init (custom
  // question IDs are prefixed `cq_`).
  const initialAnswers = splitAnswers(nominee?.eligibility_answers);
  const [eligibilityAnswers, setEligibilityAnswers] = useState(initialAnswers.elig);
  const [customAnswers, setCustomAnswers] = useState(initialAnswers.custom);

  // Pre-fill card data from profile or nominee record
  const nameParts = nominee?.name?.split(' ') || [];
  const [cardData, setCardData] = useState({
    firstName: profile?.first_name || nameParts[0] || '',
    lastName: profile?.last_name || nameParts.slice(1).join(' ') || '',
    age: profile?.age || nominee?.age || '',
    birthdate: profile?.birthdate || nominee?.birthdate || '',
    location: profile?.city || nominee?.city || getCityName(competition) || '',
    email: profile?.email || nominee?.email || user?.email || '',
    phone: profile?.phone || nominee?.phone || '',
    instagram: profile?.instagram || nominee?.instagram || '',
    photoFile: null,
    photoPreview: profile?.avatar_url || nominee?.avatar_url || '',
    bio: profile?.bio || nominee?.bio || '',
  });

  // Sync nominee data when the async fetch completes (nominee goes from null → data).
  // useState initial values are captured once; this effect fills empty fields when nominee loads.
  useEffect(() => {
    if (!nominee) return;

    if (nominee.id && !nomineeId) {
      setNomineeId(nominee.id);
    }
    if (nominee.invite_token && !inviteToken) {
      setInviteToken(nominee.invite_token);
    }

    // Fill answer state from the persisted blob when it loads (nominee arrives
    // async on the claim page). Only fill while empty so in-progress edits win.
    if (nominee.eligibility_answers) {
      const { elig, custom } = splitAnswers(nominee.eligibility_answers);
      setEligibilityAnswers((prev) => (Object.keys(prev).length ? prev : elig));
      setCustomAnswers((prev) => (Object.keys(prev).length ? prev : custom));
    }

    setCardData((prev) => {
      const parts = nominee.name?.split(' ') || [];
      return {
        ...prev,
        firstName: prev.firstName || parts[0] || '',
        lastName: prev.lastName || parts.slice(1).join(' ') || '',
        age: prev.age || nominee.age || '',
        birthdate: prev.birthdate || nominee.birthdate || '',
        location: prev.location || nominee.city || '',
        email: prev.email || nominee.email || user?.email || '',
        phone: prev.phone || nominee.phone || '',
        instagram: prev.instagram || nominee.instagram || '',
        photoPreview: prev.photoPreview || nominee.avatar_url || '',
        bio: prev.bio || nominee.bio || '',
      };
    });
  }, [nominee]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resume: skip to the step after the last persisted flow_stage so returning
  // users don't redo completed steps.  Runs once when nominee first loads.
  const resumedRef = useRef(false);
  useEffect(() => {
    if (resumedRef.current || !nominee?.flow_stage) return;
    resumedRef.current = true;

    // Map each persisted stage → the step the user should resume AT.
    // Third-party: accept → eligibility-confirm → photo → details → bio → password? → card
    // Self-anon:   eligibility → photo → details → bio → password → card
    // Self-auth:   eligibility → photo → details → bio → card
    const stageToResumeStep = {
      accepted: 'eligibility-confirm',           // accepted the nomination, show eligibility next
      eligibility: 'photo',                      // passed eligibility, show photo next
      'eligibility-confirm': 'photo',            // confirmed eligibility (third-party), show photo next
      photo: 'details',                          // uploaded photo, show details next
      details: 'bio',                            // filled details, show bio next
      bio: needsPassword ? 'password' : 'card',
      card: needsPassword ? 'password' : 'card',
    };
    const resumeStep = stageToResumeStep[nominee.flow_stage];
    if (resumeStep) {
      const idx = steps.indexOf(resumeStep);
      if (idx > 0) setCurrentStepIndex(idx);
    }
  }, [nominee, steps, needsPassword]);

  // When mode changes (e.g. self-anon → self-auth after password creation),
  // the steps array shrinks and currentStepIndex may be out of bounds.
  // Clamp it to the last step (card) rather than falling back to steps[0].
  useEffect(() => {
    setCurrentStepIndex((i) => Math.min(i, steps.length - 1));
  }, [steps]);

  const currentStep = steps[currentStepIndex] || steps[steps.length - 1];
  const totalSteps = steps.length;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === steps.length - 1;

  // Lightweight persist — saves only flow_stage to the nominee record.
  // Fire-and-forget so it doesn't block navigation.
  const persistFlowStage = useCallback((stage) => {
    const id = nomineeId || nominee?.id;
    if (!id) return;
    supabase
      .from('nominees')
      .update({ flow_stage: stage })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.warn('Failed to persist flow_stage:', error.message);
      });
  }, [nomineeId, nominee?.id]);

  // Steps that already persist flow_stage in their own handler. 'custom'
  // submits via submitCard (which writes flow_stage='card'), so next() must
  // not follow up with a persistFlowStage('custom') that undoes it.
  const SELF_PERSISTING_STEPS = new Set(['accept', 'details', 'bio', 'custom', 'card']);

  // Navigation
  const next = useCallback(() => {
    setSubmitError('');
    setCurrentStepIndex((prev) => {
      const completedStep = steps[prev];
      // Persist flow_stage for steps that don't handle it themselves
      if (completedStep && !SELF_PERSISTING_STEPS.has(completedStep)) {
        persistFlowStage(completedStep);
      }
      return Math.min(prev + 1, steps.length - 1);
    });
  }, [steps, persistFlowStage]);

  const back = useCallback(() => {
    setSubmitError('');
    setCurrentStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  // Field updates
  const setEligibility = useCallback((id, value) => {
    setEligibilityAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const setCustomAnswer = useCallback((id, value) => {
    setCustomAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  const updateCardData = useCallback((updates) => {
    setCardData((prev) => ({ ...prev, ...updates }));
  }, []);

  // ---- Third-party: Accept nomination ----
  const acceptNomination = useCallback(async () => {
    if (!nominee?.id) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Best-effort session warmup with a timeout. getSession() itself can
      // hang when the Supabase client is stuck in a stale refresh state
      // (e.g. after a magic-link verify) — without this guard the Accept
      // button would spin forever.
      await withTimeout(supabase.auth.getSession(), 5000).catch(() => {});

      // Call the accept-nomination edge function. It uses the service role
      // to update the nominee by invite_token, which bypasses RLS entirely
      // — so the flow works for anonymous nominees, magic-link sessions,
      // and existing users whose user_id was pre-linked by the invite.
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await withTimeout(
        fetch(`${supabaseUrl}/functions/v1/accept-nomination`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseAnonKey,
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            invite_token: nominee.invite_token,
            nominee_id: nominee.id,
          }),
        }),
        15000
      );

      let payload = null;
      try { payload = await resp.json(); } catch (_) { /* non-JSON */ }

      if (!resp.ok || payload?.error) {
        throw new Error(payload?.error || `Failed to accept nomination (${resp.status})`);
      }

      // Don't notify nominator yet — wait until the nominee finishes the
      // full flow (sets password / creates account). Notification is sent
      // at the end of createAccount.

      next();
    } catch (err) {
      setSubmitError(err.message || 'Failed to accept nomination');
    } finally {
      setIsSubmitting(false);
    }
  }, [nominee, next]);

  // ---- Third-party: Decline nomination ----
  const declineNomination = useCallback(async () => {
    if (!nominee?.id) return;
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Ensure the auth session is fresh — magic link sessions can leave the
      // Supabase client in a stale refresh state that hangs DB queries.
      await supabase.auth.getSession();

      const updateData = { status: 'declined' };
      if (currentUser?.id) {
        updateData.user_id = currentUser.id;
      }

      const { error } = await withTimeout(
        supabase
          .from('nominees')
          .update(updateData)
          .eq('id', nominee.id),
        15000
      );

      if (error) throw error;

      // Notify the nominator that their nominee declined (fire-and-forget)
      supabase.functions.invoke('notify-nominator', {
        body: { nominee_id: nominee.id, event: 'declined' },
      }).catch((err) => {
        console.warn('Failed to notify nominator of decline:', err);
      });

      return true; // Signal to parent to close/navigate away
    } catch (err) {
      setSubmitError(err.message || 'Failed to decline nomination');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [nominee, currentUser]);

  // ---- Early persistence: save progress after details step ----
  const persistProgress = useCallback(async (flowStage) => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const fullName = `${cardData.firstName} ${cardData.lastName}`.trim();

      // Upload photo if new file — failures are non-blocking here so the
      // user isn't stuck on the details step.  submitCard will retry.
      let avatarUrl = cardData.photoPreview;
      if (cardData.photoFile) {
        try {
          avatarUrl = await uploadPhoto(cardData.photoFile, 'avatars');
        } catch (uploadErr) {
          console.warn('Photo upload failed during persist, will retry on final submit:', uploadErr.message);
          // Don't save local blob: URLs to DB — use the existing remote URL or null
          avatarUrl = (cardData.photoPreview && !cardData.photoPreview.startsWith('blob:'))
            ? cardData.photoPreview
            : null;
        }
      }

      const record = {
        name: fullName,
        email: cardData.email?.trim() || null,
        phone: cardData.phone?.trim() || null,
        instagram: cardData.instagram?.trim() || null,
        age: cardData.age ? parseInt(cardData.age, 10) : null,
        birthdate: cardData.birthdate || null,
        avatar_url: avatarUrl || null,
        city: cardData.location?.trim() || null,
        flow_stage: flowStage,
      };

      // Do NOT set user_id here — it's set in createAccount after the user
      // has a confirmed auth session. Setting it prematurely (especially from
      // a stale magic-link session) violates the nominees_update_unclaimed RLS
      // policy and causes 400 errors.

      if (nomineeId) {
        // Update existing nominee record
        const { error } = await withTimeout(
          supabase
            .from('nominees')
            .update(record)
            .eq('id', nomineeId),
          15000
        );
        if (error) throw error;
      } else {
        // Insert new nominee record (self-entry early persist)
        record.competition_id = competition?.id;
        record.nominated_by = 'self';
        record.status = 'pending';
        record.eligibility_answers = eligibilityAnswers;
        // claimed_at set later: at submitCard for logged-in users, at createAccount for anon
        if (currentUser?.id) {
          record.claimed_at = new Date().toISOString();
        }

        const { data: inserted, error } = await withTimeout(
          supabase
            .from('nominees')
            .insert(record)
            .select('id')
            .single(),
          15000
        );

        if (error) {
          if (error.code === '23505') {
            throw new Error('You have already entered this competition.');
          }
          throw error;
        }
        setNomineeId(inserted.id);
      }

      // Update local preview if photo was uploaded
      if (avatarUrl && avatarUrl !== cardData.photoPreview) {
        setCardData((prev) => ({ ...prev, photoPreview: avatarUrl }));
      }
    } catch (err) {
      setSubmitError(err.message || 'Failed to save progress');
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  }, [cardData, currentUser, nomineeId, competition, eligibilityAnswers]);

  // ---- Submit final card (pitch step) ----
  const submitCard = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      // Persist with pitch included
      let avatarUrl = cardData.photoPreview;
      if (cardData.photoFile) {
        avatarUrl = await uploadPhoto(cardData.photoFile, 'avatars');
      }

      const fullName = `${cardData.firstName} ${cardData.lastName}`.trim();

      const record = {
        name: fullName,
        email: cardData.email?.trim() || null,
        phone: cardData.phone?.trim() || null,
        instagram: cardData.instagram?.trim() || null,
        age: cardData.age ? parseInt(cardData.age, 10) : null,
        birthdate: cardData.birthdate || null,
        avatar_url: avatarUrl || null,
        city: cardData.location?.trim() || null,
        bio: cardData.bio?.trim() || null,
        flow_stage: 'card',
      };

      // The 'custom' step (host questions) runs right before this submit, so
      // persist the nominee's answers here. Merge onto existing eligibility
      // answers so nothing already in the blob is dropped. Only written when
      // the host configured questions, to leave other flows untouched.
      if (hasCustomQuestions) {
        record.eligibility_answers = { ...eligibilityAnswers, ...customAnswers };
      }

      if (currentUser?.id) {
        record.user_id = currentUser.id;
        // If no password step follows, this is the final step — mark claimed
        if (!steps.includes('password') || steps.indexOf('password') < steps.indexOf('bio')) {
          record.claimed_at = new Date().toISOString();
        }
      }

      if (nomineeId) {
        // Update existing
        const { error } = await supabase
          .from('nominees')
          .update(record)
          .eq('id', nomineeId);
        if (error) throw error;
      } else {
        // Insert new (self-entry that skipped early persist)
        record.competition_id = competition?.id;
        record.nominated_by = 'self';
        record.status = 'pending';
        record.eligibility_answers = { ...eligibilityAnswers, ...customAnswers };
        // Self-auth users (logged in, no password step) are done here
        if (currentUser?.id) {
          record.claimed_at = new Date().toISOString();
        }

        const { data: inserted, error } = await supabase
          .from('nominees')
          .insert(record)
          .select('id')
          .single();

        if (error) {
          if (error.code === '23505') {
            throw new Error('You have already entered this competition.');
          }
          throw error;
        }
        setNomineeId(inserted.id);
      }

      // Also update profile if user is logged in
      if (currentUser?.id) {
        await supabase
          .from('profiles')
          .update({
            first_name: cardData.firstName.trim(),
            last_name: cardData.lastName.trim(),
            avatar_url: avatarUrl || undefined,
            bio: cardData.bio?.trim() || undefined,
            city: cardData.location?.trim() || undefined,
            age: cardData.age ? parseInt(cardData.age, 10) : undefined,
            birthdate: cardData.birthdate || undefined,
            instagram: cardData.instagram?.trim() || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentUser.id);

        window.dispatchEvent(new Event('profile-updated'));
      }

      setSubmittedData({
        name: fullName,
        photoUrl: avatarUrl,
        handle: cardData.instagram,
        bio: cardData.bio,
        isNomination: false,
      });

      // Advance to the next step. For third-party flows with needsPassword,
      // the next step after 'bio' is 'password' — jumping directly to
      // 'card' would skip it.  Using next() respects the step order.
      next();
    } catch (err) {
      setSubmitError(err.message || 'Failed to submit entry');
    } finally {
      setIsSubmitting(false);
    }
  }, [cardData, currentUser, nomineeId, competition, eligibilityAnswers, customAnswers, hasCustomQuestions, steps, next]);

  // ---- Create account / set password ----
  //
  // Both self-nominee and third-party claim flows use the same approach:
  //   1. signUp() on the client  (fast, creates auth.user + profile via trigger)
  //   2. signIn() to get a session
  //   3. Link user_id to the nominee record
  //
  // For third-party claims, if signUp fails with a "Database error" (the
  // handle_new_user trigger crashed), we fall back to the set-nominee-password
  // edge function which can clean up orphaned profiles server-side and retry.
  const createAccount = useCallback(async (password) => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const email = cardData.email?.trim();
      if (!email) throw new Error('Email is required to create an account');

      let userId = currentUser?.id || null;

      // --- Already authenticated (e.g. magic link) — just set password ---
      let sessionValid = false;
      if (currentUser) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) {
          // Session may be stale/expired (e.g. old magic link). Clear it and
          // fall through to the signUp path below instead of throwing.
          console.warn('updateUser failed (stale session?), falling back to signUp:', error.message);
          await supabase.auth.signOut();
          setCurrentUser(null);
          userId = null;
        } else {
          sessionValid = true;
          if (userId && nomineeId) {
            await supabase
              .from('nominees')
              .update({ user_id: userId, claimed_at: new Date().toISOString() })
              .eq('id', nomineeId);
          }
        }
      }

      if (!sessionValid && !currentUser) {
        const fullName = `${cardData.firstName} ${cardData.lastName}`.trim();

        // ── Use edge function for ALL flows (self + third-party) ────────
        // The edge function uses admin APIs which bypass RLS and the
        // handle_new_user trigger issues. It creates the auth user, sets
        // the password, links the nominee, and syncs profile data — all
        // server-side with the service role key.
        console.log('Using set-nominee-password edge function for account creation');

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const fnUrl = `${supabaseUrl}/functions/v1/set-nominee-password`;
        const fnHeaders = {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        };
        const fnBody = JSON.stringify({
          invite_token: inviteToken || undefined,
          nominee_id: nomineeId || undefined,
          password,
          email,
        });

        let fnResp = await fetch(fnUrl, { method: 'POST', headers: fnHeaders, body: fnBody });
        let fnData = null;
        try { fnData = await fnResp.json(); } catch (_) { /* non-JSON response */ }

        if (!fnResp.ok || fnData?.error) {
          const fnErrMsg = fnData?.error || `Edge Function returned status ${fnResp.status}`;
          console.warn('set-nominee-password attempt 1 failed:', fnErrMsg);

          // If it's an "already registered" style error, try signing in directly
          if (fnErrMsg.includes('already') || fnErrMsg.includes('exists')) {
            const { data: signInData, error: signInError } =
              await supabase.auth.signInWithPassword({ email, password });
            if (signInError) {
              throw new Error(
                'An account with this email already exists. Please use your existing password or reset it.'
              );
            }
            setCurrentUser(signInData.user);
            userId = signInData.user?.id;
          } else {
            // Retry once after a brief delay
            await new Promise((r) => setTimeout(r, 2000));
            fnResp = await fetch(fnUrl, { method: 'POST', headers: fnHeaders, body: fnBody });
            try { fnData = await fnResp.json(); } catch (_) { fnData = null; }

            if (!fnResp.ok || fnData?.error) {
              const retryErrMsg = fnData?.error || `Edge Function returned status ${fnResp.status}`;
              console.error('set-nominee-password attempt 2 failed:', retryErrMsg);
              throw new Error(
                'Account setup failed due to a server issue. Please try again in a moment, or contact support if this persists.'
              );
            }
          }
        }

        // Edge function succeeded — sign in to establish client session
        if (!userId) {
          const { data: signInData, error: signInError } =
            await supabase.auth.signInWithPassword({ email, password });
          if (signInError) {
            throw new Error(
              'Account created but sign-in failed. Please try logging in with your email and password.'
            );
          }
          setCurrentUser(signInData.user);
          userId = signInData.user?.id;
        }

        // Link user to nominee and mark claimed
        if (userId && nomineeId) {
          await supabase
            .from('nominees')
            .update({ user_id: userId, claimed_at: new Date().toISOString() })
            .eq('id', nomineeId);
        }
      }

      // The edge function already synced nominee data to the profile
      // (step 6). Do a client-side update too with the latest card data
      // in case the user edited fields after the nominee was persisted.
      if (userId) {
        const avatarUrl = (cardData.photoPreview && !cardData.photoPreview.startsWith('blob:'))
          ? cardData.photoPreview : undefined;
        const { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: userId,
            email: cardData.email?.trim() || email,
            first_name: cardData.firstName.trim(),
            last_name: cardData.lastName.trim(),
            avatar_url: avatarUrl,
            bio: cardData.bio?.trim() || null,
            city: cardData.location?.trim() || null,
            age: cardData.age ? parseInt(cardData.age, 10) : null,
            birthdate: cardData.birthdate || null,
            instagram: cardData.instagram?.trim() || null,
            phone: cardData.phone?.trim() || null,
            onboarded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (profileError) {
          // Not fatal — edge function already synced the core data
          console.warn('Client-side profile upsert failed (edge fn already synced):', profileError.message);
        }

        window.dispatchEvent(new Event('profile-updated'));
      }

      // Notify the nominator now that the nominee has truly completed the
      // flow (account created, password set, profile synced).
      if (mode === 'third-party' && nomineeId) {
        supabase.functions.invoke('notify-nominator', {
          body: { nominee_id: nomineeId, event: 'accepted' },
        }).catch((err) => {
          console.warn('Failed to notify nominator of acceptance:', err);
        });
      }

      next();
    } catch (err) {
      setSubmitError(err.message || 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  }, [currentUser, cardData, nomineeId, inviteToken, mode, next]);

  // ---- Skip password — send magic link so they can claim their account later ----
  const skipPassword = useCallback(() => {
    if (nomineeId) {
      supabase.functions.invoke('send-nomination-invite', {
        body: { nominee_id: nomineeId, force_resend: true },
      }).catch((err) => {
        console.warn('Failed to send account setup email:', err);
      });
    }
    next();
  }, [next, nomineeId]);

  // ---- Login existing account (returning nominee / account collision) ----
  const loginExistingAccount = useCallback(async (email, password) => {
    setIsSubmitting(true);
    setSubmitError('');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      setCurrentUser(data.user);

      // Fetch profile and pre-fill
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single();

      if (profileData) {
        setCardData((prev) => ({
          ...prev,
          firstName: prev.firstName || profileData.first_name || '',
          lastName: prev.lastName || profileData.last_name || '',
          age: prev.age || profileData.age || '',
          location: prev.location || profileData.city || '',
          email: prev.email || profileData.email || '',
          phone: prev.phone || profileData.phone || '',
          instagram: prev.instagram || profileData.instagram || '',
          birthdate: prev.birthdate || profileData.birthdate || '',
          photoPreview: prev.photoPreview || profileData.avatar_url || '',
          bio: prev.bio || profileData.bio || '',
        }));
      }

      // Link user to nominee
      if (data.user.id && nomineeId) {
        await supabase
          .from('nominees')
          .update({ user_id: data.user.id })
          .eq('id', nomineeId);
      }

      return true;
    } catch (err) {
      setSubmitError(err.message || 'Invalid email or password');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [nomineeId]);

  // ---- Forgot password: send a reset email ----
  // Rescues the dead-end where a logged-out existing user (who forgot their
  // password) reaches the claim password step. Mirrors LoginPage's reset flow:
  // Supabase emails a recovery link that lands on /reset-password.
  const sendPasswordReset = useCallback(async (targetEmail) => {
    const addr = (targetEmail || cardData.email || '').trim();
    if (!addr) {
      return { success: false, error: 'No email on file to send a reset to.' };
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        return { success: false, error: error.message || 'Failed to send reset email.' };
      }
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to send reset email.' };
    }
  }, [cardData.email]);

  return {
    // State
    currentStep,
    currentStepIndex,
    totalSteps,
    steps,
    isFirstStep,
    isLastStep,
    isSubmitting,
    submitError,
    submittedData,
    nomineeId,
    currentUser,

    // Data
    cardData,
    eligibilityAnswers,
    customQuestions,
    customAnswers,
    hasCustomQuestions,

    // Actions
    next,
    back,
    setEligibility,
    setCustomAnswer,
    updateCardData,
    acceptNomination,
    declineNomination,
    persistProgress,
    submitCard,
    createAccount,
    skipPassword,
    loginExistingAccount,
    sendPasswordReset,
    setSubmitError,
  };
}
