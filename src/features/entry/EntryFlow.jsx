import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { usePublicCompetition } from '../../contexts/PublicCompetitionContext';
import { useSupabaseAuth } from '../../hooks';
import { useEntryFlow } from './hooks/useEntryFlow';
import { getCompetitionTitle } from './utils/eligibilityEngine';

// Step components
import CompetitionBanner from './components/CompetitionBanner';
import ModeSelect from './components/ModeSelect';
import ExistingAccountLogin from './components/ExistingAccountLogin';
import EligibilityStep from './components/EligibilityStep';
import PhotoUpload from './components/PhotoUpload';
import BuildCardDetailsStep from './components/BuildCardDetailsStep';
import SelfPitchStep from './components/SelfPitchStep';
import CreatePasswordStep from './components/CreatePasswordStep';
import NomineeInfoStep from './components/NomineeInfoStep';
import WhyNominateStep from './components/WhyNominateStep';
import NominatorInfoStep from './components/NominatorInfoStep';
import CustomQuestionsStep from './components/CustomQuestionsStep';
import CardReveal from './components/CardReveal';

import './EntryFlow.css';

/**
 * EntryFlow - Gamified nomination/self-entry flow
 * Uses PublicCompetitionContext for competition data
 * Works for ANY competition - all content driven by competition data
 */
export default function EntryFlow() {
  const navigate = useNavigate();
  const {
    competition,
    organization,
    loading,
    error,
    phase,
    orgSlug,
    competitionSlug,
    votingRounds,
    prizePool,
    about,
    isPreview,
  } = usePublicCompetition();
  const { profile } = useSupabaseAuth();

  const flow = useEntryFlow(competition, profile, { isPreview });
  const flowRef = useRef(null);

  // Optional login on the details step. New users just enter their details as
  // usual (best for conversion — no wall); returning self-entrants can tap a
  // small "Already have an account? Log in" link to pre-fill their details and
  // skip the password step. Not shown to nominators or logged-in users.
  const [showLogin, setShowLogin] = useState(false);

  const handleDetailsLogin = async (email, password) => {
    const result = await flow.loginAndPrefill(email, password);
    if (result?.success) setShowLogin(false);
    return result;
  };

  const competitionTitle = getCompetitionTitle(competition);

  // Scroll to top on step change to prevent layout jump
  useEffect(() => {
    if (flowRef.current) {
      flowRef.current.scrollTo({ top: 0 });
    } else {
      window.scrollTo({ top: 0 });
    }
  }, [flow.currentStep]);

  // Compute the URL of the parent competition page using whichever scheme the
  // user landed on. The dashboard's preview iframe arrives via the ID-based
  // route which doesn't carry a slug, so we fall back to /id/<id>.
  const competitionPath = competitionSlug
    ? `/${orgSlug}/${competitionSlug}`
    : competition?.id
      ? `/${orgSlug}/id/${competition.id}`
      : '/';
  // Preserve preview mode when bouncing back so hosts don't lose the preview.
  const competitionPathWithPreview = isPreview
    ? `${competitionPath}?preview=nominations`
    : competitionPath;

  // Handle back to competition page
  const handleBack = () => {
    // If the self-entry login panel is open, back just closes it → mode select.
    if (showLogin) {
      setShowLogin(false);
      return;
    }
    if (flow.currentStep !== 'mode' && flow.currentStep !== 'card') {
      flow.back();
    } else {
      navigate(competitionPathWithPreview);
    }
  };

  const handleDone = () => {
    navigate(competitionPathWithPreview);
  };

  // Early persist after details step for self-entry
  const handleDetailsNext = async () => {
    try {
      await flow.persistSelfProgress('details');
      flow.next();
    } catch {
      // Error already set in hook — don't navigate
    }
  };

  // Loading
  if (loading) {
    return (
      <div className="entry-flow">
        <div className="entry-loading">
          <div className="entry-spinner" />
          <p>Loading competition...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error || !competition) {
    return (
      <div className="entry-flow">
        <div className="entry-error-state">
          <AlertCircle size={48} />
          <h2>Competition Not Found</h2>
          <p>This competition doesn't exist or the URL is incorrect.</p>
          <button className="entry-btn-primary" onClick={() => navigate('/')}>
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Nominations closed check
  const isNominationPhase = phase?.phase === 'nominations';
  const isComingSoon = phase?.phase === 'coming-soon';
  if (!isNominationPhase && !isComingSoon) {
    return (
      <div className="entry-flow">
        <div className="entry-closed-state">
          <AlertCircle size={48} />
          <h2>Entries Closed</h2>
          <p>Nominations for {competitionTitle} are no longer open.</p>
          <button
            className="entry-btn-primary"
            onClick={() => navigate(competitionPathWithPreview)}
          >
            View Competition
          </button>
        </div>
      </div>
    );
  }

  // Progress dots
  const totalDots = flow.totalSteps;
  const currentDot = flow.currentStepIndex;

  return (
    <div className="entry-flow" ref={flowRef}>
      {/* Preview banner — visible to hosts walking the form from preview */}
      {isPreview && (
        <div className="entry-preview-banner">
          Preview mode — submissions are simulated and not saved.
        </div>
      )}

      {/* Header with back button and progress */}
      {flow.currentStep !== 'card' && (
        <header className="entry-header">
          <button
            className="entry-back-btn"
            onClick={handleBack}
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>

          {flow.mode && (
            <div className="entry-progress">
              {Array.from({ length: totalDots }, (_, i) => (
                <span
                  key={i}
                  className={`entry-dot ${i === currentDot ? 'active' : ''} ${i < currentDot ? 'completed' : ''}`}
                />
              ))}
            </div>
          )}

          <div className="entry-header-spacer" />
        </header>
      )}

      {/* Competition banner */}
      {flow.currentStep !== 'card' && (
        <CompetitionBanner competition={competition} logoUrl={organization?.logo_url || organization?.header_logo_url} />
      )}

      {/* Step content with slide animation */}
      <div className="entry-content" key={flow.currentStep}>
        {renderStep(flow, competition, competitionTitle, handleDone, flow.resetForNewNomination, handleDetailsNext, {
          votingRounds,
          prizePool,
          about,
          phase,
          organizationLogoUrl: organization?.logo_url,
        }, {
          showLogin,
          setShowLogin,
          onLogin: handleDetailsLogin,
          sendPasswordReset: flow.sendPasswordReset,
          isLoggedIn: flow.isLoggedIn,
        })}

        {/* "Already have an account?" link — sits directly beneath the step's
            button across the early self steps. New users ignore it; returning
            users log in to pre-fill. Hidden once logged in / on the nominate path. */}
        {!showLogin && flow.mode === 'self' && !flow.isLoggedIn &&
          ['eligibility', 'photo', 'details'].includes(flow.currentStep) && (
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <button
              type="button"
              onClick={() => setShowLogin(true)}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-primary)',
                cursor: 'pointer',
                fontSize: 14,
                padding: 0,
                textDecoration: 'underline',
              }}
            >
              Already have an account? Log in
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Render the current step
 */
function renderStep(flow, competition, competitionTitle, handleDone, handleNominateAnother, handleDetailsNext, guideContext = {}, authCtx = {}) {
  // Returning-user login can be opened from any early self step — render it in
  // place of the current step's content while open.
  if (authCtx.showLogin) {
    return (
      <ExistingAccountLogin
        title="Log in to pre-fill"
        subtitle="Already have an account? Log in and we'll fill in your details."
        onLogin={authCtx.onLogin}
        onForgotPassword={authCtx.sendPasswordReset}
        onCancel={() => authCtx.setShowLogin(false)}
        cancelLabel="Back"
      />
    );
  }

  switch (flow.currentStep) {
    case 'mode':
      return (
        <ModeSelect
          onSelectMode={flow.selectMode}
          competitionTitle={competitionTitle}
        />
      );

    case 'eligibility':
      return (
        <EligibilityStep
          competition={competition}
          isSelf={flow.mode === 'self'}
          answers={flow.eligibilityAnswers}
          onToggle={flow.setEligibility}
          onNext={flow.next}
        />
      );

    case 'photo':
      return (
        <PhotoUpload
          photoPreview={flow.selfData.photoPreview}
          onPhotoSelect={(file, previewUrl) =>
            flow.updateSelfData({ photoFile: file, photoPreview: previewUrl })
          }
          onRemovePhoto={() =>
            flow.updateSelfData({ photoFile: null, photoPreview: '' })
          }
          onNext={flow.next}
          required={true}
        />
      );

    case 'details':
      return (
        <BuildCardDetailsStep
          data={flow.selfData}
          onChange={flow.updateSelfData}
          onNext={handleDetailsNext}
          error={flow.submitError}
          isSubmitting={flow.isSubmitting}
          splitByGender={!!competition?.winners_split_by_gender}
        />
      );

    case 'bio':
      return (
        <SelfPitchStep
          bio={flow.selfData.bio}
          onChange={(bio) => flow.updateSelfData({ bio })}
          onSubmit={flow.hasCustomQuestions ? flow.next : flow.submitSelfEntry}
          isSubmitting={flow.isSubmitting}
          error={flow.submitError}
          competition={competition}
        />
      );

    case 'custom':
      return (
        <CustomQuestionsStep
          questions={flow.customQuestions}
          answers={flow.customAnswers}
          onChange={flow.setCustomAnswer}
          onSubmit={flow.mode === 'self' ? flow.submitSelfEntry : flow.next}
          isSubmitting={flow.isSubmitting}
          error={flow.submitError}
        />
      );

    case 'password':
      return (
        <CreatePasswordStep
          email={flow.selfData.email}
          onSubmit={flow.createAccount}
          isSubmitting={flow.isSubmitting}
          error={flow.submitError}
          isSettingPassword={false}
          onForgotPassword={flow.sendPasswordReset}
        />
      );

    case 'nominee':
      return (
        <NomineeInfoStep
          data={flow.nomineeData}
          onChange={flow.updateNomineeData}
          onNext={flow.next}
          error={flow.submitError}
          splitByGender={!!competition?.winners_split_by_gender}
        />
      );

    case 'why':
      return (
        <WhyNominateStep
          reason={flow.nomineeData.reason}
          onChange={(reason) => flow.updateNomineeData({ reason })}
          onNext={flow.next}
          error={flow.submitError}
          competition={competition}
          nomineeName={flow.nomineeData.name}
        />
      );

    case 'nominator':
      return (
        <NominatorInfoStep
          data={flow.nominatorData}
          onChange={flow.updateNominatorData}
          onSubmit={flow.submitNomination}
          isSubmitting={flow.isSubmitting}
          error={flow.submitError}
        />
      );

    case 'card':
      return (
        <CardReveal
          competition={competition}
          submittedData={flow.submittedData}
          onDone={handleDone}
          onNominateAnother={handleNominateAnother}
          organizationLogoUrl={guideContext.organizationLogoUrl}
          votingRounds={guideContext.votingRounds}
          prizePool={guideContext.prizePool}
          about={guideContext.about}
          phase={guideContext.phase}
        />
      );

    default:
      return null;
  }
}
