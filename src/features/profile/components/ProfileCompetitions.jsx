import React, { useState, useEffect, useMemo } from 'react';
import { Trophy, Crown, Award, ArrowRight, ChevronRight, Clock, Mic, Heart } from 'lucide-react';
import { Panel, Badge, Button, EliteRankCrown, OrganizationLogo } from '../../../components/ui';
import { colors, spacing, borderRadius, typography, styleHelpers } from '../../../styles/theme';
import { getHostedCompetitions, getContestantCompetitions, getNominationsForUser } from '../../../lib/competition-history';
import { getOrgLogo } from '../../../lib/storageImage';

import { useResponsive } from '../../../hooks/useResponsive';
import { useLeaderboard } from '../../../hooks';
import useCountdown from '../../../hooks/useCountdown';
import AcceptNominationModal from '../../../components/modals/AcceptNominationModal';
import { generateCompetitionSlug, getCompetitionUrl, slugify } from '../../../utils/slugs';
import { getRoundLabel } from '../../../utils/roundLabels';
import { getCityImage } from '../../../utils/cityImages';
import { getPhaseDisplayConfig, computeCompetitionPhase } from '../../../utils/competitionPhase';
import CompetitionCardVoting from './CompetitionCardVoting';

// Display order for the compact competition cards: active voting first, then
// nominations / coming soon, then completed last. Lower rank renders earlier
// (left). Phases not listed fall in the middle, ahead of completed/hidden.
const PHASE_CARD_ORDER = {
  voting: 0,
  judging: 1,
  between: 2,
  nomination: 3,
  publish: 4, // "Coming Soon" teaser
  completed: 6,
  draft: 7,
  archive: 8,
};

function phaseCardRank(competition) {
  const phase = computeCompetitionPhase(competition);
  return PHASE_CARD_ORDER[phase] ?? 5;
}

// Round types that collect public votes. The finale is votable too — the
// winner is ranked by votes during the finale (see finalize_voting_round),
// so the inline panel must stay open through it. Judging / resurrection
// rounds are not publicly votable. A null round_type is legacy "voting".
const VOTABLE_ROUND_TYPES = ['voting', 'finale'];

function isVotableRound(round) {
  return !round?.round_type || VOTABLE_ROUND_TYPES.includes(round.round_type);
}

/**
 * Given a competition with a voting_rounds join, return the currently active
 * votable round (one whose [start_date, end_date) window contains `now`).
 * Returns null if no active round.
 */
function findActiveVotingRound(competition) {
  const rounds = competition?.voting_rounds || [];
  if (!rounds.length) return null;
  const now = Date.now();
  const active = rounds.find((r) => {
    if (!isVotableRound(r)) return false;
    const start = r.start_date ? new Date(r.start_date).getTime() : null;
    const end = r.end_date ? new Date(r.end_date).getTime() : null;
    return start && end && now >= start && now < end;
  });
  return active || null;
}

/**
 * In preview mode, synthesize a plausible active round so the inline voting
 * panel renders even when the real voting window hasn't opened. Real
 * mutations are blocked downstream by the isPreview flag — this exists only
 * to drive the UI.
 */
function synthesizePreviewRound(competition) {
  const rounds = competition?.voting_rounds || [];
  const sorted = [...rounds]
    .filter(isVotableRound)
    .sort((a, b) => (a.round_order || 0) - (b.round_order || 0));
  const first = sorted[0];
  return {
    id: first?.id || 'preview-round',
    round_order: first?.round_order || 1,
    round_type: 'voting',
    start_date: first?.start_date || null,
    end_date: first?.end_date || null,
    isActive: true,
  };
}

function getCompetitionLink(competition) {
  const orgSlug = competition?.organization?.slug || 'most-eligible';
  if (competition?.slug) {
    return getCompetitionUrl(orgSlug, competition.slug);
  }
  if (competition?.id) {
    return `/${orgSlug}/id/${competition.id}`;
  }
  const cityName = competition?.city?.name || competition?.city || '';
  const generatedSlug = generateCompetitionSlug({
    name: competition?.name,
    citySlug: slugify(cityName),
    season: competition?.season || '',
  });
  return getCompetitionUrl(orgSlug, generatedSlug);
}

function StatBox({ label, value, suffix, icon, accent = false, isMobile = false }) {
  return (
    <div style={{
      // Tighter padding on mobile so the 3-across grid doesn't crush the
      // content (the "ROUND ENDS" label was being truncated to "ROUND ...").
      padding: isMobile ? `${spacing.sm} ${spacing.sm}` : spacing.md,
      background: accent ? 'rgba(212,175,55,0.06)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${accent ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: borderRadius.md,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      textAlign: 'center',
      gap: '2px',
      minWidth: 0,
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // Tight gap for the accent box so "Round ends" + clock icon
        // stays on one line at narrow widths.
        gap: accent ? '3px' : spacing.xs,
        // Accent label is rendered a shade smaller with tighter tracking
        // so "ROUND ENDS" fits on a single line on ~390px viewports.
        fontSize: accent ? '11px' : typography.fontSize.xs,
        fontWeight: typography.fontWeight.semibold,
        letterSpacing: accent ? '0.03em' : '0.06em',
        textTransform: 'uppercase',
        color: accent ? colors.gold.primary : colors.text.muted,
        minWidth: 0,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}>
        {icon}
        <span style={{ minWidth: 0 }}>
          {label}
        </span>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'center',
        gap: spacing.xs,
        lineHeight: 1,
      }}>
        <span style={{
          fontSize: typography.fontSize.xl,
          fontWeight: typography.fontWeight.bold,
          color: accent ? colors.gold.primary : colors.text.primary,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </span>
        {suffix && (
          <span style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.muted,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

// Each role maps to an icon + a Badge variant. The host gets a mic (they
// run / emcee the competition); nominee = award, winner = trophy, and
// contestants keep the crown.
const ROLE_BADGE_CONFIG = {
  nominee: { icon: Award, variant: 'gold', label: 'Nominee' },
  host: { icon: Mic, variant: 'purple', label: 'Host' },
  winner: { icon: Trophy, variant: 'gold', label: 'Winner' },
  contestant: { icon: Crown, variant: 'success', label: 'Contestant' },
  // Framed as an achievement, not a loss — the label shows the tier the
  // contestant reached (e.g. "Top 25 Contestant", "Entry Round") instead of
  // calling out their elimination.
  eliminated: { icon: Crown, variant: 'gold', label: 'Contestant' },
};

function RoleBadge({ role, size = 'sm', subLabel, contestantLabel }) {
  const config = ROLE_BADGE_CONFIG[role];
  if (!config) return null;

  const { icon: Icon, variant } = config;
  // Contestant/eliminated badges carry a tier-specific label when available.
  const label = role === 'contestant'
    ? (contestantLabel || config.label)
    : role === 'eliminated'
      ? (subLabel || config.label)
      : config.label;

  return (
    <Badge variant={variant} size={size} pill>
      <Icon size={10} />
      {label}
    </Badge>
  );
}

/**
 * Public-facing tier a contestant reached, given the round they were
 * eliminated in. Delegates the tier naming to the shared `roundLabels`
 * source of truth and only adds the profile's "… Contestant" phrasing for
 * numbered tiers ("Top 50 Contestant"); structural tiers like the entry
 * round read on their own.
 */
function getReachedTierLabel(competition, eliminatedInRound) {
  if (!eliminatedInRound) return null;
  const label = getRoundLabel(competition?.voting_rounds, eliminatedInRound);
  if (!label) return null;
  return /^Top \d+$/.test(label) ? `${label} Contestant` : label;
}

function getVotingStartDate(competition) {
  const rounds = competition?.voting_rounds || [];
  if (rounds.length > 0) {
    const sorted = [...rounds].sort((a, b) => (a.round_order || 0) - (b.round_order || 0));
    const first = sorted[0];
    if (first?.start_date) {
      return new Date(first.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }
  const votingStart = competition?.settings?.voting_start || competition?.voting_start;
  if (votingStart) {
    return new Date(votingStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return null;
}

/**
 * Cheap, hook-free predicate mirroring CompetitionCard's `showInlineVoting`.
 * Lets the parent decide — before rendering — whether an entry needs the rich
 * stacked card (active voting: stats + inline voting panel) or can use the
 * compact card in the centered card row.
 */
function entryHasInlineVoting(entry, isPreview) {
  const competition = entry.competition || {};
  const isContestantEntry = entry.role === 'contestant' || entry.role === 'winner';
  if (!isContestantEntry || !entry.contestant?.id) return false;
  const realRound = findActiveVotingRound(competition);
  const activeRound = realRound || (isPreview ? synthesizePreviewRound(competition) : null);
  return !!activeRound;
}

/**
 * Compact competition card used in the centered card row. Shows the org icon,
 * role badge, competition name, and city · year — no voting panel. Kept narrow
 * with a fixed width so multiple competitions line up neatly side by side.
 */
function CompactCompetitionCard({ entry, onAcceptClick, isMobile }) {
  const [isHovered, setIsHovered] = useState(false);
  const competition = entry.competition || {};
  const cityName = competition.city?.name || competition.city || '';
  const org = competition.organization;
  const orgLogo = getOrgLogo(org);

  return (
    <a
      href={entry.url}
      style={{
        // Fixed-width card so several line up in a row; kept narrow and
        // center-aligned so the icon / badge / name / meta stack reads compact.
        flex: '0 0 auto',
        width: isMobile ? '160px' : '170px',
        textDecoration: 'none',
        color: 'inherit',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: spacing.xs,
        padding: spacing.md,
        borderRadius: borderRadius.lg,
        background: isHovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isHovered ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)'}`,
        transition: 'all 0.2s ease',
        cursor: 'pointer',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Org icon */}
      {orgLogo && (
        <OrganizationLogo
          logo={orgLogo}
          size={56}
          alt={org?.name || 'Organization'}
        />
      )}

      {/* Role badge */}
      {entry.role && (
        <RoleBadge role={entry.role} size="xs" subLabel={entry.reachedTierLabel} />
      )}

      {/* Competition name — allow up to two lines, then ellipsis. */}
      <h4 style={{
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
        color: colors.text.primary,
        lineHeight: 1.3,
        margin: 0,
        letterSpacing: typography.letterSpacing.tight,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {competition.name || entry.name}
      </h4>

      {/* City · year */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
        fontSize: typography.fontSize.xs,
        color: colors.text.secondary,
        whiteSpace: 'nowrap',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}>
        {cityName && <span style={{ flexShrink: 0 }}>{cityName}</span>}
        {cityName && competition.season && (
          <span style={{ color: colors.text.muted, flexShrink: 0 }}>·</span>
        )}
        {competition.season && <span style={{ flexShrink: 0 }}>{competition.season}</span>}
      </div>

      {/* Lifetime competition vote total — shown for contestant-role entries
          so a past winner/contestant's total reads in context on the card. */}
      {['winner', 'contestant', 'eliminated'].includes(entry.role) && (entry.lifetimeVotes || 0) > 0 && (
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.xs,
          marginTop: spacing.xs,
          color: colors.gold.primary,
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.semibold,
        }}>
          <Heart size={12} style={{ fill: colors.gold.primary }} />
          {(entry.lifetimeVotes || 0).toLocaleString()} votes
        </div>
      )}

      {/* Unclaimed nomination CTA */}
      {entry.isUnclaimed && entry.nomination && (
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAcceptClick(entry.nomination);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.xs,
            marginTop: spacing.xs,
            padding: `${spacing.xs} ${spacing.sm}`,
            background: 'rgba(212, 175, 55, 0.15)',
            border: `1px solid ${colors.gold.primary}`,
            borderRadius: borderRadius.md,
            color: colors.gold.primary,
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.semibold,
            cursor: 'pointer',
          }}
        >
          Accept or Decline
          <ArrowRight size={12} />
        </div>
      )}
    </a>
  );
}

function CompetitionCard({ entry, onAcceptClick, isMobile, isPreview = false }) {
  const [isHovered, setIsHovered] = useState(false);
  const competition = entry.competition || {};
  const cityName = competition.city?.name || competition.city || '';
  const org = competition.organization;
  const orgLogo = getOrgLogo(org);
  const url = entry.url;

  // Inline voting is only shown for contestant entries during an active
  // voting round. Nominations / between-rounds / completed phases keep the
  // card as-is — unless the host is previewing the voting phase via the
  // dashboard Preview tab (isPreview), in which case we synthesize an
  // active round from the first voting_rounds row so the panel renders.
  const isContestantEntry = entry.role === 'contestant' || entry.role === 'winner';
  const realRound = isContestantEntry ? findActiveVotingRound(competition) : null;
  const previewRound = isContestantEntry && isPreview && !realRound
    ? synthesizePreviewRound(competition)
    : null;
  const activeRound = realRound || previewRound;
  const showInlineVoting = !!activeRound && !!entry.contestant?.id;

  // Leaderboard is fetched at the card level so the stats row and the
  // voting panel share a single round trip. Realtime is on so the rank
  // in the stats bar updates live when process_vote() bumps
  // contestants.votes — useLeaderboard subscribes to postgres_changes
  // on `contestants` (see hooks/useLeaderboard.js).
  // When the competition splits winners by gender, ask useLeaderboard for the
  // per-gender ranking so the stat card's "Rank #X" matches the public
  // leaderboard and finalize_voting_round (which rank within each gender).
  const splitByGender = !!competition?.winners_split_by_gender;
  const { contestants: leaderboard, refetch: refetchLeaderboard } = useLeaderboard(
    showInlineVoting ? competition.id : null,
    {
      realtime: true,
      splitByGender,
      advancingCount: activeRound?.contestants_advance,
    },
  );

  // entry.lifetimeVotes comes from a one-shot fetch in the parent
  // (getContestantCompetitions) that nothing refreshes after a vote —
  // refetchLeaderboard only updates rank data. Track votes cast from this
  // card locally so the header total moves immediately; a reload replaces
  // the sum with the authoritative DB value.
  const [voteBump, setVoteBump] = useState(0);
  const handleVoteCast = (added) => {
    setVoteBump((b) => b + (Number(added) || 1));
    refetchLeaderboard();
  };

  // Countdown to the active round's end_date — drives the ROUND ENDS stat.
  const countdown = useCountdown(activeRound?.end_date || null);

  // Tier the contestant currently holds — derived from the prior round's
  // contestants_advance (the cap of who advanced INTO this round). Stays
  // stable for the duration of the round, even if a contestant drops out
  // mid-round. Mirrors the tier-title pattern in ProfileView.jsx. When
  // there's no prior round (first voting round, or a preview-synthesized
  // round) tierCount is null and the badge falls back to plain
  // "Contestant".
  const tierCount = useMemo(() => {
    if (!showInlineVoting || !activeRound) return null;
    const rounds = competition?.voting_rounds || [];
    const priorOrder = (activeRound.round_order || 0) - 1;
    if (priorOrder < 1) return null;
    const prior = rounds.find((r) => r.round_order === priorOrder);
    const count = prior?.contestants_advance;
    return Number.isFinite(count) && count > 0 ? count : null;
  }, [showInlineVoting, activeRound, competition?.voting_rounds]);

  // Contestant's current rank among contestants still active in this
  // round. The denominator prefers the tier cap (e.g. 50 for a "Top 50"
  // round) so it stays stable; falls back to the live active count when
  // the round doesn't expose a cap.
  const rankStats = useMemo(() => {
    if (!showInlineVoting || !leaderboard?.length || !entry.contestant?.id) return null;
    const me = leaderboard.find((c) => c.id === entry.contestant.id);
    if (!me || me.status !== 'active') return null;
    // `displayRank` from useLeaderboard is the contestant's position within
    // their gender when splitByGender is on (overall otherwise). The
    // denominator is the round's advance cap — halved per gender when split —
    // falling back to the count of still-active peers in the same pool.
    let total;
    if (splitByGender) {
      const poolCount = leaderboard.filter(
        (c) => c.status === 'active' && c.gender === me.gender,
      ).length;
      total = tierCount ? Math.ceil(tierCount / 2) : poolCount;
    } else {
      const activeCount = leaderboard.filter((c) => c.status === 'active').length;
      total = tierCount || activeCount;
    }
    return { current: me.displayRank, total };
  }, [showInlineVoting, leaderboard, entry.contestant?.id, tierCount, splitByGender]);

  // When the voting panel is visible, the outer <a> causes button clicks
  // to bubble and trigger navigation. Split the card into a clickable
  // "link area" (top of card) and a non-link "voting area" (bottom) that
  // are siblings — so button clicks in the voting panel never reach the
  // link. When there's no voting panel, the old anchor-wrapped layout is
  // fine and keeps full-card-click behavior.
  const CardBody = (
    <div
      style={{
        padding: isMobile ? spacing.md : spacing.lg,
        borderRadius: borderRadius.lg,
        background: isHovered ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isHovered ? 'rgba(212,175,55,0.2)' : 'rgba(255,255,255,0.06)'}`,
        transition: 'all 0.2s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        overflow: 'hidden',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <a
        href={url}
        style={{
          textDecoration: 'none',
          color: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: spacing.md,
          cursor: 'pointer',
          minWidth: 0,
        }}
      >
        {/* Large org logo as its own column, vertically centered and
            sized to match the content stack height. */}
        {orgLogo && (
          <OrganizationLogo
            logo={orgLogo}
            size={isMobile ? 72 : 84}
            alt={org?.name || 'Organization'}
          />
        )}

        {/* Content column: name + badge + meta, stacked. */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.xs,
        }}>
          {/* Row 1: Competition name on its own line, full width. */}
          <h4 style={{
            fontSize: isMobile ? typography.fontSize.base : typography.fontSize.md,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            lineHeight: 1.3,
            margin: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            letterSpacing: typography.letterSpacing.tight,
          }}>
            {competition.name || entry.name}
          </h4>

          {/* Row 2: Role badge as a label beneath the title. Skipped when
              the role doesn't map to a badge so we don't leave an empty
              gap in the stack. */}
          {entry.role && (
            <div style={{ display: 'flex' }}>
              <RoleBadge
                role={entry.role}
                subLabel={entry.reachedTierLabel}
                contestantLabel={tierCount ? `Top ${tierCount} Contestant` : undefined}
              />
            </div>
          )}

          {/* Row 3: Meta (city · season) — kept tight because the vote total
              sits to the right in the header and rank / round-end live in the
              stats row below. */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.xs,
            fontSize: typography.fontSize.xs,
            color: colors.text.secondary,
            whiteSpace: 'nowrap',
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {cityName && (
              <span style={{ flexShrink: 0 }}>{cityName}</span>
            )}
            {cityName && competition.season && (
              <span style={{ color: colors.text.muted, flexShrink: 0 }}>·</span>
            )}
            {competition.season && (
              <span style={{ flexShrink: 0 }}>{competition.season}</span>
            )}
          </div>
        </div>

        {/* Lifetime vote total, right-aligned in the header for any
            contestant-role entry. The figure leads with the city/season meta
            on the left, so the header reads "who / where" → "how many" without
            a separate stat band below. */}
        {['winner', 'contestant', 'eliminated'].includes(entry.role) && (
          <div style={{
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            textAlign: 'right',
            lineHeight: 1.1,
          }}>
            <span style={{
              fontSize: isMobile ? typography.fontSize.lg : typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
              color: colors.gold.primary,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {((entry.lifetimeVotes || 0) + voteBump).toLocaleString()}
            </span>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '3px',
              fontSize: '10px',
              fontWeight: typography.fontWeight.semibold,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: colors.gold.primary,
            }}>
              <Heart size={10} style={{ fill: colors.gold.primary }} />
              Votes
            </span>
          </div>
        )}

        {/* Chevron only for non-contestant entries — contestant cards are
            primarily about the inline voting panel, so the navigational
            affordance would compete with the primary CTA. */}
        {!showInlineVoting && (
          <ChevronRight
            size={18}
            style={{
              flexShrink: 0,
              color: isHovered ? colors.gold.primary : colors.text.tertiary,
              transition: 'color 0.2s ease',
            }}
          />
        )}
      </a>

      {/* Live voting round: Rank + Round-ends below the header (the vote total
          lives in the header now). Two even boxes fill the row. */}
      {showInlineVoting && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: spacing.sm,
        }}>
          <StatBox
            label="Rank"
            value={rankStats ? `#${rankStats.current}` : '—'}
            suffix={rankStats ? `/ ${rankStats.total}` : undefined}
            isMobile={isMobile}
          />
          <StatBox
            label="Round ends"
            value={countdown?.isExpired ? 'Ended' : (countdown?.display?.primary || '—')}
            icon={<Clock size={12} />}
            accent
            isMobile={isMobile}
          />
        </div>
      )}

      {/* Inline voting panel — sibling to the link, not inside it, so
          button clicks never bubble into the <a>'s navigation. */}
      {showInlineVoting && (
        <CompetitionCardVoting
          contestant={entry.contestant}
          competition={competition}
          currentRound={activeRound}
          isPreview={isPreview}
          leaderboard={leaderboard}
          onVoteCast={handleVoteCast}
        />
      )}

      {/* Unclaimed CTA */}
      {entry.isUnclaimed && entry.nomination && (
        <div
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAcceptClick(entry.nomination);
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.sm,
            padding: `${spacing.xs} ${spacing.md}`,
            background: 'rgba(212, 175, 55, 0.15)',
            border: `1px solid ${colors.gold.primary}`,
            borderRadius: borderRadius.md,
            color: colors.gold.primary,
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            cursor: 'pointer',
            marginTop: spacing.xs,
            alignSelf: 'flex-start',
          }}
        >
          Accept or Decline
          <ArrowRight size={13} />
        </div>
      )}
    </div>
  );

  return CardBody;
}

export default function ProfileCompetitions({ userId, userEmail, user, profile, isOwnProfile = false, isPreview = false }) {
  const { isMobile, isSmall } = useResponsive();
  const [hostedCompetitions, setHostedCompetitions] = useState([]);
  const [contestantEntries, setContestantEntries] = useState([]);
  const [nominations, setNominations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNomination, setSelectedNomination] = useState(null);

  const handleOpenAcceptModal = (nomination) => {
    setSelectedNomination(nomination);
  };

  const handleCloseAcceptModal = () => {
    setSelectedNomination(null);
  };

  const handleAccept = () => {
    setNominations(prev => prev.filter(n => n.id !== selectedNomination?.id));
    setSelectedNomination(null);
  };

  const handleDecline = () => {
    setNominations(prev => prev.filter(n => n.id !== selectedNomination?.id));
    setSelectedNomination(null);
  };

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    Promise.all([
      getHostedCompetitions(userId),
      getContestantCompetitions(userId),
      getNominationsForUser(userId, userEmail),
    ]).then(([hosted, contestant, noms]) => {
      setHostedCompetitions(hosted);
      setContestantEntries(contestant);
      setNominations(noms);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [userId, userEmail]);

  const hasHosted = hostedCompetitions.length > 0;
  const hasContestant = contestantEntries.length > 0;
  const hasNominations = nominations.length > 0;

  if (loading) {
    return (
      <Panel style={{ marginBottom: spacing.xl }}>
        <div style={{ padding: spacing.xl, textAlign: 'center', color: colors.text.muted }}>
          Loading competitions...
        </div>
      </Panel>
    );
  }

  if (!hasHosted && !hasContestant && !hasNominations) {
    return null;
  }

  // Build unified list of all competition entries
  const entries = [];

  // Track competition IDs that already have a contestant entry, to
  // avoid showing duplicate cards when a nomination was converted.
  const contestantCompetitionIds = new Set(
    contestantEntries.map(e => e.competition_id).filter(Boolean)
  );

  // Add nominations — skip if the nominee was converted AND we already
  // have a matching contestant entry for that competition.
  nominations.forEach(nom => {
    const competition = nom?.competition;
    const competitionId = competition?.id;

    if (nom.converted_to_contestant && competitionId && contestantCompetitionIds.has(competitionId)) {
      return; // Already shown as contestant
    }

    // Only treat as converted if the nominee flag is set AND a matching
    // contestant record actually exists. This handles cases where the
    // contestant row was removed but the nominee flag wasn't cleared.
    const isConverted = nom.converted_to_contestant && competitionId && contestantCompetitionIds.has(competitionId);

    entries.push({
      id: `nom-${nom.id}`,
      name: competition?.name || 'Competition',
      url: getCompetitionLink(competition),
      role: isConverted ? 'contestant' : 'nominee',
      status: competition?.status,
      competition: competition,
      isUnclaimed: !isConverted && !nom.claimed_at && nom.status !== 'approved',
      nomination: isConverted ? null : nom,
      nominatorName: !nom.nominator_anonymous ? nom.nominator_name : null,
    });
  });

  // Add hosted competitions
  hostedCompetitions.forEach(comp => {
    entries.push({
      id: `host-${comp.id}`,
      name: comp?.name || `${comp?.city?.name || comp?.city || 'Competition'} ${comp?.season || ''}`.trim(),
      url: getCompetitionLink(comp),
      role: 'host',
      status: comp?.status,
      competition: comp,
    });
  });

  // Add contestant entries
  contestantEntries.forEach(entry => {
    const comp = entry.competition;
    const isWinner = entry?.status === 'winner';
    const isEliminated = entry?.status === 'eliminated';
    entries.push({
      id: `contestant-${entry.id}`,
      name: comp?.name || `${comp?.city?.name || comp?.city || 'Competition'} ${comp?.season || ''}`.trim(),
      url: getCompetitionLink(comp),
      role: isWinner ? 'winner' : (isEliminated ? 'eliminated' : 'contestant'),
      reachedTierLabel: isEliminated ? getReachedTierLabel(comp, entry.eliminated_in_round) : null,
      status: comp?.status,
      competition: comp,
      votes: entry.votes || 0,
      // Never-reset competition total (paid + free + bonus + manual). Shown on
      // the card so it reflects everything earned across the comp, not just the
      // current round's running `votes` (which resets each round).
      lifetimeVotes: entry.lifetime_votes ?? entry.votes ?? 0,
      contestant: {
        id: entry.id,
        name: entry.name,
        avatarUrl: entry.avatar_url,
        votes: entry.votes,
      },
    });
  });

  // Contestant entries with an active voting round render a rich stacked card
  // (stats + inline voting panel) that can't fit the compact horizontal card,
  // so they always stay full-width below. Everything else (host / nominee /
  // winner / completed contestant) is a candidate for the compact row — but
  // the compact row only makes sense when there are several to line up, so a
  // lone entry falls back to the full-width stacked card.
  const votingEntries = entries.filter(e => entryHasInlineVoting(e, isPreview));
  const simpleEntries = entries.filter(e => !entryHasInlineVoting(e, isPreview));
  const useCompactRow = simpleEntries.length > 1;
  // Order the row by lifecycle stage (voting → nominations/coming soon →
  // completed). Array.sort is stable, so entries in the same phase keep their
  // original order (nominations, then hosted, then contestant).
  const compactEntries = useCompactRow
    ? [...simpleEntries].sort((a, b) => phaseCardRank(a.competition) - phaseCardRank(b.competition))
    : [];
  // Stacked cards = active-voting entries, plus the lone simple entry when the
  // compact row isn't used.
  const stackedEntries = useCompactRow ? votingEntries : [...simpleEntries, ...votingEntries];

  return (
    <>
      <div style={{ borderTop: `1px solid ${colors.border.secondary}` }} />
      <div style={{ padding: isSmall ? spacing.lg : spacing.xxl }}>
          {/* Compact competition cards, centered as a group so they line up
              under the (centered) profile avatar. When there are too many to
              fit on one line, the row scrolls horizontally rather than wrapping
              into a lopsided second row. The outer wrapper centers the inner
              row while it fits; the inner row takes over scrolling once it
              overflows. */}
          {compactEntries.length > 0 && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: stackedEntries.length > 0 ? spacing.lg : 0,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'nowrap',
                  gap: spacing.md,
                  maxWidth: '100%',
                  overflowX: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  // Small gutter so the scrollbar doesn't crowd the cards.
                  paddingBottom: spacing.xs,
                }}
              >
                {compactEntries.map(entry => (
                  <CompactCompetitionCard
                    key={entry.id}
                    entry={entry}
                    onAcceptClick={handleOpenAcceptModal}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Full-width stacked cards: active-voting entries (always), plus a
              lone simple entry when there aren't enough for the compact row. */}
          {stackedEntries.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {stackedEntries.map(entry => (
                <CompetitionCard
                  key={entry.id}
                  entry={entry}
                  onAcceptClick={handleOpenAcceptModal}
                  isMobile={isMobile}
                  isPreview={isPreview}
                />
              ))}
            </div>
          )}
      </div>

      {/* Accept Nomination Modal */}
      {selectedNomination && (
        <AcceptNominationModal
          isOpen={true}
          onClose={handleCloseAcceptModal}
          nomination={selectedNomination}
          profile={profile}
          user={user}
          onAccept={handleAccept}
          onDecline={handleDecline}
        />
      )}
    </>
  );
}
