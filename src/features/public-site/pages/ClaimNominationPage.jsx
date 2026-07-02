import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../contexts/ToastContext';
import { useBuildCardFlow } from '../../entry/hooks/useBuildCardFlow';

// Shared step components
import AcceptDeclineStep from '../../entry/components/AcceptDeclineStep';
import EligibilityStep from '../../entry/components/EligibilityStep';
import EligibilityConfirmStep from '../../entry/components/EligibilityConfirmStep';
import PhotoUpload from '../../entry/components/PhotoUpload';
import BuildCardDetailsStep from '../../entry/components/BuildCardDetailsStep';
import SelfPitchStep from '../../entry/components/SelfPitchStep';
import CreatePasswordStep from '../../entry/components/CreatePasswordStep';
import WelcomeBackStep from '../../entry/components/WelcomeBackStep';
import CardReveal from '../../entry/components/CardReveal';
import CompetitionBanner from '../../entry/components/CompetitionBanner';

import '../../entry/EntryFlow.css';

/**
 * ClaimNominationPage - Unified Build Your Card flow for third-party nominees
 *
 * User clicks magic link → lands here → Accept/Decline → Build Card → Share
 * Replaces the old fragmented auth-first flow with the gamified step-by-step experience.
 */
export default function ClaimNominationPage({ token, onClose, onSuccess }) {
  const toast = useToast();
  const navigate = useNavigate();

  // Auth state — not gating on this. The flow starts at the 'accept' step
  // which doesn't need auth; by the time the nominee reaches the password
  // step, onAuthStateChange will have caught up.
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  // Data state
  const [loading, setLoading] = useState(true);
  const [nominee, setNominee] = useState(null);
  const [competition, setCompetition] = useState(null);
  const [error, setError] = useState(null);

  // "Welcome back" greet: does this nominee's invite email already own an
  // EliteRank account? If so, offer log-in (pre-fill + skip password) instead
  // of a second signup.
  const [hasExistingAccount, setHasExistingAccount] = useState(false);
  const [greetChoice, setGreetChoice] = useState(null); // null | 'new'
  const [loggedInViaGreet, setLoggedInViaGreet] = useState(false);

  const flowRef = useRef(null);

  // Check auth state on mount. Runs in the background — the claim page no
  // longer blocks on auth, so a stuck Supabase session never holds the
  // spinner hostage. The `await`s here can hang after a magic-link redirect
  // and that's OK; the flow still proceeds using the nominee record.
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          setUser(session.user);
          const { data: profileData } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          setProfile(profileData);
        }
      } catch (err) {
        console.error('Auth check error:', err);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();
        setProfile(profileData);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  // Fetch nominee data
  useEffect(() => {
    const fetchNomination = async () => {
      if (!token) {
        setError('Invalid nomination link');
        setLoading(false);
        return;
      }

      try {
        // Race the query against a timeout so a stuck Supabase client (e.g.
        // after a failed magic-link hash exchange) can't leave the page
        // frozen on the loading spinner. If it times out, fall back to a
        // direct REST call with the anon key — nominees are public-readable.
        const selectCols = `*,competition:competitions(id,name,city:cities(name),season,status,nomination_start,nomination_end,voting_start,organization:organizations(name,logo_url,slug),demographic:demographics(*),category:categories(*))`;

        const queryPromise = supabase
          .from('nominees')
          .select(selectCols)
          .eq('invite_token', token)
          .single();

        let nomineeData = null;
        let nomineeError = null;
        try {
          const result = await Promise.race([
            queryPromise,
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Supabase client timed out')), 8000)
            ),
          ]);
          nomineeData = result.data;
          nomineeError = result.error;
        } catch (clientErr) {
          console.warn('Supabase client query failed, falling back to REST:', clientErr.message);
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const restUrl = `${supabaseUrl}/rest/v1/nominees?invite_token=eq.${encodeURIComponent(token)}&select=${encodeURIComponent(selectCols)}`;
          const restResp = await fetch(restUrl, {
            headers: {
              apikey: supabaseAnonKey,
              Authorization: `Bearer ${supabaseAnonKey}`,
              Accept: 'application/vnd.pgrst.object+json',
            },
          });
          if (restResp.ok) {
            nomineeData = await restResp.json();
          } else {
            nomineeError = { message: `REST fallback failed (${restResp.status})` };
          }
        }

        if (nomineeError || !nomineeData) {
          setError('Nomination not found. This link may be invalid or expired.');
          setLoading(false);
          return;
        }

        if (nomineeData.converted_to_contestant) {
          setError('This nomination has already been fully processed.');
          setLoading(false);
          return;
        }

        if (nomineeData.status === 'rejected') {
          setError('This nomination was previously declined.');
          setLoading(false);
          return;
        }

        const comp = nomineeData.competition;
        // Nominees can accept up until voting opens. If voting_start isn't
        // set yet, voting hasn't been scheduled — keep acceptance open.
        if (comp?.voting_start) {
          const votingStart = new Date(comp.voting_start);
          if (new Date() > votingStart) {
            setError('Sorry, voting has already started for this competition.');
            setLoading(false);
            return;
          }
        }

        // Nominees who claimed but didn't finish their profile are allowed
        // to resume the build card flow — no "already claimed" block here.

        setNominee(nomineeData);
        setCompetition(comp);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching nomination:', err);
        setError('Something went wrong. Please try again.');
        setLoading(false);
      }
    };

    fetchNomination();
  }, [token]);

  // Only treat the logged-in user as the nominee if their email matches.
  // Without this guard, a logged-in nominator opening the claim link would
  // have their identity confused with the nominee's.
  const isNomineeUser = user?.email && nominee?.email &&
    user.email.toLowerCase() === nominee.email.toLowerCase();
  const effectiveUser = isNomineeUser ? user : null;
  const effectiveProfile = isNomineeUser ? profile : null;

  // Derive needsPassword inline rather than syncing via state — prevents the
  // page from getting stuck on the spinner if the auth check hangs.
  const isSelfNominee = nominee?.nominated_by === 'self';
  // A returning nominee who logs in via the greet no longer needs the password
  // step (the step list is memoized on needsPassword, so it drops automatically).
  const needsPassword = isSelfNominee ? !effectiveUser : (!isNomineeUser && !loggedInViaGreet);

  // Initialize the Build Your Card flow
  // Self-nominees resuming via claim link use the self flow (no accept/decline step)
  const flowMode = nominee?.nominated_by === 'self'
    ? (effectiveUser ? 'self-auth' : 'self-anon')
    : 'third-party';
  const flow = useBuildCardFlow({
    mode: flowMode,
    competition,
    profile: effectiveProfile,
    user: effectiveUser,
    nominee,
    needsPassword,
  });

  // Detect whether the nominee's invite email already owns an account, so we can
  // greet returning nominees with a log-in instead of a second signup. Uses a
  // token-scoped SECURITY DEFINER RPC (no email enumeration; callable by anon).
  useEffect(() => {
    let cancelled = false;
    const inviteToken = nominee?.invite_token;
    if (!inviteToken || isSelfNominee || isNomineeUser) {
      setHasExistingAccount(false);
      return;
    }
    (async () => {
      try {
        const { data } = await supabase.rpc('nominee_invite_has_account', { p_token: inviteToken });
        if (!cancelled) setHasExistingAccount(!!data);
      } catch {
        if (!cancelled) setHasExistingAccount(false);
      }
    })();
    return () => { cancelled = true; };
  }, [nominee?.invite_token, isSelfNominee, isNomineeUser]);

  // ---- Welcome-back greet handlers ----
  const handleGreetLogin = async (password) => {
    if (!nominee?.email) return;
    const ok = await flow.loginExistingAccount(nominee.email, password);
    if (ok) setLoggedInViaGreet(true);
  };
  const handleForgotPassword = async (email) => {
    if (!email) return;
    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      toast.success('Password reset link sent — check your email.');
    } catch {
      toast.error('Could not send reset email. Please try again.');
    }
  };

  // Scroll to top on step change
  useEffect(() => {
    if (flowRef.current) {
      flowRef.current.scrollTo({ top: 0 });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [flow.currentStep]);

  // Handle decline
  const handleDecline = async () => {
    const success = await flow.declineNomination();
    if (success) {
      toast.success('Nomination declined');
      onClose?.();
    }
  };

  // Handle ineligible
  const handleIneligible = async () => {
    const success = await flow.declineNomination();
    if (success) {
      toast.success('Thanks for letting us know.');
      onClose?.();
    }
  };

  // Handle details next with early persistence
  const handleDetailsNext = async () => {
    try {
      await flow.persistProgress('details');
      flow.next();
    } catch {
      // Error set in hook
    }
  };

  // Handle done
  const handleDone = () => {
    onSuccess?.();
  };

  // ---- Already completed: redirect to profile ----
  // If nominee already claimed and the logged-in user matches, send them to their profile
  const alreadyCompleted = nominee?.claimed_at && effectiveUser && effectiveProfile?.onboarded_at;
  useEffect(() => {
    if (alreadyCompleted) {
      navigate('/profile', { replace: true });
    }
  }, [alreadyCompleted, navigate]);

  // ---- Error ----
  // Must come before the loading check — otherwise an early-return in
  // fetchNomination (not found, rejected, past deadline, REST fallback
  // failure) leaves `nominee` null and the page shows the spinner forever.
  if (error) {
    return (
      <div className="entry-flow">
        <div className="entry-error-state">
          <AlertCircle size={48} />
          <h2>Oops!</h2>
          <p>{error}</p>
          <Button variant="secondary" onClick={onClose}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  // ---- Loading ----
  // Only gate on the nominee fetch + the already-completed redirect. Auth is
  // checked in the background so a stuck Supabase session can't deadlock
  // the spinner.
  if (loading || !nominee || alreadyCompleted) {
    return (
      <div className="entry-flow">
        <div className="entry-loading">
          <div className="entry-spinner" />
          <p>Loading your nomination...</p>
        </div>
      </div>
    );
  }

  // ---- Welcome back: returning nominee whose email already has an account ----
  const showGreet =
    flowMode === 'third-party' &&
    hasExistingAccount &&
    !isNomineeUser &&
    !loggedInViaGreet &&
    greetChoice !== 'new';
  if (showGreet) {
    return (
      <div className="entry-flow" ref={flowRef}>
        <div className="entry-content">
          <WelcomeBackStep
            nominee={nominee}
            competition={competition}
            email={nominee?.email || ''}
            onLogin={handleGreetLogin}
            onContinueAsNew={() => setGreetChoice('new')}
            onForgotPassword={handleForgotPassword}
            submitting={flow.isSubmitting}
            error={flow.submitError}
          />
        </div>
      </div>
    );
  }

  // ---- Render Build Your Card flow ----
  const totalDots = flow.totalSteps;
  const currentDot = flow.currentStepIndex;

  const showHeader = flow.currentStep !== 'card';
  const canGoBack = flow.currentStep !== 'accept' && flow.currentStep !== 'card';

  return (
    <div className="entry-flow" ref={flowRef}>
      {showHeader && (
        <header className="entry-header">
          {canGoBack ? (
            <button
              className="entry-back-btn"
              onClick={flow.back}
              aria-label="Go back"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            <div className="entry-header-spacer" />
          )}

          <div className="entry-progress">
            {Array.from({ length: totalDots }, (_, i) => (
              <span
                key={i}
                className={`entry-dot ${i === currentDot ? 'active' : ''} ${i < currentDot ? 'completed' : ''}`}
              />
            ))}
          </div>

          <div className="entry-header-spacer" />
        </header>
      )}

      {flow.currentStep !== 'card' && flow.currentStep !== 'accept' && competition && (
        <CompetitionBanner competition={competition} />
      )}

      <div className="entry-content" key={flow.currentStep}>
        {renderClaimStep(flow, competition, nominee, handleDecline, handleIneligible, handleDetailsNext, handleDone, user)}
      </div>
    </div>
  );
}

function renderClaimStep(flow, competition, nominee, handleDecline, handleIneligible, handleDetailsNext, handleDone, user) {
  switch (flow.currentStep) {
    case 'accept':
      return (
        <AcceptDeclineStep
          nominee={nominee}
          competition={competition}
          onAccept={flow.acceptNomination}
          onDecline={handleDecline}
          processing={flow.isSubmitting}
          error={flow.submitError}
        />
      );

    case 'eligibility':
      return (
        <EligibilityStep
          competition={competition}
          isSelf={nominee?.nominated_by === 'self'}
          answers={flow.eligibilityAnswers}
          onToggle={flow.setEligibility}
          onNext={flow.next}
        />
      );

    case 'eligibility-confirm':
      return (
        <EligibilityConfirmStep
          competition={competition}
          onNext={flow.next}
          onIneligible={handleIneligible}
        />
      );

    case 'photo':
      return (
        <PhotoUpload
          photoPreview={flow.cardData.photoPreview}
          onPhotoSelect={(file, previewUrl) =>
            flow.updateCardData({ photoFile: file, photoPreview: previewUrl })
          }
          onRemovePhoto={() =>
            flow.updateCardData({ photoFile: null, photoPreview: '' })
          }
          onNext={flow.next}
          required={true}
        />
      );

    case 'details':
      return (
        <BuildCardDetailsStep
          data={flow.cardData}
          onChange={flow.updateCardData}
          onNext={handleDetailsNext}
          error={flow.submitError}
          isSubmitting={flow.isSubmitting}
        />
      );

    case 'bio':
      return (
        <SelfPitchStep
          bio={flow.cardData.bio}
          onChange={(bio) => flow.updateCardData({ bio })}
          onSubmit={flow.submitCard}
          isSubmitting={flow.isSubmitting}
          error={flow.submitError}
          competition={competition}
        />
      );

    case 'password':
      return (
        <CreatePasswordStep
          email={flow.cardData.email}
          onSubmit={flow.createAccount}
          isSubmitting={flow.isSubmitting}
          error={flow.submitError}
          isSettingPassword={!!user}
          onForgotPassword={flow.sendPasswordReset}
        />
      );

    case 'card':
      return (
        <CardReveal
          competition={competition}
          submittedData={flow.submittedData}
          onDone={handleDone}
          organizationLogoUrl={competition?.organization?.logo_url}
        />
      );

    default:
      return null;
  }
}
