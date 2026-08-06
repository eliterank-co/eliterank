import { useEffect, useRef, useState, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBonusVotes } from '../../../hooks/useBonusVotes';
import { useAuthContextSafe } from '../../../contexts/AuthContext';
import BonusVotesChecklist from '../../../components/BonusVotesChecklist';
import SubmitProofModal from '../../../components/modals/SubmitProofModal';
import SubmitVideoProofModal from '../../../components/modals/SubmitVideoProofModal';
import { useToast } from '../../../contexts/ToastContext';
import { BONUS_TASK_KEYS, awardNomineeActionBonuses } from '../../../lib/bonusVotes';
import { shareProfileLink } from '../../../features/entry/utils/shareUtils';

const ContestantGuide = lazy(() => import('../../../features/contestant-guide/ContestantGuide'));

/**
 * ContestantBonusVotes - Wraps the BonusVotesChecklist for the public competition page.
 * Automatically checks profile completeness on mount and awards applicable bonuses.
 */
export default function ContestantBonusVotes({ competitionId, contestantId, userId }) {
  const navigate = useNavigate();
  const { profile } = useAuthContextSafe();
  const toast = useToast();
  const hasCheckedProfile = useRef(false);
  const [showGuide, setShowGuide] = useState(false);

  const [proofTask, setProofTask] = useState(null);
  const [videoTask, setVideoTask] = useState(null);
  const bonusVotes = useBonusVotes(competitionId, contestantId, userId);

  const {
    tasks,
    loading,
    awarding,
    completedCount,
    totalCount,
    totalBonusVotesEarned,
    totalBonusVotesAvailable,
    progress,
    allCompleted,
    checkProfile,
    markHowToWinViewed,
    markProfileShared,
    awardTask,
    submitProof,
  } = bonusVotes;

  // Auto-check profile on mount to award any profile-related bonuses
  useEffect(() => {
    if (!loading && profile && !hasCheckedProfile.current && tasks.length > 0) {
      hasCheckedProfile.current = true;
      checkProfile(profile).then((awarded) => {
        if (awarded.length > 0) {
          const totalVotes = awarded.reduce((sum, a) => sum + (a.votes_awarded || 0), 0);
          toast?.success?.(`You earned ${totalVotes} bonus votes!`);
        }
      });
    }
  }, [loading, profile, tasks.length, checkProfile, toast]);

  // Auto-award action-based tasks completed during nominee phase
  const hasCheckedNomineeActions = useRef(false);
  useEffect(() => {
    if (!loading && tasks.length > 0 && userId && competitionId && contestantId && !hasCheckedNomineeActions.current) {
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

  // Listen for the "profile-updated" event to re-check bonuses
  useEffect(() => {
    const handler = () => {
      hasCheckedProfile.current = false;
    };
    window.addEventListener('profile-updated', handler);
    return () => window.removeEventListener('profile-updated', handler);
  }, []);

  const handleGuideComplete = async () => {
    setShowGuide(false);
    const result = await markHowToWinViewed();
    if (result?.success) {
      toast?.success?.(`+${result.votes_awarded} bonus votes for reviewing How to Win!`);
    }
  };

  // Handle proof submission for custom tasks
  const handleSubmitProof = async (taskId, proofUrl) => {
    const result = await submitProof(taskId, proofUrl);
    if (result?.success) {
      toast?.success?.('Proof submitted! Waiting for host approval.');
    }
  };

  // Handle task actions (e.g., clicking "view how to win" or "share profile")
  const handleTaskAction = async (taskKey, task) => {
    // Host-managed tasks cannot be actioned by contestants
    if (task?.host_managed) return;

    // Intro video task uses the video-specific modal
    if (task?.task_key === BONUS_TASK_KEYS.INTRO_VIDEO) {
      setVideoTask(task);
      return;
    }

    // Other approval-based tasks open the image proof modal
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
      const outcome = await shareProfileLink(window.location.href, { title: 'Vote for me!' });
      if (outcome === 'failed') return;
      if (outcome === 'copied') toast?.success?.('Profile link copied to clipboard!');
      const result = await markProfileShared();
      if (result?.success) {
        toast?.success?.(`+${result.votes_awarded} bonus votes for sharing!`);
      }
    } else {
      // For profile-related tasks, just show a hint
      const result = await awardTask(taskKey);
      if (result?.success) {
        toast?.success?.(`+${result.votes_awarded} bonus votes!`);
      }
    }
  };

  if (loading || tasks.length === 0) return null;

  return (
    <>
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
      />
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
