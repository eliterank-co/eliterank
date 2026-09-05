import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { Trophy, User } from 'lucide-react';
import EliteRankCrown from '../../../components/ui/icons/EliteRankCrown';
import { transformSupabaseImage } from '../../../lib/storageImage';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { useResponsive } from '../../../hooks/useResponsive';

// 1 -> "1st", 2 -> "2nd", etc.
function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Gender-split winners are co-equal division champions, labeled by division
// rather than ranked. Matches the "Men" / "Women" columns on the leaderboard.
function divisionLabel(gender) {
  if (gender === 'male') return "Men's Winner";
  if (gender === 'female') return "Women's Winner";
  return null;
}

/**
 * Winners podium for results phase
 * Single-winner competitions: large spotlight on the champion
 * Multi-winner / legacy competitions: premium card grid of ranked winners
 */
export function WinnersPodium({
  competition: propCompetition,
  contestants: propContestants,
  topThree: propTopThree,
  openContestantProfile: propOpenProfile,
  placementLabels: propPlacementLabels,
} = {}) {
  const context = usePublicCompetition() || {};
  const competition = propCompetition || context.competition;
  const contestants = propContestants || context.contestants;
  const topThree = propTopThree || context.topThree;
  const openContestantProfile = propOpenProfile || context.openContestantProfile;
  const placementLabels = propPlacementLabels || competition?.winner_placement_labels;
  const navigate = useNavigate();
  const location = useLocation();

  // Clicking a contestant card navigates to their shareable public profile.
  // Preserve ?preview= so phase previews carry through to the profile.
  const handleContestantClick = useCallback((contestant) => {
    if (contestant.user_id) {
      navigate(`/profile/${contestant.user_id}${location.search || ''}`);
    } else {
      openContestantProfile?.(contestant);
    }
  }, [openContestantProfile, navigate, location.search]);

  const isLegacy = competition?.is_legacy;

  if (isLegacy) {
    const sorted = [...(contestants || [])].sort((a, b) => (a.rank || 999) - (b.rank || 999)).slice(0, 20);
    if (!sorted.length) return null;
    // Prefer the competition's configured season; fall back to slug/name
    // parsing only if it isn't set. Avoids the "SEASON 2025" + "2026
    // Winners" mismatch when the slug happens to contain a different year.
    const nameYearMatch = (competition?.name || competition?.slug || '').match(/20\d{2}/);
    const year = competition?.season
      ?? (nameYearMatch
        ? nameYearMatch[0]
        : competition?.nomination_end
          ? new Date(competition.nomination_end).getFullYear()
          : competition?.created_at
            ? new Date(competition.created_at).getFullYear()
            : null);
    return <WinnersGrid winners={sorted} onSelect={handleContestantClick} year={year} city={competition?.city} />;
  }

  // Multi-winner competitions (e.g. a Top 5) showcase every crowned winner in
  // the ranked grid; classic winner-take-all competitions keep the single
  // champion spotlight. The authoritative winner set + order comes from
  // competitions.winners (written by finalize_voting_round); we fall back to
  // the top-ranked contestants when that array isn't populated yet (e.g. a host
  // previewing the results phase before the finale closes).
  const numberOfWinners = competition?.number_of_winners || 1;
  // When winners are split by gender the crowned set is one champion per
  // gender (CEIL(number_of_winners / 2) each) — co-equal division winners,
  // not a 1st/2nd ranking. finalize_voting_round writes both at within-gender
  // rank 1, so competitions.winners has no meaningful order between them; we
  // impose a stable men-then-women order and label by division instead of
  // stamping ordinals.
  const splitByGender = !!competition?.winners_split_by_gender;
  const genderOrder = (g) => (g === 'male' ? 0 : g === 'female' ? 1 : 2);
  const byId = new Map((contestants || []).map((c) => [c.id, c]));
  const winnerIds = Array.isArray(competition?.winners) ? competition.winners : [];
  let winners = winnerIds.map((id) => byId.get(id)).filter(Boolean);
  if (!winners.length) {
    // Preview fallback before the decider closes: mirror the per-gender split
    // so the podium previews one leader per gender, matching the leaderboard.
    const crowned = (contestants || []).filter((c) => c.status === 'winner');
    const pool = crowned.length ? crowned : (contestants || []);
    if (splitByGender) {
      const perGender = Math.ceil(numberOfWinners / 2);
      const take = (g) => pool.filter((c) => c.gender === g).slice(0, perGender);
      winners = [...take('male'), ...take('female')];
      if (!winners.length) winners = pool.slice(0, numberOfWinners);
    } else {
      winners = pool.slice(0, numberOfWinners);
    }
  }
  if (splitByGender && winners.length > 1) {
    winners = [...winners].sort((a, b) => genderOrder(a.gender) - genderOrder(b.gender));
  }

  if (numberOfWinners > 1 && winners.length > 1) {
    return (
      <WinnersGrid
        winners={winners}
        onSelect={handleContestantClick}
        year={competition?.season}
        city={competition?.city}
        splitByGender={splitByGender}
        placementLabels={placementLabels}
      />
    );
  }

  // Winner takes all — show only 1st place
  const winner = winners[0] || topThree?.[0];
  if (!winner) return null;

  return (
    <div className="winners-podium">
      <div className="podium-header">
        <Trophy size={32} className="podium-trophy" />
        <h2>Winner</h2>
      </div>

      <div className="podium-display">
        <div
          key={winner.id}
          className="podium-winner podium-winner-1 first-place"
          onClick={() => handleContestantClick(winner)}
        >
          <div className="winner-place">
            <EliteRankCrown size={32} />
            <span>{placementLabels?.[0] || 'Champion'}</span>
          </div>

          <div className="winner-avatar winner-avatar-large">
            {winner.avatar_url ? (
              <img src={transformSupabaseImage(winner.avatar_url, { width: 300, height: 300 })} alt={winner.name} />
            ) : (
              <span>{winner.name?.charAt(0)}</span>
            )}
          </div>

          <div className="winner-name">{winner.name}</div>

          <div className="winner-stats">
            <span className="winner-votes">{winner.votes?.toLocaleString()} votes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Premium portrait-card grid for multi-winner (and legacy) competitions.
 * Mirrors the Hall of Winners showcase: full-bleed photo cards with a gold
 * ordinal rank badge (1st–5th) and the winner's name over a gradient.
 */
export function WinnersGrid({
  winners,
  onSelect,
  year,
  city,
  splitByGender = false,
  placementLabels = null,
}) {
  const { isMobile } = useResponsive();
  const subtitle = [city, year].filter(Boolean).join(' • ');

  return (
    <section style={styles.section}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Winners</h2>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
      </div>

      {/* Winners Grid - portrait photo cards */}
      <div style={styles.grid}>
        {winners.map((contestant, index) => {
          const placementLabel =
            !splitByGender && Array.isArray(placementLabels) && placementLabels[index]
              ? placementLabels[index]
              : null;

          return (
            <div
              key={contestant.id}
              onClick={() => onSelect?.(contestant)}
              style={{
                ...styles.card,
                width: isMobile ? 'calc(46% - 8px)' : 'calc(20% - 10px)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.55)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.25)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Photo fills the card */}
              {contestant.avatar_url ? (
                <img
                  src={transformSupabaseImage(contestant.avatar_url, { width: 400, height: 533 })}
                  alt={contestant.name}
                  style={styles.photo}
                />
              ) : (
                <div style={styles.photoPlaceholder}>
                  <User size={32} style={{ color: colors.text.muted }} />
                </div>
              )}

              {/* Badge: a crown for gender-split winners (co-equal division
                  champions), a placement label badge if configured, or ordinal rank badge otherwise. */}
              <div
                style={{
                  ...styles.rankBadge,
                  ...(placementLabel ? styles.placementBadge : {}),
                  ...(placementLabel && placementLabel.length > 20
                    ? {
                        top: '6px',
                        left: '6px',
                        maxWidth: 'calc(100% - 12px)',
                        padding: '2px 4px',
                        minHeight: '26px',
                      }
                    : {}),
                }}
              >
                {splitByGender ? (
                  <EliteRankCrown size={18} />
                ) : (
                  <span
                    style={{
                      ...styles.rankText,
                      ...(placementLabel && placementLabel.length > 20
                        ? {
                            fontSize: placementLabel.length > 35 ? '9.5px' : '10.5px',
                            lineHeight: 1.1,
                            letterSpacing: '-0.01em',
                          }
                        : placementLabel && placementLabel.length > 10
                        ? { fontSize: typography.fontSize.xs }
                        : {}),
                    }}
                  >
                    {placementLabel || ordinal(index + 1)}
                  </span>
                )}
              </div>

              {/* Name on a gradient background for legibility. Split winners get
                  a gold division label above the name in place of a rank. Configured
                  placement titles are also surfaced above the name. */}
              <div
                style={{
                  ...styles.nameOverlay,
                  ...(placementLabel && placementLabel.length > 20
                    ? {
                        padding: `10px ${spacing.xs} 4px`,
                      }
                    : {}),
                }}
              >
                {splitByGender && divisionLabel(contestant.gender) && (
                  <p style={styles.division}>{divisionLabel(contestant.gender)}</p>
                )}
                {!splitByGender && placementLabel && (
                  <p
                    style={{
                      ...styles.division,
                      ...(placementLabel.length > 20
                        ? {
                            fontSize: placementLabel.length > 35 ? '9.5px' : '10.5px',
                            lineHeight: 1.15,
                            letterSpacing: '0.02em',
                            margin: '0 0 2px',
                          }
                        : {}),
                    }}
                  >
                    {placementLabel}
                  </p>
                )}
                <p style={styles.name}>{contestant.name}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

const styles = {
  section: {
    maxWidth: '760px',
    margin: '0 auto',
    marginBottom: spacing.xxxl,
    padding: `0 ${spacing.lg} ${spacing.lg}`,
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    margin: 0,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gold.primary,
    margin: 0,
    textAlign: 'center',
    letterSpacing: '0.04em',
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  card: {
    aspectRatio: '3 / 4',
    display: 'block',
    position: 'relative',
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
    background: colors.background.elevated,
    border: '1px solid rgba(212, 175, 55, 0.25)',
    cursor: 'pointer',
    transition: 'border-color 0.2s ease, transform 0.2s ease',
  },
  photo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    minWidth: '36px',
    maxWidth: 'calc(100% - 16px)',
    minHeight: '36px',
    height: 'auto',
    padding: `4px ${spacing.sm}`,
    flexShrink: 0,
    borderRadius: borderRadius.full,
    background: 'rgba(0, 0, 0, 0.75)',
    border: `1px solid ${colors.gold.primary}`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    zIndex: 2,
  },
  placementBadge: {
    padding: `4px ${spacing.sm}`,
    borderRadius: '18px',
  },
  rankText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.gold.primary,
    lineHeight: 1.15,
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    textAlign: 'center',
    maxWidth: '100%',
  },
  nameOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: `${spacing.lg} ${spacing.xs} ${spacing.sm}`,
    background: 'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.5) 55%, rgba(0, 0, 0, 0) 100%)',
    textAlign: 'center',
    boxSizing: 'border-box',
  },
  name: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    margin: 0,
    lineHeight: 1.2,
  },
  division: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.gold.primary,
    margin: '0 0 2px',
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    hyphens: 'auto',
    lineHeight: 1.25,
    maxWidth: '100%',
  },
};

export default WinnersPodium;
