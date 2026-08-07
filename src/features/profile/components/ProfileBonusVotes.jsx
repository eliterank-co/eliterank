import { useState, useEffect, useRef, useMemo, useCallback, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { getContestantCompetitions, getNominationsForUser } from '../../../lib/competition-history';
import { useBonusVotes } from '../../../hooks/useBonusVotes';
import { useAuthContextSafe } from '../../../contexts/AuthContext';
import BonusVotesChecklist from '../../../components/BonusVotesChecklist';
import VideoPromptsChecklist from '../../../components/VideoPromptsChecklist';
import SubmitProofModal from '../../../components/modals/SubmitProofModal';
import SubmitVideoProofModal from '../../../components/modals/SubmitVideoProofModal';
import { useToast } from '../../../contexts/ToastContext';
import { BONUS_TASK_KEYS, loadNomineeBonusActions, saveNomineeBonusAction, awardNomineeActionBonuses } from '../../../lib/bonusVotes';
import { shareProfileLink } from '../../entry/utils/shareUtils';
import { spacing, typography, colors, borderRadius } from '../../../styles/theme';

const ContestantGuide = lazy(() => import('../../../features/contestant-guide/ContestantGuide'));

/**
 * Default bonus task definitions for building client-side checklist for nominees.
 */
const DEFAULT_BONUS_TASKS = [
  { task_key: 'complete_profile', label: 'Complete your profile', description: 'Fill out your name, bio, and city', votes_awarded: 10, sort_order: 1 },
  { task_key: 'add_photo', label: 'Add a profile photo', description: 'Upload a profile photo so voters can see you', votes_awarded: 5, sort_order: 2 },
  { task_key: 'add_social', label: 'Link a social account', description: 'Connect your Instagram, Twitter, or TikTok', votes_awarded: 5, sort_order: 3 },
  { task_key: 'view_how_to_win', label: 'Review How to Win info', description: 'Read through the competition rules and tips', votes_awarded: 5, sort_order: 4 },
  { task_key: 'share_profile', label: 'Share your profile', description: 'Share your contestant profile link externally', votes_awarded: 5, sort_order: 5 },
];



/**
 * Renders the bonus votes checklist for a contestant (DB-backed).
 */
function CompetitionBonusVotes({ competitionId, contestantId, userId, userEmail, competitionName, onBonusVotesLoaded }) {
  const navigate = useNavigate();
  const { profile } = useAuthContextSafe();
  const toast = useToast();
  const [showGuide, setShowGuide] = useState(false);
  const [proofTask, setProofTask] = useState(null);
  const [videoTask, setVideoTask] = useState(null);
  const dismissKey = `bonus_dismissed_${contestantId}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey) === 'true'; } catch { return false; }
  });

  const {
    tasks, loading, awarding,
    completedCount, totalCount,
    totalBonusVotesEarned, totalBonusVotesAvailable,
    progress, allCompleted,
    checkProfile, awardTask, submitProof, markHowToWinViewed, markProfileShared,
  } = useBonusVotes(competitionId, contestantId, userId);

  // Report bonus votes to parent
  useEffect(() => {
    if (!loading && tasks.length > 0 && onBonusVotesLoaded) {
      onBonusVotesLoaded({ totalEarned: totalBonusVotesEarned, totalAvailable: totalBonusVotesAvailable, allCompleted });
    }
  }, [loading, totalBonusVotesEarned, totalBonusVotesAvailable, allCompleted, tasks.length, onBonusVotesLoaded]);

  // Auto-check profile completeness and award applicable bonuses.
  //
  // We intentionally re-run on every profile change (no once-only guard).
  // awardBonusVotes is idempotent server-side via UNIQUE(task_id,
  // contestant_id), so duplicate runs just return already_completed and
  // produce no toast. This way an avatar or social field that becomes
  // truthy mid-session (profile edit, late data hydration) actually
  // triggers the award without waiting for a 'profile-updated' event.
  const hasCheckedNomineeActions = useRef(false);
  useEffect(() => {
    if (loading || !profile || tasks.length === 0) return;
    checkProfile(profile).then((awarded) => {
      if (awarded.length > 0) {
        const totalVotes = awarded.reduce((sum, a) => sum + (a.votes_awarded || 0), 0);
        toast?.success?.(`You earned ${totalVotes} bonus votes!`);
      }
    });
  }, [loading, profile, tasks.length, checkProfile, toast]);

  // Auto-award action-based tasks completed during nominee phase
  useEffect(() => {
    if (!loading && tasks.length > 0 && userId && competitionId && contestantId && !hasCheckedNomineeActions.current) {
      // Only run if there are incomplete action tasks
      const hasIncompleteActions = tasks.some(
        t => (t.task_key === 'view_how_to_win' || t.task_key === 'share_profile') && !t.completed
      );
      if (hasIncompleteActions) {
        hasCheckedNomineeActions.current = true;
        awardNomineeActionBonuses(competitionId, contestantId, userId).then((awarded) => {
          if (awarded.length > 0) {
            const totalVotes = awarded.reduce((sum, a) => sum + (a.votes_awarded || 0), 0);
            toast?.success?.(`You earned ${totalVotes} bonus votes!`);
          }
        });
      }
    }
  }, [loading, tasks, userId, competitionId, contestantId, toast]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    try { localStorage.setItem(dismissKey, 'true'); } catch { /* ignore */ }
  }, [dismissKey]);

  const handleGuideComplete = async () => {
    setShowGuide(false);
    const result = await markHowToWinViewed();
    if (result?.success) {
      toast?.success?.(`+${result.votes_awarded} bonus votes for reviewing How to Win!`);
    }
  };

  const handleSubmitProof = async (taskId, proofUrl) => {
    const result = await submitProof(taskId, proofUrl);
    if (result?.success) {
      toast?.success?.('Proof submitted! Waiting for host approval.');
    }
  };

  const handleTaskAction = async (taskKey, task) => {
    if (task?.task_key === BONUS_TASK_KEYS.INTRO_VIDEO) {
      setVideoTask(task);
      return;
    }

    if (task?.requires_approval) {
      setProofTask(task);
      return;
    }

    if (taskKey === BONUS_TASK_KEYS.COMPLETE_PROFILE || taskKey === BONUS_TASK_KEYS.ADD_SOCIAL) {
      navigate('/profile?edit=true');
      return;
    } else if (taskKey === BONUS_TASK_KEYS.VIEW_HOW_TO_WIN) {
      setShowGuide(true);
    } else if (taskKey === BONUS_TASK_KEYS.SHARE_PROFILE) {
      // Award on engagement (sheet presented or link copied), not on OS
      // confirmation of a completed share — see shareProfileLink docs.
      const shareUrl = `${window.location.origin}/profile/${userId}`;
      const outcome = await shareProfileLink(shareUrl);
      if (outcome === 'failed') return;
      if (outcome === 'copied') toast?.success?.('Profile link copied to clipboard!');
      const result = await markProfileShared();
      if (result?.success) {
        toast?.success?.(`+${result.votes_awarded} bonus votes for sharing!`);
      }
    } else {
      const result = await awardTask(taskKey);
      if (result?.success) {
        toast?.success?.(`+${result.votes_awarded} bonus votes!`);
      }
    }
  };

  if (loading || tasks.length === 0) {
    // Still show video prompts even when no bonus tasks
    return (
      <div style={{ marginBottom: spacing.xl }}>
        <VideoPromptsChecklist competitionId={competitionId} contestantId={contestantId} userId={userId}  />
      </div>
    );
  }

  // All tasks complete - just show video prompts
  if (allCompleted) {
    return (
      <div style={{ marginBottom: spacing.xl }}>
        <VideoPromptsChecklist competitionId={competitionId} contestantId={contestantId} userId={userId}  />
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: spacing.xl }}>
        {competitionName && (
          <p style={{
            fontSize: typography.fontSize.xs,
            color: colors.text.secondary,
            marginBottom: spacing.sm,
            fontWeight: typography.fontWeight.medium,
          }}>
            {competitionName}
          </p>
        )}
        <BonusVotesChecklist
          tasks={tasks}
          loading={loading}
          awarding={awarding}
          completedCount={completedCount}
          totalCount={totalCount}
          totalBonusVotesEarned={totalBonusVotesEarned}
          totalBonusVotesAvailable={totalBonusVotesAvailable}
          progress={progress}
          allCompleted={allCompleted}
          onTaskAction={handleTaskAction}
          collapsible
        >
          <VideoPromptsChecklist competitionId={competitionId} contestantId={contestantId} userId={userId}  />
        </BonusVotesChecklist>
      </div>
      {showGuide && (
        <Suspense fallback={null}>
          <ContestantGuide
            competition={null}
            mode="page"
            onClose={() => setShowGuide(false)}
            onComplete={handleGuideComplete}
          />
        </Suspense>
      )}
      <SubmitProofModal
        isOpen={!!proofTask}
        onClose={() => setProofTask(null)}
        task={proofTask}
        onSubmit={handleSubmitProof}
      />
      <SubmitVideoProofModal
        isOpen={!!videoTask}
        onClose={() => setVideoTask(null)}
        task={videoTask}
        onSubmit={handleSubmitProof}
      />
    </>
  );
}

/**
 * Renders the bonus votes checklist for a nominee (client-side evaluation).
 * Tasks are evaluated based on profile data — no contestant_id needed.
 * When converted to contestant, the real system auto-awards earned votes.
 */
function NomineeBonusVotes({ competitionId, competitionName, profile, userId, userEmail, onBonusVotesLoaded }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [showGuide, setShowGuide] = useState(false);
  const dismissKey = userId ? `bonus_dismissed_nominee_${userId}` : null;
  const [dismissed, setDismissed] = useState(() => {
    if (!dismissKey) return false;
    try { return localStorage.getItem(dismissKey) === 'true'; } catch { return false; }
  });

  // Load persisted action-task completions from DB (with localStorage fallback)
  const [actionCompleted, setActionCompleted] = useState({});
  const hasLoadedActions = useRef(false);

  useEffect(() => {
    if (!userId || hasLoadedActions.current) return;
    hasLoadedActions.current = true;
    loadNomineeBonusActions(userId, competitionId).then(actions => {
      setActionCompleted(actions || {});
    });
  }, [userId, competitionId]);

  const markActionCompleted = (taskKey) => {
    setActionCompleted(prev => ({ ...prev, [taskKey]: true }));
    if (userId) {
      saveNomineeBonusAction(userId, taskKey, competitionId);
    }
  };

  // Evaluate task completion from profile data + action tracking
  const tasks = useMemo(() => {
    const hasName = !!(profile?.first_name || profile?.firstName || profile?.name);
    const hasBio = !!(profile?.bio && profile.bio.length > 0);
    const hasCity = !!(profile?.city && profile.city.length > 0);
    const hasPhoto = !!(profile?.avatar_url || profile?.avatarUrl);
    const hasSocial = !!(profile?.instagram || profile?.twitter || profile?.tiktok || profile?.linkedin);

    return DEFAULT_BONUS_TASKS.map(task => {
      let completed = false;
      switch (task.task_key) {
        case 'complete_profile':
          completed = hasName && hasBio && hasCity;
          break;
        case 'add_photo':
          completed = hasPhoto;
          break;
        case 'add_social':
          completed = hasSocial;
          break;
        case 'view_how_to_win':
        case 'share_profile':
          completed = !!actionCompleted[task.task_key];
          break;
        default:
          completed = false;
      }
      return { ...task, id: task.task_key, completed };
    });
  }, [profile, actionCompleted]);

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const totalBonusVotesEarned = tasks.filter(t => t.completed).reduce((sum, t) => sum + t.votes_awarded, 0);
  const totalBonusVotesAvailable = tasks.reduce((sum, t) => sum + t.votes_awarded, 0);
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const allCompleted = totalCount > 0 && completedCount === totalCount;

  // Report bonus votes to parent
  useEffect(() => {
    if (onBonusVotesLoaded) {
      onBonusVotesLoaded({ totalEarned: totalBonusVotesEarned, totalAvailable: totalBonusVotesAvailable, allCompleted });
    }
  }, [totalBonusVotesEarned, totalBonusVotesAvailable, allCompleted, onBonusVotesLoaded]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    if (dismissKey) try { localStorage.setItem(dismissKey, 'true'); } catch { /* ignore */ }
  }, [dismissKey]);

  const handleGuideComplete = () => {
    setShowGuide(false);
    if (!actionCompleted[BONUS_TASK_KEYS.VIEW_HOW_TO_WIN]) {
      markActionCompleted(BONUS_TASK_KEYS.VIEW_HOW_TO_WIN);
      const task = DEFAULT_BONUS_TASKS.find(t => t.task_key === BONUS_TASK_KEYS.VIEW_HOW_TO_WIN);
      toast?.success?.(`+${task?.votes_awarded || 5} bonus votes for reviewing How to Win!`);
    }
  };

  const handleTaskAction = async (taskKey) => {
    if (taskKey === BONUS_TASK_KEYS.COMPLETE_PROFILE || taskKey === BONUS_TASK_KEYS.ADD_SOCIAL) {
      // Navigate to edit profile so user can fill in missing fields
      navigate('/profile?edit=true');
      return;
    } else if (taskKey === BONUS_TASK_KEYS.VIEW_HOW_TO_WIN) {
      setShowGuide(true);
    } else if (taskKey === BONUS_TASK_KEYS.SHARE_PROFILE) {
      // Award on engagement (sheet presented or link copied), not on OS
      // confirmation of a completed share — see shareProfileLink docs.
      const shareUrl = userId ? `${window.location.origin}/profile/${userId}` : window.location.href;
      const outcome = await shareProfileLink(shareUrl);
      if (outcome === 'failed') return;
      const copied = outcome === 'copied';
      if (!actionCompleted[BONUS_TASK_KEYS.SHARE_PROFILE]) {
        markActionCompleted(BONUS_TASK_KEYS.SHARE_PROFILE);
        const task = DEFAULT_BONUS_TASKS.find(t => t.task_key === BONUS_TASK_KEYS.SHARE_PROFILE);
        toast?.success?.(copied
          ? `Link copied! +${task?.votes_awarded || 5} bonus votes for sharing!`
          : `+${task?.votes_awarded || 5} bonus votes for sharing!`);
      } else {
        toast?.success?.(copied ? 'Profile link copied to clipboard!' : 'Profile link shared!');
      }
    }
  };

  // All tasks complete - just show video prompts
  if (allCompleted) {
    return (
      <div style={{ marginBottom: spacing.xl }}>
        <VideoPromptsChecklist  />
      </div>
    );
  }

  return (
    <>
      <div style={{ marginBottom: spacing.xl }}>
        {competitionName && (
          <p style={{
            fontSize: typography.fontSize.xs,
            color: colors.text.secondary,
            marginBottom: spacing.sm,
            fontWeight: typography.fontWeight.medium,
          }}>
            {competitionName}
          </p>
        )}
        <BonusVotesChecklist
          tasks={tasks}
          completedCount={completedCount}
          totalCount={totalCount}
          totalBonusVotesEarned={totalBonusVotesEarned}
          totalBonusVotesAvailable={totalBonusVotesAvailable}
          progress={progress}
          allCompleted={allCompleted}
          onTaskAction={handleTaskAction}
          collapsible
        >
          <VideoPromptsChecklist  />
        </BonusVotesChecklist>
      </div>
      {showGuide && (
        <Suspense fallback={null}>
          <ContestantGuide
            competition={null}
            mode="page"
            onClose={() => setShowGuide(false)}
            onComplete={handleGuideComplete}
          />
        </Suspense>
      )}
    </>
  );
}

/**
 * ProfileBonusVotes - Shows bonus votes checklists on the user's profile page
 * for any active competitions they're a contestant or nominee in.
 */
export default function ProfileBonusVotes({ userId, userEmail, profile, onBonusVotesLoaded }) {
  const [contestantEntries, setContestantEntries] = useState([]);
  const [nomineeEntries, setNomineeEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    Promise.all([
      getContestantCompetitions(userId),
      getNominationsForUser(userId, userEmail),
    ]).then(([contestants, nominations]) => {
      // Filter contestants: show for all non-completed competitions, and
      // skip eliminated contestants — they can no longer earn bonus votes,
      // so the checklist would be misleading (and any award attempt is
      // rejected server-side by award_bonus_votes anyway).
      const activeContestants = contestants.filter(entry => {
        const status = entry.competition?.status;
        if (!status || status === 'completed') return false;
        return entry.status !== 'eliminated';
      });

      // Filter nominations: non-completed competitions that DON'T already have a contestant entry
      const contestantCompIds = new Set(activeContestants.map(c => c.competition_id));
      const activeNominees = nominations.filter(nom => {
        const status = nom.competition?.status;
        return status && status !== 'completed' && !contestantCompIds.has(nom.competition?.id);
      });

      setContestantEntries(activeContestants);
      setNomineeEntries(activeNominees);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId, userEmail]);

  if (loading || (contestantEntries.length === 0 && nomineeEntries.length === 0)) return null;

  const totalEntries = contestantEntries.length + nomineeEntries.length;

  return (
    <div>
      {contestantEntries.map(entry => (
        <CompetitionBonusVotes
          key={entry.id}
          competitionId={entry.competition_id}
          contestantId={entry.id}
          userId={userId}
          userEmail={userEmail}
          competitionName={totalEntries > 1 ? entry.competition?.name : null}
          onBonusVotesLoaded={onBonusVotesLoaded}
        />
      ))}
      {nomineeEntries.map(nom => (
        <NomineeBonusVotes
          key={nom.id}
          competitionId={nom.competition?.id}
          competitionName={totalEntries > 1 ? nom.competition?.name : null}
          profile={profile}
          userId={userId}
          userEmail={userEmail}
          onBonusVotesLoaded={onBonusVotesLoaded}
        />
      ))}
    </div>
  );
}
