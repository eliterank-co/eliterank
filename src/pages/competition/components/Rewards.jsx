import { useState, useEffect, useCallback } from 'react';
import { Users, Crown, Gift, ChevronLeft, ChevronRight } from 'lucide-react';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { formatCurrency, formatPrizeRecipient, interleaveByGender } from '../../../utils/formatters';
import { PrizeGenderBadge } from '../../../components/ui/PrizeGenderBadge';
import { transformSupabaseImage } from '../../../lib/storageImage';
import { getPrizeValueSummary } from '../../../lib/prizeValue';

// Default rewards when no prizes are uploaded by the host
const DEFAULT_REWARDS = [
  {
    icon: Users,
    title: 'Network Access',
    description: 'Exclusive invites to connect with high-caliber contestants, judges, sponsors and hosts.',
  },
  {
    icon: Crown,
    title: 'Title',
    description: 'Winners hold the title for one year, with media features and exposure opportunities.',
  },
  {
    icon: Gift,
    title: 'Sponsored Prizes',
    description: 'Luxurious products and experiences provided by our gracious sponsors.',
  },
];

const AUTO_ROTATE_INTERVAL = 4000;

/**
 * Carousel sub-component for a list of prizes
 */
function PrizeCarousel({ prizes, title, splitByGender }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const totalPrizes = prizes.length;

  const goTo = useCallback((index) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex(index);
    setTimeout(() => setIsTransitioning(false), 400);
  }, [isTransitioning]);

  const goNext = useCallback(() => {
    if (totalPrizes <= 1) return;
    goTo((currentIndex + 1) % totalPrizes);
  }, [currentIndex, totalPrizes, goTo]);

  const goPrev = useCallback(() => {
    if (totalPrizes <= 1) return;
    goTo((currentIndex - 1 + totalPrizes) % totalPrizes);
  }, [currentIndex, totalPrizes, goTo]);

  // Auto-rotate
  useEffect(() => {
    if (totalPrizes <= 1 || isPaused) return;
    const timer = setInterval(goNext, AUTO_ROTATE_INTERVAL);
    return () => clearInterval(timer);
  }, [totalPrizes, isPaused, goNext]);

  const currentPrize = prizes[currentIndex];
  const recipientLabel = formatPrizeRecipient(currentPrize);

  return (
    <div
      className="rewards-section rewards-carousel"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="rewards-header" style={{ justifyContent: 'center' }}>
        <h3 className="rewards-title" style={{ textAlign: 'center' }}>
          {title}
        </h3>
      </div>

      <div className="rewards-carousel-viewport">
        {totalPrizes > 1 && (
          <button
            className="rewards-carousel-arrow rewards-carousel-arrow-left"
            onClick={goPrev}
            aria-label="Previous prize"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {(() => {
          const Wrapper = currentPrize.external_url ? 'a' : 'div';
          const wrapperProps = currentPrize.external_url
            ? { href: currentPrize.external_url, target: '_blank', rel: 'noopener noreferrer' }
            : {};
          return (
            <Wrapper
              {...wrapperProps}
              className={`rewards-carousel-slide ${isTransitioning ? 'rewards-slide-transitioning' : ''} ${currentPrize.external_url ? 'rewards-carousel-link' : ''}`}
            >
              {currentPrize.image_url ? (
                <div className="rewards-prize-image-wrap">
                  <img
                    src={transformSupabaseImage(currentPrize.image_url, { width: 280, height: 280 })}
                    alt={currentPrize.title}
                    className="rewards-prize-image"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              ) : (
                <div className="reward-icon reward-icon-large">
                  <Gift size={32} />
                </div>
              )}
              <h4 className="reward-name reward-name-featured">{currentPrize.title}</h4>
              {currentPrize.sponsor_name && (
                <span className="rewards-sponsor">by {currentPrize.sponsor_name}</span>
              )}
              <PrizeGenderBadge prize={currentPrize} splitByGender={splitByGender} style={{ marginBottom: 'var(--spacing-sm)' }} />
              {recipientLabel && (
                <span className="rewards-recipient">{recipientLabel}</span>
              )}
              {currentPrize.description && (
                <p className="reward-description">{currentPrize.description}</p>
              )}
            </Wrapper>
          );
        })()}

        {totalPrizes > 1 && (
          <button
            className="rewards-carousel-arrow rewards-carousel-arrow-right"
            onClick={goNext}
            aria-label="Next prize"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      {totalPrizes > 1 && (
        <div className="rewards-carousel-dots">
          {prizes.map((_, i) => (
            <button
              key={i}
              className={`rewards-dot ${i === currentIndex ? 'rewards-dot-active' : ''}`}
              onClick={() => goTo(i)}
              aria-label={`Go to prize ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Rewards display component
 * Shows separate sections for Winner's Prize Package and Contestant Rewards.
 * Falls back to static default reward cards when no prizes exist.
 */
export function Rewards() {
  const { prizes, competition } = usePublicCompetition();
  const splitByGender = !!competition?.winners_split_by_gender;
  const prizeValues = getPrizeValueSummary(competition, prizes);

  const hasInKindPrizes = prizes && prizes.length > 0;
  const hasPrizes = hasInKindPrizes || prizeValues.cash > 0;

  // Split prizes by type, then alternate men/women within each so it reads
  // "male prize, female prize, male prize…" in gender-split competitions.
  const winnerPrizes = hasInKindPrizes ? interleaveByGender(prizes.filter(p => (p.prize_type || 'winner') === 'winner')) : [];
  const contestantRewards = hasInKindPrizes ? interleaveByGender(prizes.filter(p => p.prize_type === 'contestant')) : [];

  // Static fallback — same as before
  if (!hasPrizes) {
    return (
      <div className="rewards-section">
        <div className="rewards-header">
          <h3 className="rewards-title">Rewards</h3>
        </div>
        <div className="rewards-grid">
          {DEFAULT_REWARDS.map((reward) => (
            <div key={reward.title} className="reward-card">
              <div className="reward-icon">
                <reward.icon size={24} />
              </div>
              <h4 className="reward-name">{reward.title}</h4>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const hasBoth = winnerPrizes.length > 0 && contestantRewards.length > 0;

  return (
    <div className={hasBoth ? 'rewards-dual-layout' : undefined}>
      {prizeValues.cash > 0 && (
        <div className="rewards-section" style={{ textAlign: 'center' }}>
          <div className="rewards-header" style={{ justifyContent: 'center' }}>
            <h3 className="rewards-title">Prize Value</h3>
          </div>
          <div className="rewards-grid">
            {[
              ['Cash prize', prizeValues.cash],
              ...(prizeValues.inKind > 0 ? [['In-kind prizes (ARV)', prizeValues.inKind]] : []),
              ...(prizeValues.inKind > 0 ? [['Combined value', prizeValues.combined]] : []),
            ].map(([label, amount]) => (
              <div key={label} className="reward-card">
                <div className="reward-icon"><Gift size={24} /></div>
                <h4 className="reward-name" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {formatCurrency(amount)}
                </h4>
                <p className="reward-description">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {winnerPrizes.length > 0 && (
        <PrizeCarousel
          prizes={winnerPrizes}
          title="Winner's Prize Package"
          splitByGender={splitByGender}
        />
      )}

      {contestantRewards.length > 0 && (
        <PrizeCarousel
          prizes={contestantRewards}
          title="Contestant Rewards"
          splitByGender={splitByGender}
        />
      )}
    </div>
  );
}

export default Rewards;
