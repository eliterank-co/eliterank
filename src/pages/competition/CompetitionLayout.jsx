import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useLocation, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PublicCompetitionProvider,
  usePublicCompetition,
} from '../../contexts/PublicCompetitionContext';
import { AlertCircle, Eye, Loader, X, ArrowLeft } from 'lucide-react';
import CompetitionSkeleton from '../../components/skeletons/CompetitionSkeleton';
import { useAuthStore } from '../../stores';
import { ProfileIcon, NotificationBell } from '../../components/ui';
import { useIsJudge, useMyPerformance } from '../../hooks';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';

// Phase view components (lazy-loaded — only the active phase is needed)
const ComingSoonPhase = lazy(() => import('./phases/ComingSoonPhase'));
const NominationsPhase = lazy(() => import('./phases/NominationsPhase'));
const VotingPhase = lazy(() => import('./phases/VotingPhase'));
const BetweenRoundsPhase = lazy(() => import('./phases/BetweenRoundsPhase'));
const ResultsPhase = lazy(() => import('./phases/ResultsPhase'));

// View components for different pages (lazy-loaded)
const LeaderboardView = lazy(() => import('./views/LeaderboardView'));
const PrizesView = lazy(() => import('./views/PrizesView'));
const ContestantView = lazy(() => import('./views/ContestantView'));
const OfficialRulesView = lazy(() => import('./views/OfficialRulesView'));

// Shared components
import { CompetitionHeader } from './components/CompetitionHeader';
import { CompetitionFooter } from './components/CompetitionFooter';
import VoteModal from '../../features/public-site/components/VoteModal';

// Entry flow (lazy loaded)
const EntryFlow = lazy(() => import('../../features/entry/EntryFlow'));

// Contestant Guide (lazy loaded)
const ContestantGuide = lazy(() => import('../../features/contestant-guide/ContestantGuide'));

/**
 * Inner layout component (has access to context)
 */
function CompetitionLayoutInner() {
  const {
    loading,
    error,
    competition,
    phase,
    showVoteModal,
    showProfileModal,
    votingRounds,
    prizePool,
    about,
    organization,
    isPreview,
    previewMode,
  } = usePublicCompetition();
  const location = useLocation();
  const navigate = useNavigate();

  // Guide modal state
  const [showGuide, setShowGuide] = useState(false);

  // Auth state for profile icon (from Zustand — avoids duplicate getSession calls)
  const user = useAuthStore(s => s.user);
  const profile = useAuthStore(s => s.profile);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const signOut = useAuthStore(s => s.signOut);

  // Check if user has dashboard access
  const hasDashboardAccess = profile?.is_host || profile?.is_super_admin;
  const isJudge = useIsJudge();

  // "How to Win" and "Rewards" only apply while the user is still in the running
  // (active competition + not eliminated / not finished). Only fetch for users
  // who are actually contestants, to avoid an extra query for voters.
  const { performances } = useMyPerformance(
    profile?.is_nominee_or_contestant ? user?.id : null,
  );
  const isStillCompeting = performances.some((p) => p.isActive && p.status === 'active');

  // Navigation handlers for profile icon
  const handleLogin = () => {
    navigate('/login');
  };

  const handleProfile = () => {
    navigate('/profile');
  };

  const handleDashboard = () => {
    navigate('/dashboard');
  };

  const handleLaunchCompetition = () => {
    navigate('/dashboard?create=1');
  };

  const handleJudge = () => {
    navigate('/judge');
  };

  const handleRewards = () => {
    navigate('/rewards');
  };

  const handleAchievements = () => {
    navigate('/achievements');
  };

  const handleAccountSettings = () => {
    navigate('/account');
  };

  const handleHowToCompete = () => {
    setShowGuide(true);
  };

  const handleCloseGuide = () => {
    setShowGuide(false);
  };

  const handleLogout = async () => {
    await signOut();
  };

  // Loading state
  if (loading) {
    return <CompetitionSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="competition-layout">
        <div className="competition-error">
          <AlertCircle size={48} />
          <h2>Competition Not Found</h2>
          <p>
            {error.message === 'Competition not found'
              ? "We couldn't find this competition. It may have been removed or the URL is incorrect."
              : 'Something went wrong loading this competition. Please try again.'}
          </p>
          <a href="/" className="btn btn-primary">
            Go Home
          </a>
        </div>
      </div>
    );
  }

  // Not public (draft/cancelled) — bypassed in preview mode so hosts can see it
  if (phase && !phase.isPublic && !isPreview) {
    return (
      <div className="competition-layout">
        <div className="competition-error">
          <AlertCircle size={48} />
          <h2>Competition Not Available</h2>
          <p>This competition is not currently public.</p>
          <a href="/" className="btn btn-primary">
            Go Home
          </a>
        </div>
      </div>
    );
  }

  // Determine current view from URL
  const isEntryView = location.pathname.endsWith('/enter');
  const isLeaderboardView = location.pathname.endsWith('/leaderboard');
  const isPrizesView = location.pathname.endsWith('/prizes');
  const isRulesView = location.pathname.endsWith('/rules');
  const isContestantView = location.pathname.includes('/e/');

  // Leaderboard/Activity sub-views are reachable any time the leaderboard
  // has meaningful ranked data — during voting AND during the interim
  // between-rounds phase.
  const hasStandingsViews = phase?.isVoting || phase?.phase === 'between-rounds';

  const handleBack = () => {
    navigate('/');
  };

  // Render entry flow as full-screen overlay
  if (isEntryView) {
    return (
      <Suspense fallback={<div className="entry-flow" />}>
        <EntryFlow />
      </Suspense>
    );
  }

  // Hide floating buttons when modals are open
  const isModalOpen = showVoteModal || showProfileModal || showGuide;

  return (
    <div className="competition-layout">
      {/* Preview banner - shown to hosts previewing a phase */}
      {isPreview && <PreviewBanner mode={previewMode} />}

      {/* Floating Back Button - hidden when modal open */}
      {!isModalOpen && (
        <button
          className="competition-back-btn"
          onClick={handleBack}
          aria-label="Back to explore"
        >
          <ArrowLeft size={20} />
        </button>
      )}

      {/* Floating Profile & Notification Icons - hidden when modal open */}
      {!isModalOpen && (
        <div className="competition-profile-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAuthenticated && <NotificationBell size={40} />}
          <ProfileIcon
            isAuthenticated={isAuthenticated}
            user={user}
            profile={profile}
            onLogin={handleLogin}
            onLogout={handleLogout}
            onProfile={handleProfile}
            onRewards={isStillCompeting ? handleRewards : undefined}
            onAchievements={profile?.is_nominee_or_contestant ? handleAchievements : undefined}
            onAccountSettings={handleAccountSettings}
            onHowToCompete={isStillCompeting ? handleHowToCompete : undefined}
            onDashboard={hasDashboardAccess ? handleDashboard : null}
            onLaunchCompetition={isAuthenticated ? handleLaunchCompetition : undefined}
            hasDashboardAccess={hasDashboardAccess}
            onJudge={isJudge ? handleJudge : null}
            isJudge={isJudge}
            size={40}
          />
        </div>
      )}

      {/* View Navigation - during voting phases and between rounds */}
      {hasStandingsViews && !isContestantView && (
        <ViewNavigation
          currentView={
            isLeaderboardView
              ? 'leaderboard'
              : isPrizesView
                ? 'prizes'
                : 'main'
          }
        />
      )}

      {/* Page content - render appropriate view based on URL */}
      <main className="competition-main">
        {/* Persistent Competition Header - shown on all standings views.
            Suppress the phase badge during between-rounds so the generic
            "Between Rounds" tag doesn't show up on leaderboard/prizes. */}
        {hasStandingsViews && !isContestantView && (isLeaderboardView || isPrizesView) && (
          <CompetitionHeader
            badge={phase?.isVoting ? phase?.label : undefined}
            badgeVariant="live"
            compact
          />
        )}
        <Suspense fallback={null}>
          {isContestantView ? (
            <ContestantView />
          ) : isRulesView ? (
            <OfficialRulesView />
          ) : hasStandingsViews && isLeaderboardView ? (
            <LeaderboardView />
          ) : hasStandingsViews && isPrizesView ? (
            <PrizesView />
          ) : (
            <PhaseContent phase={phase} />
          )}
        </Suspense>

        {/* Persistent footer — org/EliteRank branding + policy links
            (Official Rules, Contest Terms, Terms, Privacy). Rendered at the
            layout level so the policies are reachable in every phase and view,
            not just on the nominations page. */}
        {!isContestantView && <CompetitionFooter />}
      </main>

      {/* Modals rendered at layout level */}
      <ContestantModals />

      {/* Contestant Guide Modal */}
      {showGuide && (
        <Suspense fallback={null}>
          <ContestantGuide
            competition={competition}
            votingRounds={votingRounds}
            prizePool={prizePool}
            about={about}
            phase={phase}
            mode="page"
            onClose={handleCloseGuide}
            onComplete={handleCloseGuide}
          />
        </Suspense>
      )}
    </div>
  );
}

/**
 * PreviewBanner - shown across the top in preview mode
 *
 * Lets hosts know they're previewing a phase (not the live page) and gives
 * them a way to exit back to the dashboard. Label reflects which phase is
 * being previewed.
 */
function PreviewBanner({ mode }) {
  const navigate = useNavigate();

  const labelMap = {
    'between-rounds': 'Between Rounds Preview — actions are disabled',
    'voting': 'Voting Page Preview — actions are disabled',
    'nominations': 'Nominations Preview — actions are disabled',
    'coming-soon': 'Coming Soon Preview — actions are disabled',
    'results': 'Results Preview — actions are disabled',
    'winners': 'Results Preview — actions are disabled',
    'completed': 'Results Preview — actions are disabled',
  };
  const label = labelMap[mode] || 'Preview — actions are disabled';

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'linear-gradient(135deg, rgba(212,175,55,0.95), rgba(244,208,63,0.95))',
        color: '#0a0a0f',
        padding: `${spacing.sm} ${spacing.md}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
        boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
        flexWrap: 'wrap',
        textAlign: 'center',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: spacing.xs }}>
        <Eye size={16} />
        {label}
      </span>
      <button
        type="button"
        onClick={() => navigate('/dashboard')}
        style={{
          padding: `${spacing.xs} ${spacing.md}`,
          background: '#0a0a0f',
          color: colors.gold.primary,
          border: `1px solid #0a0a0f`,
          borderRadius: borderRadius.sm,
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.semibold,
          cursor: 'pointer',
        }}
      >
        Exit Preview
      </button>
    </div>
  );
}

/**
 * Phase Content - renders the appropriate phase view
 */
function PhaseContent({ phase }) {
  const phaseName = phase?.phase || 'unknown';

  // Map phase to component
  switch (phaseName) {
    case 'coming-soon':
      return <ComingSoonPhase />;

    case 'nominations':
      return <NominationsPhase />;

    case 'results':
      return <ResultsPhase />;

    case 'between-rounds':
      return <BetweenRoundsPhase />;

    case 'voting':
    case 'resurrection':
    case 'finals':
      return <VotingPhase />;

    default:
      if (phase?.isVoting || phase?.isPublic) {
        return <VotingPhase />;
      }
      return <ComingSoonPhase />;
  }
}

/**
 * View Navigation - tabs for main/leaderboard
 */
function ViewNavigation({ currentView }) {
  const location = useLocation();

  // Derive base path from current URL so the tabs work across all URL formats
  // (slug `/:orgSlug/:slug`, ID `/:orgSlug/id/:competitionId`, legacy `/c/...`)
  // and preserve query params like ?preview=voting for host previews.
  const basePath = location.pathname
    .replace(/\/(leaderboard|prizes|activity|enter|rules)\/?$/, '')
    .replace(/\/$/, '');
  const search = location.search || '';

  const views = [
    { id: 'main', label: 'Competition', path: `${basePath}${search}` },
    { id: 'leaderboard', label: 'Leaderboard', path: `${basePath}/leaderboard${search}` },
    { id: 'prizes', label: 'Prizes', path: `${basePath}/prizes${search}` },
  ];

  return (
    <nav className="competition-view-nav">
      <div className="view-nav-inner">
        {views.map((view) => (
          <Link
            key={view.id}
            to={view.path}
            className={`view-nav-item ${currentView === view.id ? 'active' : ''}`}
          >
            {view.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/**
 * Contestant Modals - Profile and Vote modals
 */
function ContestantModals() {
  const {
    selectedContestant,
    showProfileModal,
    showVoteModal,
    closeModals,
    switchToVote,
    competition,
    phase,
    openVoteModal,
    getContestant,
    isPreview,
  } = usePublicCompetition();

  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore(s => s.user);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const [voteCount, setVoteCount] = useState(1);

  // Build current round info for VoteModal
  // In preview mode, force isActive=false so the modal disables vote actions
  // (it already shows a "voting not active" state for that case).
  const currentRound = phase?.currentRound
    ? { ...phase.currentRound, isActive: isPreview ? false : phase.isVoting }
    : { isActive: isPreview ? false : (phase?.isVoting ?? false) };

  // Auto-open vote modal for contestant if voteFor param is present
  useEffect(() => {
    const voteForId = searchParams.get('voteFor');
    if (voteForId && isAuthenticated && getContestant) {
      const contestant = getContestant(voteForId);
      if (contestant) {
        openVoteModal(contestant);
        // Clear the param from URL
        searchParams.delete('voteFor');
        setSearchParams(searchParams, { replace: true });
      }
    }
  }, [searchParams, isAuthenticated, getContestant, openVoteModal, setSearchParams]);

  const handleLogin = () => {
    // Build return URL with contestant ID so we can reopen the modal after login
    const returnUrl = `${location.pathname}${selectedContestant ? `?voteFor=${selectedContestant.id}` : ''}`;
    navigate(`/login?returnTo=${encodeURIComponent(returnUrl)}`);
  };

  if (!selectedContestant) return null;

  return (
    <>
      {/* Profile Modal */}
      {showProfileModal && (
        <div className="modal-overlay" onClick={closeModals}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModals}>
              <X size={18} />
              <span className="sr-only">Close</span>
            </button>

            <div className="contestant-profile-modal">
              <div className="profile-modal-header">
                {selectedContestant.avatar_url ? (
                  <img
                    src={selectedContestant.avatar_url}
                    alt={selectedContestant.name}
                    className="profile-modal-avatar"
                  />
                ) : (
                  <div className="profile-modal-avatar-placeholder">
                    {selectedContestant.name?.charAt(0)}
                  </div>
                )}
                <h2>{selectedContestant.name}</h2>
                <p className="profile-modal-rank">
                  #{selectedContestant.rank || selectedContestant.displayRank} ·{' '}
                  {(selectedContestant.votes || 0).toLocaleString()} votes
                </p>
              </div>

              {selectedContestant.bio && (
                <div className="profile-modal-bio">
                  <p>{selectedContestant.bio}</p>
                </div>
              )}

              <button onClick={switchToVote} className="btn btn-primary btn-full">
                Vote for {selectedContestant.name?.split(' ')[0]}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vote Modal - Functional voting */}
      <VoteModal
        isOpen={showVoteModal}
        onClose={closeModals}
        contestant={selectedContestant}
        voteCount={voteCount}
        onVoteCountChange={setVoteCount}
        isAuthenticated={isAuthenticated}
        onLogin={handleLogin}
        competitionId={competition?.id}
        user={user}
        currentRound={currentRound}
        votePrice={competition?.price_per_vote}
        useBundler={competition?.use_price_bundler}
        currency={competition?.organization?.default_currency}
      />
    </>
  );
}

/**
 * Main Layout Wrapper
 * Extracts route params and wraps with provider
 * Supports:
 * - ID format: /:orgSlug/id/:competitionId (most reliable)
 * - Slug format: /:orgSlug/:slug
 * - Legacy format: /c/:orgSlug/:citySlug/:year
 */
export function CompetitionLayout() {
  const params = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Determine format based on URL
  const isLegacyFormat = location.pathname.startsWith('/c/');
  const isIdFormat = params.competitionId != null;

  let orgSlug, competitionSlug, competitionId;

  if (isIdFormat) {
    // ID format: /:orgSlug/id/:competitionId - lookup by ID
    orgSlug = params.orgSlug;
    competitionId = params.competitionId;
    competitionSlug = null;
  } else if (isLegacyFormat) {
    // Legacy format: /c/:orgSlug/:citySlug/:year - construct slug
    orgSlug = params.orgSlug;
    competitionSlug = `${params.citySlug}-${params.year}`;
  } else {
    // Slug format: /:orgSlug/:slug - use slug directly
    orgSlug = params.orgSlug;
    // Remove any trailing path segments (e.g., /leaderboard, /activity)
    competitionSlug = params.slug?.split('/')[0] || params.slug;
  }

  // Preview mode: ?preview=voting or ?preview=between-rounds lets hosts
  // see what each phase will look like before it goes live. Provider gates
  // the actual bypass + synthetic phase per mode.
  const previewParam = searchParams.get('preview');
  const previewMode = ['voting', 'between-rounds', 'nominations', 'coming-soon', 'results', 'winners', 'completed'].includes(previewParam)
    ? previewParam
    : null;

  return (
    <PublicCompetitionProvider
      orgSlug={orgSlug}
      competitionSlug={competitionSlug}
      competitionId={competitionId}
      previewMode={previewMode}
    >
      <CompetitionLayoutInner />
    </PublicCompetitionProvider>
  );
}

export default CompetitionLayout;
