import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { PortraitCard } from '../components/LeaderboardCompact';
import { Search, X } from 'lucide-react';

/**
 * Full leaderboard page - reuses the same portrait-card grid as the
 * compact sidebar leaderboard so the two surfaces stay visually consistent.
 * On the full page the grid has more room, so the cards render larger.
 *
 * When the competition splits winners by gender, the ranked list is rendered
 * as two side-by-side columns (Men / Women) ranked within each gender.
 */
export function LeaderboardView() {
  const {
    contestants,
    competition,
    phase,
  } = usePublicCompetition();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');

  // Top N contestants render the EliteRank crown badge instead of a rank
  // number — where N is the competition's configured winner count.
  const numberOfWinners = competition?.number_of_winners || 1;

  // Between rounds: hide rank badges + vote counts (no active voting).
  const isBetweenRounds = phase?.phase === 'between-rounds';
  const splitByGender = !!competition?.winners_split_by_gender;

  const handleCardClick = (contestant) => {
    if (!contestant?.user_id) return;
    navigate(`/profile/${contestant.user_id}${location.search || ''}`);
  };

  // Filter contestants by search query
  const filtered = useMemo(() => {
    if (!contestants) return [];
    if (!search.trim()) return contestants;
    const q = search.trim().toLowerCase();
    return contestants.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q)
    );
  }, [contestants, search]);

  // Per-gender ordered lists with rank computed within the gender column,
  // so each column starts at #1. Crown badges go to the top half of
  // number_of_winners per gender (CEIL), matching finalize_voting_round.
  const { men, women } = useMemo(() => {
    if (!splitByGender) return { men: [], women: [] };
    const m = filtered.filter((c) => c.gender === 'male');
    const f = filtered.filter((c) => c.gender === 'female');
    return { men: m, women: f };
  }, [filtered, splitByGender]);

  const winnersPerGender = Math.ceil(numberOfWinners / 2);

  return (
    <div className="leaderboard-full">
      {/* Search bar */}
      <div className="leaderboard-search">
        <Search size={18} className="leaderboard-search-icon" />
        <input
          type="text"
          placeholder="Search contestants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="leaderboard-search-input"
        />
        {search && (
          <button
            className="leaderboard-search-clear"
            onClick={() => setSearch('')}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {splitByGender ? (
        <div className="leaderboard-gender-split">
          <GenderColumn
            label="Women"
            list={women}
            numberOfWinners={winnersPerGender}
            isBetweenRounds={isBetweenRounds}
            onCardClick={handleCardClick}
          />
          <GenderColumn
            label="Men"
            list={men}
            numberOfWinners={winnersPerGender}
            isBetweenRounds={isBetweenRounds}
            onCardClick={handleCardClick}
          />
        </div>
      ) : (
        <div className="portrait-grid">
          {filtered.map((contestant, index) => (
            <PortraitCard
              key={contestant.id}
              contestant={contestant}
              rank={contestant.displayRank || index + 1}
              numberOfWinners={numberOfWinners}
              hideRank={isBetweenRounds}
              hideVotes={isBetweenRounds}
              hideDanger={isBetweenRounds}
              onVote={handleCardClick}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="leaderboard-empty">
          <p>{search ? 'No contestants match your search' : 'No contestants yet'}</p>
        </div>
      )}
    </div>
  );
}

function GenderColumn({ label, list, numberOfWinners, isBetweenRounds, onCardClick }) {
  return (
    <div className="leaderboard-gender-column">
      <h3 className="leaderboard-gender-heading">{label}</h3>
      {list.length === 0 ? (
        <div className="leaderboard-empty">
          <p>No contestants yet</p>
        </div>
      ) : (
        <div className="portrait-grid">
          {list.map((contestant, index) => (
            <PortraitCard
              key={contestant.id}
              contestant={contestant}
              rank={contestant.displayRank || index + 1}
              numberOfWinners={numberOfWinners}
              hideRank={isBetweenRounds}
              hideVotes={isBetweenRounds}
              hideDanger={isBetweenRounds}
              onVote={onCardClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default LeaderboardView;
