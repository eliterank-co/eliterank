import {
  createContext,
  useContext,
  useMemo,
  useCallback,
  useState,
} from 'react';
import { useCompetitionPublic } from '../hooks/useCompetitionPublic';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { useLeaderboard } from '../hooks/useLeaderboard';
import useCountdown from '../hooks/useCountdown';
import { useAuthStore } from '../stores';

// Create context
const PublicCompetitionContext = createContext(null);

/**
 * Provider component for public competition pages
 * Wraps hooks and provides unified data access
 *
 * When `previewMode` is set, the provider forces the page into a synthetic
 * phase so hosts can preview what each phase will look like before it goes
 * live. Supported modes:
 *   - 'voting'         → synthetic round-1 voting phase
 *   - 'between-rounds' → post-nomination / pre-voting interim phase
 * Real voting actions are disabled in either mode by setting the synthetic
 * round's `isActive` to false.
 */
export function PublicCompetitionProvider({
  orgSlug,
  competitionSlug,
  competitionId,
  publicBasePath,
  previewMode = null,
  children,
}) {
  // Modal states (lifted here so any component can trigger them)
  const [selectedContestant, setSelectedContestant] = useState(null);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Main competition data - supports both slug and ID lookup
  const competitionData = useCompetitionPublic(orgSlug, competitionSlug, competitionId);

  const {
    competition,
    organization,
    phase: realPhase,
    about,
    theme,
    sponsors,
    judges,
    events,
    prizes,
    rules,
    judgingCriteria,
    bonusTasks,
    doubleVoteDays,
    announcements,
    votingRounds,
    nominationPeriods,
    loading: competitionLoading,
    error: competitionError,
    refetch: refetchCompetition,
  } = competitionData;

  // Managers (super admin, or this competition's own host/co-host) can preview
  // their competition before it's public — without needing the ?preview= param.
  // Non-managers still hit the normal public gate.
  const user = useAuthStore((s) => s.user);
  const profile = useAuthStore((s) => s.profile);
  const isManagerViewer = useMemo(() => {
    if (profile?.is_super_admin) return true;
    const uid = user?.id;
    if (!uid || !competition) return false;
    if (competition.host_id === uid) return true;
    return (competition.competition_co_hosts || []).some((ch) => ch.profile?.id === uid);
  }, [profile?.is_super_admin, user?.id, competition]);

  // Resolve the preview mode actually in effect.
  // - Previewing a NOT-yet-public competition is manager-only (super admin or
  //   this competition's host/co-host), whether triggered implicitly or via an
  //   explicit ?preview=. Non-managers stay gated. With no explicit mode, a
  //   manager defaults to the coming-soon teaser (what the public will see once
  //   it's published).
  // - For an already-public competition there's nothing to gate, so honor an
  //   explicit ?preview= as before (e.g. a host checking a future phase).
  const effectivePreviewMode = useMemo(() => {
    if (realPhase && !realPhase.isPublic) {
      if (!isManagerViewer) return null;
      return previewMode || 'coming-soon';
    }
    return previewMode;
  }, [previewMode, isManagerViewer, realPhase]);

  // In preview mode, synthesize a phase so the selected view renders even
  // when the competition is in draft/coming-soon/nominations state.
  const phase = useMemo(() => {
    if (!effectivePreviewMode || !realPhase) return realPhase;

    // Pick the first voting round (or a placeholder) so countdowns/labels work
    const previewRound = (votingRounds && votingRounds[0]) || {
      id: 'preview-round',
      title: 'Round 1',
      round_order: 1,
      start_date: null,
      end_date: null,
      round_type: 'voting',
    };

    if (effectivePreviewMode === 'between-rounds') {
      return {
        ...realPhase,
        phase: 'between-rounds',
        label: 'Between Rounds',
        isPublic: true,
        isVoting: false,
        canNominate: false,
        nextRound: previewRound,
        startsAt: previewRound.start_date || null,
      };
    }

    if (effectivePreviewMode === 'nominations') {
      return {
        ...realPhase,
        phase: 'nominations',
        label: 'Nominations Open',
        isPublic: true,
        isVoting: false,
        canNominate: true,
        endsAt: (nominationPeriods?.[0]?.end_date) || null,
      };
    }

    if (effectivePreviewMode === 'coming-soon') {
      return {
        ...realPhase,
        phase: 'coming-soon',
        label: 'Coming Soon',
        isPublic: true,
        isVoting: false,
        canNominate: false,
        startsAt: (nominationPeriods?.[0]?.start_date) || null,
      };
    }

    if (effectivePreviewMode === 'results' || effectivePreviewMode === 'winners' || effectivePreviewMode === 'completed') {
      return {
        ...realPhase,
        phase: 'results',
        label: 'Results',
        isPublic: true,
        isVoting: false,
        canNominate: false,
      };
    }

    // Default: voting preview
    return {
      ...realPhase,
      phase: 'voting',
      label: previewRound.tier_label || previewRound.title || 'Voting Preview',
      tier: previewRound.tier_label || null,
      isPublic: true,
      isVoting: true,
      canNominate: false,
      currentRound: previewRound,
      roundNumber: previewRound.round_order || 1,
      endsAt: previewRound.end_date || null,
    };
  }, [effectivePreviewMode, realPhase, votingRounds, nominationPeriods]);

  // Leaderboard data (only fetch if we have a competition). The danger zone
  // (contestants at risk of elimination) is derived from the current round's
  // configured advancing count so it matches the actual cutoff; we fall back
  // to the percentage threshold when no round is active.
  const leaderboardData = useLeaderboard(competition?.id, {
    realtime: phase?.isVoting ?? false,
    advancingCount: phase?.currentRound?.contestants_advance,
    eliminationThreshold: 0.2,
    splitByGender: !!competition?.winners_split_by_gender,
  });

  // Activity feed (only fetch if we have a competition)
  const activityData = useActivityFeed(competition?.id, {
    limit: 20,
    realtime: phase?.isVoting ?? false,
  });

  // Countdown timer
  const countdownTarget = useMemo(() => {
    if (!phase) return null;

    // Determine what to count down to based on phase
    if (phase.phase === 'coming-soon') {
      // Use phase.startsAt (from nomination_periods) or fallback to competition dates
      return phase.startsAt || competition?.nomination_start;
    }
    if (phase.phase === 'nominations') {
      // Use phase.endsAt (from nomination_periods) or fallback to competition dates
      return phase.endsAt || competition?.nomination_end;
    }
    if (phase.isVoting && phase.currentRound) {
      return phase.currentRound.end_date;
    }
    if (phase.phase === 'between-rounds' && phase.nextRound) {
      return phase.nextRound.start_date;
    }
    return null;
  }, [phase, competition]);

  const countdown = useCountdown(countdownTarget);

  // Contestant actions
  const openContestantProfile = useCallback((contestant) => {
    setSelectedContestant(contestant);
    setShowProfileModal(true);
    setShowVoteModal(false);
  }, []);

  const openVoteModal = useCallback((contestant) => {
    setSelectedContestant(contestant);
    setShowVoteModal(true);
    setShowProfileModal(false);
  }, []);

  const closeModals = useCallback(() => {
    setShowVoteModal(false);
    setShowProfileModal(false);
    // Don't clear selectedContestant immediately for animation purposes
    setTimeout(() => setSelectedContestant(null), 300);
  }, []);

  // Switch from profile to vote
  const switchToVote = useCallback(() => {
    setShowProfileModal(false);
    setShowVoteModal(true);
  }, []);

  // Combined loading state
  const loading = competitionLoading;

  // Combined error state
  const error = competitionError;

  // Build context value
  const value = useMemo(
    () => ({
      // Route params
      orgSlug,
      competitionSlug,
      publicBasePath,

      // Core data
      competition,
      organization,

      // Computed/merged values
      phase,
      about,
      theme,
      countdown,

      // Related data
      sponsors,
      judges,
      events,
      prizes,
      rules,
      judgingCriteria,
      bonusTasks,
      doubleVoteDays,
      announcements,
      votingRounds,
      nominationPeriods,

      // Leaderboard
      contestants: leaderboardData.contestants,
      topThree: leaderboardData.topThree,
      dangerZone: leaderboardData.dangerZone,
      leaderboardStats: leaderboardData.stats,
      sortBy: leaderboardData.sortBy,
      changeSort: leaderboardData.changeSort,
      getContestant: leaderboardData.getContestant,
      getContestantBySlug: leaderboardData.getContestantBySlug,

      // Activity feed
      activities: activityData.activities,
      activitiesLoading: activityData.loading,
      hasMoreActivities: activityData.hasMore,
      loadMoreActivities: activityData.loadMore,

      // Preview mode (host previewing a phase before it goes live). Managers also
      // get an implicit preview of their own not-yet-public competition.
      isPreview: Boolean(effectivePreviewMode),
      previewMode: effectivePreviewMode,

      // Modal state
      selectedContestant,
      showVoteModal,
      showProfileModal,

      // Modal actions
      openContestantProfile,
      openVoteModal,
      closeModals,
      switchToVote,

      // Global state
      loading,
      error,

      // Actions
      refetch: refetchCompetition,
    }),
    [
      orgSlug,
      competitionSlug,
      publicBasePath,
      competition,
      organization,
      phase,
      about,
      theme,
      countdown,
      sponsors,
      judges,
      events,
      prizes,
      rules,
      judgingCriteria,
      bonusTasks,
      doubleVoteDays,
      announcements,
      votingRounds,
      nominationPeriods,
      leaderboardData,
      activityData,
      effectivePreviewMode,
      selectedContestant,
      showVoteModal,
      showProfileModal,
      openContestantProfile,
      openVoteModal,
      closeModals,
      switchToVote,
      loading,
      error,
      refetchCompetition,
    ]
  );

  return (
    <PublicCompetitionContext.Provider value={value}>
      {children}
    </PublicCompetitionContext.Provider>
  );
}

/**
 * Hook to access public competition context
 * Must be used within PublicCompetitionProvider
 */
export function usePublicCompetition() {
  const context = useContext(PublicCompetitionContext);

  if (!context) {
    throw new Error(
      'usePublicCompetition must be used within a PublicCompetitionProvider'
    );
  }

  return context;
}

/**
 * Safe hook that returns whether the current render tree is inside a
 * competition preview (host previewing a phase). Returns false when the
 * component is rendered outside of a PublicCompetitionProvider, so it's safe
 * to call from shared leaf components (e.g., FanButton) used both in preview
 * contexts and non-preview pages.
 */
export function useIsPreview() {
  const context = useContext(PublicCompetitionContext);
  return Boolean(context?.isPreview);
}

export default PublicCompetitionContext;
