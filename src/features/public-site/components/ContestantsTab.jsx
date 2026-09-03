import React, { useState, useCallback, useMemo } from 'react';
import { Crown, Sparkles, LogIn, Award } from 'lucide-react';
import { Button, Badge } from '../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { formatNumber } from '../../../utils/formatters';
import { useCountdown } from '../../../hooks';
import { CONTESTANT_IMAGES } from '../../../constants';
import { transformSupabaseImage } from '../../../lib/storageImage';
import { sortContestantsByStanding } from '../../../utils/contestantRanking';

export default function ContestantsTab({ contestants, events, forceDoubleVoteDay, voteMultiplier, onVote, isAuthenticated = false, onLogin, isJudgingPhase = false, onViewProfile, currentRound }) {
  // Use currentRound end date if available, otherwise show no countdown
  const roundEndDate = currentRound?.endDate ? new Date(currentRound.endDate) : null;
  const timeLeft = useCountdown(roundEndDate);
  const hasActiveRound = currentRound?.isActive && roundEndDate;

  // After a round finalization, advancers' vote totals reset to bonus-vote
  // carry-over while eliminated rows keep their pre-reset totals. Without a
  // tier-aware sort, eliminated contestants would render above advancers in
  // the grid. Mirrors the host-dashboard pattern in useLeaderboard.js.
  const sortedContestants = React.useMemo(
    () => sortContestantsByStanding(contestants),
    [contestants],
  );

  const handleVoteClick = (contestant) => {
    if (isJudgingPhase) return;
    if (!hasActiveRound) return;
    if (contestant.status === 'eliminated') return;
    if (!isAuthenticated && onLogin) {
      onLogin();
    } else {
      onVote(contestant);
    }
  };

  const getTrendStyle = (trend) => ({
    width: '28px',
    height: '28px',
    borderRadius: borderRadius.sm,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.md,
    background: trend === 'up' ? 'rgba(34,197,94,0.9)' : trend === 'down' ? 'rgba(239,68,68,0.9)' : 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(8px)',
    color: '#fff',
    zIndex: 2,
  });

  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: spacing.xxxl }}>
        <h1 style={{ fontSize: typography.fontSize.hero, fontWeight: typography.fontWeight.bold, marginBottom: spacing.md }}>
          Meet the Contestants
        </h1>
        <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.lg, marginBottom: spacing.xxxl }}>
          {isJudgingPhase
            ? 'Voting has ended. Our judges are now evaluating the finalists!'
            : 'Vote for your favorite to help them advance to the finals'
          }
        </p>

        {/* Vote Boost Alert - only show during voting phase */}
        {forceDoubleVoteDay && !isJudgingPhase && (
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(251,191,36,0.1))',
              border: `2px solid rgba(212,175,55,0.4)`,
              borderRadius: borderRadius.xl,
              padding: `${spacing.lg} ${spacing.xxl}`,
              marginBottom: spacing.xxxl,
              maxWidth: '500px',
              margin: '0 auto 32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.md }}>
              <Sparkles size={24} style={{ color: colors.gold.primary }} />
              <div>
                <p style={{ color: colors.gold.primary, fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.xl }}>
                  {voteMultiplier > 2 ? `${voteMultiplier}× VOTE BOOST!` : 'DOUBLE VOTE DAY!'}
                </p>
                <p style={{ color: colors.text.light, fontSize: typography.fontSize.md }}>
                  Every vote counts {voteMultiplier > 2 ? `${voteMultiplier}× ` : 'twice '}today • $1 = {voteMultiplier} votes
                </p>
              </div>
              <Sparkles size={24} style={{ color: colors.gold.primary }} />
            </div>
          </div>
        )}

        {/* Show different content based on phase */}
        {isJudgingPhase ? (
          /* Judging in Progress Banner */
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05))',
              border: `1px solid rgba(59,130,246,0.3)`,
              borderRadius: borderRadius.xxl,
              padding: `${spacing.xxl} ${spacing.xxxl}`,
              maxWidth: '700px',
              margin: '0 auto',
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.md }}>
              <Award size={32} style={{ color: colors.status.info }} />
              <span
                style={{
                  color: colors.status.info,
                  fontSize: typography.fontSize.xl,
                  fontWeight: typography.fontWeight.bold,
                  textTransform: 'uppercase',
                  letterSpacing: '2px',
                }}
              >
                Judging in Progress
              </span>
            </div>
            <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.md }}>
              Our panel of judges is evaluating the finalists. Winners will be announced at the Finals Gala!
            </p>
          </div>
        ) : hasActiveRound ? (
          /* Compact Countdown Timer - only during active voting round */
          <div
            style={{
              background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(212,175,55,0.03))',
              border: `1px solid ${colors.border.gold}`,
              borderRadius: borderRadius.xl,
              padding: `${spacing.md} ${spacing.xl}`,
              maxWidth: '400px',
              margin: '0 auto',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <div
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: borderRadius.full,
                  background: colors.status.success,
                  boxShadow: '0 0 6px rgba(74,222,128,0.5)',
                }}
              />
              <span
                style={{
                  color: colors.gold.primary,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.medium,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                }}
              >
                {currentRound?.title || 'Voting'} Ends In
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', gap: spacing.md }}>
              {[
                { value: timeLeft.days, label: 'D' },
                { value: timeLeft.hours, label: 'H' },
                { value: timeLeft.minutes, label: 'M' },
                { value: timeLeft.seconds, label: 'S' },
              ].map((unit, idx) => (
                <div key={unit.label} style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
                  <span
                    style={{
                      fontSize: typography.fontSize.xl,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.gold.primary,
                      fontFamily: 'monospace',
                    }}
                  >
                    {String(unit.value).padStart(2, '0')}
                  </span>
                  <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>
                    {unit.label}
                  </span>
                  {idx < 3 && (
                    <span style={{ color: colors.text.muted, fontSize: typography.fontSize.md, marginLeft: spacing.xs }}>:</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* No active round - simple message */
          <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.base, textAlign: 'center' }}>
            {!isAuthenticated
              ? 'Sign in to vote for your favorite contestant!'
              : 'Vote now to help your favorite advance to the next round!'
            }
          </p>
        )}
      </div>

      {/* Contestant Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: spacing.xl }}>
        {sortedContestants.map((contestant, index) => {
          const isEliminated = contestant.status === 'eliminated';
          const isTop3 = !isEliminated && index < 3;
          return (
          <div
            key={contestant.id}
            onClick={() => { if (!isEliminated) onViewProfile?.(contestant); }}
            style={{
              background: colors.background.card,
              border: isTop3 ? `2px solid rgba(212,175,55,0.4)` : `1px solid ${colors.border.light}`,
              borderRadius: borderRadius.xxl,
              overflow: 'hidden',
              cursor: isEliminated ? 'default' : 'pointer',
              transition: 'all 0.3s',
              position: 'relative',
              opacity: isEliminated ? 0.55 : 1,
            }}
            onMouseEnter={(e) => {
              if (isEliminated) return;
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow = isTop3
                ? '0 12px 40px rgba(212,175,55,0.3)'
                : '0 8px 24px rgba(0,0,0,0.4)';
            }}
            onMouseLeave={(e) => {
              if (isEliminated) return;
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          >
            {/* Rank Badge - hidden for eliminated contestants */}
            {!isEliminated && (
              <div
                style={{
                  position: 'absolute',
                  top: spacing.md,
                  left: spacing.md,
                  width: '32px',
                  height: '32px',
                  borderRadius: borderRadius.md,
                  background:
                    index === 0
                      ? 'linear-gradient(135deg, #d4af37, #f4d03f)'
                      : index === 1
                        ? 'linear-gradient(135deg, #c0c0c0, #e8e8e8)'
                        : index === 2
                          ? 'linear-gradient(135deg, #cd7f32, #daa06d)'
                          : 'rgba(0,0,0,0.7)',
                  backdropFilter: 'blur(8px)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: typography.fontSize.md,
                  fontWeight: typography.fontWeight.bold,
                  color: isTop3 ? '#0a0a0f' : '#fff',
                  zIndex: 2,
                }}
              >
                {index + 1}
              </div>
            )}

            {/* Trend Badge - hidden for eliminated contestants */}
            {!isEliminated && (
              <div style={{ position: 'absolute', top: spacing.md, right: spacing.md, ...getTrendStyle(contestant.trend) }}>
                {contestant.trend === 'up' ? '↑' : contestant.trend === 'down' ? '↓' : '—'}
              </div>
            )}

            {/* Profile Image */}
            <ContestantImage
              src={contestant.avatarUrl || contestant.avatar_url || CONTESTANT_IMAGES[index] || CONTESTANT_IMAGES[0]}
              name={contestant.name}
              isEliminated={isEliminated}
            >
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: `${spacing.xxxl} ${spacing.lg} ${spacing.md}`,
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.95))',
                }}
              >
                <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, marginBottom: '2px', color: '#fff' }}>
                  {contestant.name}
                </h3>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: typography.fontSize.sm }}>
                  {contestant.age} • {contestant.occupation}
                </p>
              </div>
            </ContestantImage>

            {/* Card Footer */}
            <div
              style={{
                padding: `${spacing.md} ${spacing.lg}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: colors.background.cardHover,
              }}
            >
              {isEliminated ? (
                <div />
              ) : (
                <div>
                  <p style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: isTop3 ? colors.gold.primary : '#fff' }}>
                    {formatNumber(contestant.votes)}
                  </p>
                  <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Votes
                  </p>
                </div>
              )}
              {isEliminated ? (
                <Badge variant="secondary" size="md">
                  Eliminated
                </Badge>
              ) : isJudgingPhase ? (
                <Badge variant="info" size="md">
                  <Award size={12} /> Judging
                </Badge>
              ) : !hasActiveRound ? (
                <Badge variant="secondary" size="md">
                  No Active Round
                </Badge>
              ) : !isAuthenticated ? (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleVoteClick(contestant);
                  }}
                  size="md"
                  variant="secondary"
                >
                  <LogIn size={14} />
                  Sign In
                </Button>
              ) : (
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleVoteClick(contestant);
                  }}
                  size="md"
                >
                  Vote
                </Button>
              )}
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function ContestantImage({ src, name, children, isEliminated = false }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const handleError = useCallback(() => setImgFailed(true), []);
  const handleLoad = useCallback(() => setImgLoaded(true), []);

  // Optimize Supabase images: serve 400px wide for card display (covers 2x retina)
  const optimizedSrc = useMemo(() => {
    if (!src) return src;
    return transformSupabaseImage(src, { width: 400, quality: 80 });
  }, [src]);

  const initial = name?.split(' ').pop()?.charAt(0) || '?';

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '4/5',
        background: '#1a1a24',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Initials fallback - always rendered underneath */}
      {!imgLoaded && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '3rem',
          fontWeight: 700,
          color: 'rgba(255,255,255,0.15)',
        }}>
          {initial}
        </div>
      )}
      {src && !imgFailed && (
        <img
          src={optimizedSrc}
          alt={name}
          loading="lazy"
          decoding="async"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            opacity: imgLoaded ? 1 : 0,
            filter: isEliminated ? 'grayscale(1)' : 'none',
            transition: 'opacity 0.3s ease',
          }}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
      {children}
    </div>
  );
}
