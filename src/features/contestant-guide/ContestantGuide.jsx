import React, { useState, useMemo } from 'react';
import {
  Trophy,
  Vote,
  Users,
  Share2,
  Calendar,
  Star,
  TrendingUp,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  CheckCircle,
  Target,
  MessageCircle,
  Camera,
  Heart,
  Zap,
  Gift,
  Clock,
} from 'lucide-react';
import './ContestantGuide.css';

/**
 * ContestantGuide - Dynamic onboarding/learning center for contestants
 * 
 * Modes:
 * - splash: Post-entry welcome flow with step-through screens
 * - page: Full learning center accessible from profile dropdown
 * 
 * All content is dynamically generated based on competition configuration.
 */
export default function ContestantGuide({
  competition,
  votingRounds = [],
  about,
  phase,
  mode = 'splash', // 'splash' | 'page'
  onComplete,
  onClose,
}) {
  const [currentStep, setCurrentStep] = useState(0);

  // Generate dynamic content based on competition
  const content = useMemo(() => {
    return generateGuideContent({
      competition,
      votingRounds,
      about,
      phase,
    });
  }, [competition, votingRounds, about, phase]);

  const totalSteps = content.sections.length;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete?.();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onComplete?.();
  };

  // Splash mode - step-through screens
  if (mode === 'splash') {
    const section = content.sections[currentStep];
    const isLastStep = currentStep === totalSteps - 1;

    return (
      <div className="contestant-guide contestant-guide--splash">
        <div className="guide-splash-container">
          {/* Progress dots */}
          <div className="guide-progress">
            {content.sections.map((_, idx) => (
              <span
                key={idx}
                className={`guide-dot ${idx === currentStep ? 'active' : ''} ${idx < currentStep ? 'completed' : ''}`}
              />
            ))}
          </div>

          {/* Content */}
          <div className="guide-splash-content" key={currentStep}>
            <div className="guide-icon-wrap">
              {section.icon}
            </div>
            <h2 className="guide-title">{section.title}</h2>
            <p className="guide-subtitle">{section.subtitle}</p>
            
            <div className="guide-points">
              {section.points.map((point, idx) => {
                const isNested = typeof point === 'object' && point.subpoints;
                return (
                  <div key={idx}>
                    <div className="guide-point">
                      <CheckCircle size={18} className="guide-point-icon" />
                      <span>{isNested ? point.text : point}</span>
                    </div>
                    {isNested && (
                      <div className="guide-subpoints">
                        {point.subpoints.map((sub, sIdx) => (
                          <div key={sIdx} className="guide-subpoint">
                            <span className="guide-subpoint-dash">—</span>
                            <span>{sub}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {section.tip && (
              <div className="guide-tip">
                <Sparkles size={16} />
                <span>{section.tip}</span>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="guide-nav">
            {currentStep > 0 && (
              <button className="guide-nav-btn guide-nav-btn--back" onClick={handleBack}>
                <ArrowLeft size={18} />
                Back
              </button>
            )}
            <button className="guide-nav-btn guide-nav-btn--next" onClick={handleNext}>
              {isLastStep ? "Let's Go!" : 'Next'}
              {!isLastStep && <ArrowRight size={18} />}
            </button>
          </div>

          {/* Skip below nav */}
          <button className="guide-skip-btn guide-skip-btn--bottom" onClick={handleSkip}>
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // Page mode - full learning center
  return (
    <div className="contestant-guide contestant-guide--page">
      {onClose && (
        <button className="guide-close-btn" onClick={onClose}>
          <X size={24} />
        </button>
      )}

      <header className="guide-page-header">
        <div className="guide-page-icon">
          <Trophy size={32} />
        </div>
        <h1>{content.welcomeTitle}</h1>
        <p>{content.welcomeSubtitle}</p>
      </header>

      <div className="guide-sections">
        {content.sections.map((section, idx) => (
          <section key={idx} className="guide-section">
            <div className="guide-section-header">
              <div className="guide-section-icon">{section.icon}</div>
              <div>
                <h2>{section.title}</h2>
                <p>{section.subtitle}</p>
              </div>
            </div>

            <ul className="guide-section-list">
              {section.points.map((point, pIdx) => {
                const isNested = typeof point === 'object' && point.subpoints;
                return (
                  <li key={pIdx}>
                    <div className="guide-section-list-item">
                      <CheckCircle size={16} />
                      <span>{isNested ? point.text : point}</span>
                    </div>
                    {isNested && (
                      <ul className="guide-section-sublist">
                        {point.subpoints.map((sub, sIdx) => (
                          <li key={sIdx}>{sub}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>

            {section.tip && (
              <div className="guide-section-tip">
                <Sparkles size={16} />
                <span>{section.tip}</span>
              </div>
            )}
          </section>
        ))}
      </div>

      {/* Quick reference card */}
      <div className="guide-quick-ref">
        <h3>Quick Reference</h3>
        <div className="guide-quick-grid">
          {content.quickFacts.map((fact, idx) => (
            <div key={idx} className="guide-quick-item">
              {fact.icon}
              <span className="guide-quick-label">{fact.label}</span>
              <span className="guide-quick-value">{fact.value}</span>
            </div>
          ))}
        </div>
      </div>

      {onComplete && (
        <button className="guide-done-btn" onClick={onComplete}>
          Got It!
        </button>
      )}
    </div>
  );
}

/**
 * Derive the crown/title brand shown in the guide.
 *
 * The platform is "Most Eligible {city}" branded by default, but other series
 * (e.g. "Who's Who") run on the same component. We take the brand portion of
 * the competition name — everything before a ":" subtitle and minus a trailing
 * season year — then append the city when it isn't already part of the brand:
 *   "Who's Who: Singles Edition" + Toronto  -> "Who's Who Toronto"
 *   "Most Eligible Toronto 2026"             -> "Most Eligible Toronto"
 *   "Most Eligible" (city stored separately) -> "Most Eligible Toronto"
 */
function deriveCrownTitle(competition, cityName) {
  const brand = (competition?.name || '')
    .split(':')[0]
    .replace(/\s+\d{4}\s*$/, '')
    .trim();
  if (!brand) return `Most Eligible ${cityName}`.trim();
  if (cityName && !brand.toLowerCase().includes(String(cityName).toLowerCase())) {
    return `${brand} ${cityName}`;
  }
  return brand;
}

/**
 * Generate dynamic guide content based on competition configuration
 */
function generateGuideContent({ competition, votingRounds = [], about, phase }) {
  const competitionName = competition?.name || 'the competition';
  const cityName = (competition?.city?.name || competition?.city || 'your city');
  const pricePerVote = competition?.price_per_vote || 1;
  // Default winners to 1 to match the Official Rules generator (which also
  // defaults to one) so an under-configured competition can't show "Top 5"
  // here while the rules say "one winner".
  const numWinners = competition?.number_of_winners || 1;
  const splitByGender = competition?.winners_split_by_gender;
  const selectionCriteria = competition?.selection_criteria || 'votes';
  const isJudgesOnly = selectionCriteria === 'judges';
  const crownTitle = deriveCrownTitle(competition, cityName);

  // Count rounds from actual data
  const rounds = votingRounds || [];
  const votingOnlyRounds = rounds.filter(r => r.round_type === 'voting');
  // Use voting-type rounds if they exist, otherwise count all non-judging rounds
  const votingRoundCount = votingOnlyRounds.length || rounds.filter(r => r.round_type !== 'judging').length || rounds.length;
  const hasResurrection = rounds.some(r =>
    r.round_type === 'resurrection' || r.title?.toLowerCase().includes('resurrection')
  );

  // Determine what phase we're in for context
  const isVotingPhase = phase?.isVoting;
  const isNominationPhase = phase?.phase === 'nominations';

  const sorted = [...rounds].sort((a, b) => (a.round_order || 0) - (b.round_order || 0));

  // Judge weighting — read it the SAME way the Official Rules do, from the
  // rounds (voting_rounds.judge_weight), so the guide can't say "votes decide"
  // while the rules say "judges decide 60%". Fall back to the competition-level
  // judges_score_weight_pct column only when no round carries a weight.
  const judgedRounds = sorted.filter((r) => (r.judge_weight || 0) > 0);
  const maxJudgeWeight = judgedRounds.length
    ? Math.max(...judgedRounds.map((r) => r.judge_weight || 0))
    : null;
  const judgesPct = isJudgesOnly
    ? 100
    : (maxJudgeWeight ?? (competition?.judges_score_weight_pct ?? null));
  const votesPct = judgesPct != null ? 100 - judgesPct : null;
  const hasJudging = isJudgesOnly || (judgesPct != null && judgesPct > 0);
  // Votes reset each round unless every round is configured to accumulate.
  const votesAccumulate = sorted.length > 0 && sorted.every((r) => r.votes_accumulate);

  const advanceBasis = isJudgesOnly
    ? 'based on the judges’ scores'
    : hasJudging
      ? 'based on the round’s scoring (public votes plus judges’ scores where judges score that round)'
      : 'based on vote count';
  const resetClause = votesAccumulate ? '' : ', and votes reset at the start of every round';
  const howItWorksPoints = [
    `The competition runs across ${sorted.length} rounds`,
    `A set number of contestants advances each round ${advanceBasis}${resetClause}`,
  ];

  // Final round: the number of finalists who reach it is the prior round's
  // advancement count (e.g. 24), optionally split by gender. The vote/judge
  // weighting (when judges score) decides the winners.
  const finalists = sorted.length >= 2 ? sorted[sorted.length - 2]?.contestants_advance : null;
  if (finalists) {
    const perGender = Math.ceil(finalists / 2);
    const genderBreakdown = splitByGender ? ` (${perGender} males and ${perGender} females)` : '';
    const scoring = isJudgesOnly
      ? 'the judges’ scores determine'
      : (judgesPct != null && judgesPct > 0)
        ? `public votes (${votesPct}%) and judge scores (${judgesPct}%) determine`
        : 'the final vote count determines';
    const winnerLabel = splitByGender && numWinners === 2
      ? 'the 2 ultimate winners'
      : `the ${numWinners} winners`;
    howItWorksPoints.push(
      `The final round will be comprised of the Top ${finalists} contestants${genderBreakdown}, ${scoring} ${winnerLabel}`
    );
  }

  const crownWinnerLabel = splitByGender && numWinners === 2
    ? '2 winners (1 male, 1 female)'
    : `${numWinners} contestants`;
  howItWorksPoints.push(
    `The ${crownWinnerLabel} will be crowned ${crownTitle}, hold the title for one year and receive the prize package`
  );

  // Prize bullets — year-long title + the sponsor prize package.
  const prizeWinnersLabel = splitByGender && numWinners === 2 ? '2 winners (1 male, 1 female)' : `${numWinners} winners`;
  const prizeWinnersCount = splitByGender && numWinners === 2 ? '2' : `${numWinners}`;
  const prizePoolPoints = [
    `${prizeWinnersLabel} earn the year-long title of ${crownTitle}`,
    `The ${prizeWinnersCount} winners receive a prize package from competition sponsors`,
  ];

  // Tips are audience-specific: a judges-only competition has no voters to
  // rally, so the vote-centric tips would mislead.
  const tipsPoints = isJudgesOnly
    ? [
        'Complete your profile with a great photo and bio — the judges review it',
        'Showcase the qualities the judges are scoring',
        'Be active and keep your profile current',
        'Tell your story clearly and authentically',
      ]
    : [
        'Complete your profile with a great photo and bio',
        'Be active — post updates, engage with voters',
        'Create a sense of urgency near round deadlines',
        "Thank your voters publicly — they'll keep coming back",
        'Watch the leaderboard and push harder when you need to',
      ];

  const sections = [
    // How It Works
    {
      icon: <Trophy size={48} className="guide-icon guide-icon--gold" />,
      title: 'How It Works',
      subtitle: `Here's how ${competitionName} works`,
      points: howItWorksPoints,
      tip: isJudgesOnly
        ? 'Put your best foot forward — the judges decide the winners.'
        : 'The more votes you get, the higher you rank!',
    },

    // Voting + How to Get Votes — only when the public actually votes. A
    // purely judge-based competition has no public voting, so these are dropped
    // entirely (mirroring how the Official Rules omit the Voting section).
    ...(isJudgesOnly
      ? []
      : [
          {
            icon: <Vote size={48} className="guide-icon guide-icon--pink" />,
            title: 'Voting',
            subtitle: 'Understanding votes is key to winning',
            points: [
              'Fans can vote once daily for free, or purchase additional votes',
              'Free votes reset at midnight (local time)',
              `Additional votes can be purchased ($${pricePerVote.toFixed(2)} each)`,
              'Paid votes count immediately and never expire',
              votesAccumulate
                ? 'Your vote total carries over between rounds'
                : 'Vote counts reset to zero at the start of each new round',
              'Keep an eye out for surprise Double Vote Days — when they hit, every vote counts twice',
            ],
            tip: 'Remind your supporters to vote daily — those free votes add up fast!',
          },
          {
            icon: <Share2 size={48} className="guide-icon guide-icon--blue" />,
            title: 'How to Get Votes',
            subtitle: 'Rally your network to climb the leaderboard',
            points: [
              'Share your profile link on social media (Instagram, TikTok, etc.)',
              'Ask friends and family to vote daily',
              'Post stories and remind people when voting rounds start',
              'Engage with the community — voters support active contestants',
              'Use your shareable card to stand out',
            ],
            tip: 'Contestants who share consistently get 3-5x more votes on average!',
          },
        ]),

    // Tips for Success
    {
      icon: <Star size={48} className="guide-icon guide-icon--purple" />,
      title: 'Tips for Success',
      subtitle: 'What winning contestants do differently',
      points: tipsPoints,
      tip: isJudgesOnly
        ? 'Put your best work forward — quality is everything to the judges.'
        : "Don't wait until the last day — steady daily votes beat last-minute pushes!",
    },

    // Prizes
    {
      icon: <Gift size={48} className="guide-icon guide-icon--green" />,
      title: 'Prizes',
      subtitle: 'Real prizes. Real bragging rights.',
      points: prizePoolPoints,
    },
  ];

  // Quick facts for page mode. Vote-specific facts are dropped for a purely
  // judge-based competition (no public voting), and the goal reflects judging.
  const quickFacts = [
    ...(isJudgesOnly
      ? []
      : [
          {
            icon: <Clock size={20} />,
            label: 'Free Votes',
            value: '1/day per person',
          },
          {
            icon: <Vote size={20} />,
            label: 'Vote Price',
            value: `$${pricePerVote.toFixed(2)}`,
          },
        ]),
    {
      icon: <TrendingUp size={20} />,
      label: 'Rounds',
      value: `${sorted.length} rounds`,
    },
    {
      icon: <Trophy size={20} />,
      label: 'Winners',
      value: `Top ${numWinners}`,
    },
    {
      icon: <Target size={20} />,
      label: 'Goal',
      value: isJudgesOnly ? 'Impress the judges!' : 'Get the most votes!',
    },
  ];

  return {
    welcomeTitle: `How to Win ${competitionName}`,
    welcomeSubtitle: `Everything you need to know to compete and win in ${cityName}`,
    sections,
    quickFacts,
  };
}
