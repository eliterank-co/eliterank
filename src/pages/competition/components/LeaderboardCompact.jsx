import { useState, useCallback, useMemo } from 'react';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { AlertTriangle, Calendar } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import CrownIcon from '../../../components/ui/icons/CrownIcon';
import EliteRankCrown from '../../../components/ui/icons/EliteRankCrown';
import { formatEventTime } from '../../../utils/formatters';
import { transformSupabaseImage } from '../../../lib/storageImage';

/**
 * Image-focused leaderboard - contestants are the STARS
 * Large portrait cards, minimal UI chrome
 */
export function LeaderboardCompact() {
  const {
    contestants,
    competition,
    phase,
    dangerZone,
    events,
  } = usePublicCompetition();

  // Top N contestants are "winners" and get the EliteRank crown badge
  // instead of a rank number. Driven by the competition's configured
  // number_of_winners so every competition behaves correctly.
  const numberOfWinners = competition?.number_of_winners || 1;

  // During the interim between-rounds phase we hide rank badges and vote
  // counts — no active voting is happening, so showing ranks/votes would
  // be misleading.
  const isBetweenRounds = phase?.phase === 'between-rounds';
  const splitByGender = !!competition?.winners_split_by_gender;

  const navigate = useNavigate();
  const location = useLocation();

  // Build the leaderboard URL from the current path so it works across all
  // URL formats (slug, ID, legacy) and preserves query params like
  // ?preview=voting when a host is previewing the voting page.
  const stripTrailing = (p) => p.replace(/\/(leaderboard|prizes|activity|enter)\/?$/, '').replace(/\/$/, '');
  const basePath = stripTrailing(location.pathname);
  const leaderboardPath = `${basePath}/leaderboard${location.search || ''}`;

  // Clicking a contestant navigates to their public profile page. Preserve
  // the ?preview= query param so that if the host is inside a phase
  // preview iframe, the profile keeps rendering in preview mode.
  const handleCardClick = (contestant) => {
    if (!contestant?.user_id) return;
    navigate(`/profile/${contestant.user_id}${location.search || ''}`);
  };

  // Find the next upcoming event (if any)
  const nextEvent = useMemo(() => {
    if (!events?.length) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const sorted = [...events].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return new Date(a.date) - new Date(b.date);
    });
    return sorted.find(e => !e.date || e.date.split('T')[0] >= todayStr) || null;
  }, [events]);

  // When an event card is included the grid has (contestants + 1) items.
  // Desktop is 3 columns, mobile is 2 columns. Pick a contestant count
  // so total items fill complete rows on both layouts (divisible by 6).
  // 11 + 1 = 12 (4×3, 6×2). Without event, 9 works for 3-col (3×3).
  const maxContestants = nextEvent ? 11 : 9;
  const displayContestants = contestants?.slice(0, maxContestants) || [];

  // When the competition splits winners by gender, render the compact
  // leaderboard as two stacked groups (top men / top women) instead of one
  // mixed list. Each group shows half the cap, rounded up, so the total
  // visible count stays close to maxContestants.
  const perGenderCap = Math.ceil(maxContestants / 2);
  const topMen = splitByGender
    ? (contestants?.filter((c) => c.gender === 'male').slice(0, perGenderCap) || [])
    : [];
  const topWomen = splitByGender
    ? (contestants?.filter((c) => c.gender === 'female').slice(0, perGenderCap) || [])
    : [];
  const winnersPerGender = Math.ceil(numberOfWinners / 2);

  return (
    <div className="leaderboard-prominent">
      <div className="leaderboard-header">
        <h3>
          <EliteRankCrown size={18} />
          Leaderboard
        </h3>
        <span className="live-indicator">
          <span className="live-dot" />
          Live
        </span>
      </div>

      {splitByGender ? (
        <>
          <h4 className="leaderboard-gender-subheading">Women</h4>
          <div className="portrait-grid">
            {topWomen.map((contestant, index) => (
              <PortraitCard
                key={contestant.id}
                contestant={contestant}
                rank={contestant.displayRank || index + 1}
                numberOfWinners={winnersPerGender}
                hideRank={isBetweenRounds}
                hideVotes={isBetweenRounds}
                hideDanger={isBetweenRounds}
                onVote={handleCardClick}
              />
            ))}
          </div>
          <h4 className="leaderboard-gender-subheading">Men</h4>
          <div className="portrait-grid">
            {topMen.map((contestant, index) => (
              <PortraitCard
                key={contestant.id}
                contestant={contestant}
                rank={contestant.displayRank || index + 1}
                numberOfWinners={winnersPerGender}
                hideRank={isBetweenRounds}
                hideVotes={isBetweenRounds}
                hideDanger={isBetweenRounds}
                onVote={handleCardClick}
              />
            ))}
            {nextEvent && <EventPortraitCard event={nextEvent} />}
          </div>
        </>
      ) : (
        <div className="portrait-grid">
          {displayContestants.map((contestant, index) => (
            <PortraitCard
              key={contestant.id}
              contestant={contestant}
              rank={index + 1}
              numberOfWinners={numberOfWinners}
              hideRank={isBetweenRounds}
              hideVotes={isBetweenRounds}
              hideDanger={isBetweenRounds}
              onVote={handleCardClick}
            />
          ))}
          {nextEvent && (
            <EventPortraitCard event={nextEvent} />
          )}
        </div>
      )}

      {/* Danger Zone Summary — hidden between rounds */}
      {!isBetweenRounds && dangerZone?.length > 0 && (
        <div className="danger-zone-summary">
          <AlertTriangle size={12} />
          <span>{dangerZone.length} contestants at risk of elimination</span>
        </div>
      )}

      {/* View All Link */}
      <button
        className="leaderboard-view-all"
        onClick={() => navigate(leaderboardPath)}
      >
        View All Contestants
      </button>
    </div>
  );
}

/**
 * Compact event card that fits inside the portrait grid.
 * Shows the event flyer image with a date badge overlay,
 * event name + venue below — mirrors the EventCard style.
 */
function EventPortraitCard({ event }) {
  const imageUrl = event.imageUrl || event.image_url;
  const ticketUrl = event.ticketUrl || event.ticket_url;
  const venue = event.location || event.venue;

  const formatDateBadge = (dateStr, timeStr) => {
    if (!dateStr) return 'Date TBD';
    const eventDate = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = eventDate.getTime() === today.getTime();
    const datePart = isToday
      ? 'TODAY'
      : eventDate
          .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
          .toUpperCase();
    if (timeStr) return `${datePart}  \u2022  ${formatEventTime(timeStr)}`;
    return datePart;
  };

  const Wrapper = ticketUrl ? 'a' : 'div';
  const wrapperProps = ticketUrl
    ? { href: ticketUrl, target: '_blank', rel: 'noopener noreferrer' }
    : {};

  return (
    <Wrapper {...wrapperProps} className="portrait-card portrait-card-event">
      <div className="portrait-image-wrap">
        {imageUrl ? (
          <img src={transformSupabaseImage(imageUrl, { width: 400, height: 500 })} alt={event.name} className="portrait-image" loading="lazy" decoding="async" style={{ objectFit: 'cover' }} />
        ) : (
          <div className="portrait-placeholder">
            <Calendar size={28} />
          </div>
        )}
        <span className="portrait-event-date-badge">
          {formatDateBadge(event.date, event.time)}
        </span>
      </div>
      <div className="portrait-info portrait-event-info">
        <span className="portrait-name">{event.name}</span>
        {venue && <span className="portrait-event-venue">{venue}</span>}
      </div>
    </Wrapper>
  );
}

export function PortraitCard({
  contestant,
  rank,
  numberOfWinners = 1,
  hideRank = false,
  hideVotes = false,
  hideDanger = false,
  onVote,
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const handleError = useCallback(() => setImgFailed(true), []);
  const handleLoad = useCallback(() => setImgLoaded(true), []);

  const isEliminated = contestant.status === 'eliminated';
  const isDanger = !hideDanger && !isEliminated && contestant.zone === 'danger';
  const isWinner = !isEliminated && rank <= numberOfWinners;
  const showImg = contestant.avatar_url && !imgFailed;

  // Eliminated rows render as non-interactive: no click-through to profile,
  // grayed visual, and an "Eliminated" badge replaces the rank/danger chip.
  const handleClick = isEliminated ? undefined : () => onVote(contestant);

  return (
    <div
      className={`portrait-card ${isDanger ? 'at-risk' : ''} ${isEliminated ? 'eliminated' : ''}`}
      onClick={handleClick}
      style={isEliminated
        ? { cursor: 'default', opacity: 0.55, filter: 'grayscale(0.6)' }
        : undefined}
      aria-disabled={isEliminated || undefined}
    >
      <div className="portrait-image-wrap">
        <div className="portrait-placeholder">
          {contestant.name?.charAt(0)}
        </div>
        {showImg && (
          <img
            src={transformSupabaseImage(contestant.avatar_url, { width: 400, height: 500 })}
            alt={contestant.name}
            className="portrait-image"
            loading={rank <= 3 ? 'eager' : 'lazy'}
            fetchpriority={rank <= 3 ? 'high' : 'auto'}
            decoding="async"
            style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.2s ease' }}
            onLoad={handleLoad}
            onError={handleError}
          />
        )}
        {isEliminated ? (
          <span
            className="portrait-eliminated"
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              padding: '3px 8px',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              color: 'var(--color-text-secondary)',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            Eliminated
          </span>
        ) : (
          <>
            {!hideRank && (isWinner ? (
              <span
                className="portrait-rank portrait-rank-winner"
                aria-label={`Winner rank ${rank}`}
              >
                <CrownIcon size={14} color="#0a0a0f" />
              </span>
            ) : (
              <span className="portrait-rank">#{rank}</span>
            ))}
            {isDanger && (
              <span className="portrait-danger">
                <AlertTriangle size={12} />
                At Risk
              </span>
            )}
          </>
        )}
      </div>
      <div className="portrait-info">
        <span className="portrait-name">{contestant.name?.split(' ')[0]}</span>
        {!hideVotes && !isEliminated && (
          <span className="portrait-votes">{contestant.votes ? contestant.votes.toLocaleString() : '0'}</span>
        )}
      </div>
    </div>
  );
}

export default LeaderboardCompact;
