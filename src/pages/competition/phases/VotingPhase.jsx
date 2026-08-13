import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { useAuthContextSafe } from '../../../contexts/AuthContext';
import { LeaderboardCompact } from '../components/LeaderboardCompact';
import { ActivityFeedCompact } from '../components/ActivityFeedCompact';
import { CountdownDisplay } from '../components/CountdownDisplay';
import { CompetitionHeader } from '../components/CompetitionHeader';
import { HostSection } from '../components/HostSection';
import { CharityHighlight } from '../components/CharityHighlight';
import { JudgesSection } from '../components/JudgesSection';
import { Timeline } from '../components/Timeline';
import ContestantBonusVotes from '../components/ContestantBonusVotes';

/**
 * Voting phase view (Round 1, Round 2, Resurrection, Finals)
 * Main competition view with leaderboard and activity
 */
export function VotingPhase() {
  const {
    phase,
    competition,
    contestants,
  } = usePublicCompetition();

  const { user } = useAuthContextSafe();

  // Determine phase-specific styling
  const isResurrection = phase?.phase === 'resurrection';
  const isFinals = phase?.phase === 'finals';

  // Check if current user is a contestant in this competition
  const currentContestant = user
    ? contestants?.find(c => c.user_id === user.id)
    : null;

  return (
    <div className={`phase-view phase-voting ${isResurrection ? 'phase-resurrection' : ''} ${isFinals ? 'phase-finals' : ''}`}>

      {/* Competition Header - Consistent across all phases */}
      <CompetitionHeader
        badge={phase?.label}
        badgeVariant="live"
        iconOnly
      />

      {/* Phase-specific banners */}
      {isResurrection && (
        <div className="resurrection-banner">
          <span>Eliminated contestants compete for 5 wildcard Finals spots</span>
        </div>
      )}

      {isFinals && (
        <div className="finals-banner">
          <span>The ranking round</span>
        </div>
      )}

      {/* Round Countdown - full width above the leaderboard */}
      <section className="voting-countdown-section">
        <CountdownDisplay label="Round ends in" large />
      </section>

      {/* Bonus Votes Checklist - shown to contestants */}
      {currentContestant && competition?.id && (
        <section className="phase-section">
          <ContestantBonusVotes
            competitionId={competition.id}
            contestantId={currentContestant.id}
            userId={user.id}
          />
        </section>
      )}

      {/* Leaderboard */}
      <section className="phase-section">
        <LeaderboardCompact />
      </section>

      {/* Activity Feed */}
      <section className="phase-section">
        <ActivityFeedCompact limit={5} />
      </section>

      {/* Charity partner */}
      <section className="phase-section">
        <CharityHighlight />
      </section>

      {/* Host */}
      <section className="phase-section">
        <HostSection />
      </section>

      {/* Judges */}
      <section className="phase-section">
        <JudgesSection />
      </section>

      {/* Rounds timeline — shown at the bottom of every phase so voters can
          always see the schedule (mirrors the nominations view). Self-hides
          when the host hasn't set any dates. */}
      <section className="phase-section">
        <Timeline />
      </section>
    </div>
  );
}

export default VotingPhase;
