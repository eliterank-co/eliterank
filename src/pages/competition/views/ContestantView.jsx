import { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { ArrowLeft, Instagram, Trophy, Heart } from 'lucide-react';
import { colors, spacing, typography, borderRadius } from '../../../styles/theme';
import { transformSupabaseImage } from '../../../lib/storageImage';

/**
 * Contestant profile page — rendered inline when the URL contains /e/:slug.
 * Shows avatar, name, city/age, bio, Instagram, rank + votes, and a vote CTA
 * (only during active voting phases).
 */
export function ContestantView() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    getContestantBySlug,
    openVoteModal,
    loading,
    phase,
  } = usePublicCompetition();

  // Extract the contestant slug from the URL — the competition route uses
  // a wildcard `/*` so react-router doesn't give us the slug via useParams.
  const contestantSlug = useMemo(() => {
    const match = location.pathname.match(/\/e\/([^/?#]+)\/?$/);
    return match ? match[1] : null;
  }, [location.pathname]);

  const contestant = contestantSlug && !loading
    ? getContestantBySlug(contestantSlug)
    : null;

  // Build the base competition path (strip /e/:slug) for the back button
  const basePath = location.pathname.replace(/\/e\/[^/]+\/?$/, '') || '/';
  const backUrl = `${basePath}${location.search || ''}`;

  const handleBack = () => {
    navigate(backUrl);
  };

  const handleVote = () => {
    if (contestant) {
      openVoteModal(contestant);
    }
  };

  // Loading state
  if (loading || !contestant) {
    return (
      <div className="contestant-view-container">
        <div className="contestant-view-loading">
          <div className="contestant-view-avatar-placeholder contestant-view-pulse" />
          <div className="contestant-view-text-placeholder contestant-view-pulse" style={{ width: '60%', height: 24 }} />
          <div className="contestant-view-text-placeholder contestant-view-pulse" style={{ width: '40%', height: 16 }} />
        </div>
      </div>
    );
  }

  const isVoting = phase?.isVoting;
  const firstName = contestant.name?.split(' ')[0] || 'them';

  // Build subtitle parts: city, age
  const subtitleParts = [];
  if (contestant.city) subtitleParts.push(contestant.city);
  if (contestant.age) subtitleParts.push(`Age ${contestant.age}`);
  const subtitle = subtitleParts.join(' · ');

  return (
    <div className="contestant-view-container">
      {/* Back button */}
      <button
        className="contestant-view-back"
        onClick={handleBack}
        aria-label="Back to competition"
      >
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>

      {/* Profile card */}
      <div className="contestant-view-card">
        {/* Avatar */}
        {contestant.avatar_url ? (
          <img
            src={transformSupabaseImage(contestant.avatar_url, { width: 320, height: 320 })}
            alt={contestant.name}
            className="contestant-view-avatar"
            decoding="async"
          />
        ) : (
          <div className="contestant-view-avatar contestant-view-avatar-fallback">
            {contestant.name?.charAt(0)}
          </div>
        )}

        {/* Name */}
        <h1 className="contestant-view-name">{contestant.name}</h1>

        {/* City / Age subtitle */}
        {subtitle && (
          <p className="contestant-view-subtitle">{subtitle}</p>
        )}

        {/* Rank + Votes — only during voting */}
        {isVoting && (
          <div className="contestant-view-stats">
            <div className="contestant-view-stat">
              <Trophy size={16} color={colors.gold.primary} />
              <span className="contestant-view-stat-value">
                #{contestant.displayRank || contestant.rank || '—'}
              </span>
              <span className="contestant-view-stat-label">Rank</span>
            </div>
            <div className="contestant-view-stat-divider" />
            <div className="contestant-view-stat">
              <Heart size={16} color={colors.gold.primary} />
              <span className="contestant-view-stat-value">
                {(contestant.votes || 0).toLocaleString()}
              </span>
              <span className="contestant-view-stat-label">Votes</span>
            </div>
          </div>
        )}

        {/* Bio */}
        {contestant.bio && (
          <p className="contestant-view-bio">{contestant.bio}</p>
        )}

        {/* Instagram */}
        {contestant.instagram && (
          <a
            href={`https://instagram.com/${contestant.instagram.replace(/^@/, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="contestant-view-instagram"
          >
            <Instagram size={16} />
            <span>@{contestant.instagram.replace(/^@/, '')}</span>
          </a>
        )}

        {/* Vote CTA — only during active voting */}
        {isVoting && (
          <button
            className="contestant-view-vote-btn"
            onClick={handleVote}
          >
            Vote for {firstName}
          </button>
        )}
      </div>
    </div>
  );
}

export default ContestantView;
