import { useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { Bell, Check, Loader } from 'lucide-react';
import { HallOfWinnersSection } from '../components/HallOfWinnersSection';
import { HostSection } from '../components/HostSection';
import { CompetitionHeader } from '../components/CompetitionHeader';
import { CountdownDisplay } from '../components/CountdownDisplay';
import { Timeline } from '../components/Timeline';
import { Rewards } from '../components/Rewards';
import { JudgesSection } from '../components/JudgesSection';
import { CharityHighlight } from '../components/CharityHighlight';
import { HostCard } from '../components/HostCard';
import { getCompetitionImage } from '../../../utils/cityImages';
import { useAuthStore } from '../../../stores';
import { useCompetitionSubscription } from '../../../features/competition/useCompetitionSubscription';

/**
 * Coming Soon phase view
 * Shows before nominations open
 */
export function ComingSoonPhase() {
  const {
    competition, sponsors, judges, countdown,
    nominationPeriods, votingRounds,
  } = usePublicCompetition();

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const {
    isSubscribed, loading: subLoading, error: subError, subscribe,
  } = useCompetitionSubscription(competition?.id);

  // If the user just came back from /login with ?subscribe=1, auto-subscribe
  // once their auth state is known and the competition is loaded.
  const autoSubscribedRef = useRef(false);
  useEffect(() => {
    if (autoSubscribedRef.current) return;
    if (searchParams.get('subscribe') !== '1') return;
    if (!competition?.id) return;
    if (!isAuthenticated) return;
    autoSubscribedRef.current = true;
    subscribe().finally(() => {
      const next = new URLSearchParams(searchParams);
      next.delete('subscribe');
      setSearchParams(next, { replace: true });
    });
  }, [isAuthenticated, competition?.id, searchParams, setSearchParams, subscribe]);

  const handleSubscribeClick = useCallback(() => {
    if (subLoading || isSubscribed) return;
    if (!isAuthenticated) {
      const returnTo = `${window.location.pathname}?subscribe=1`;
      navigate(`/login?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    subscribe();
  }, [isAuthenticated, isSubscribed, subLoading, navigate, subscribe]);

  const hasSponsors = sponsors && sponsors.length > 0;
  const hasHost = Boolean(competition?.host);
  const hasJudges = judges && judges.length > 0;
  const hasCountdown = Boolean(countdown && !countdown.isExpired);
  const hasCharity = Boolean(competition?.charity_name);

  // Host-upload competitions have no nomination period — the next public
  // milestone is voting opening, so the teaser copy points there instead.
  const isHostUpload = (competition?.entry_type || competition?.entryType) === 'host_upload';
  const opensLabel = isHostUpload ? 'voting opens' : 'nominations open';
  const opensInLabel = isHostUpload ? 'Voting opens in' : 'Nominations open in';

  // Timeline renders nothing unless at least one phase has dates.
  const hasTimeline = Boolean(
    nominationPeriods?.some(p => p.start_date || p.end_date)
    || votingRounds?.some(r => r.start_date || r.end_date)
    || competition?.nomination_start
    || competition?.nomination_end
    || competition?.finals_date,
  );

  const heroImage = getCompetitionImage(competition || {});

  return (
    <div
      className="phase-view phase-coming-soon"
      style={heroImage ? { '--hero-image': `url("${heroImage}")` } : undefined}
    >
      {/* Hero — header + countdown over the page-wide backdrop */}
      <section className="phase-coming-soon-hero">
        <div className="phase-coming-soon-hero-inner">
          <CompetitionHeader badge="Coming Soon" badgeVariant="default" />
          {hasCountdown && (
            <div className="phase-coming-soon-countdown">
              <CountdownDisplay label={opensInLabel} large showPlaceholder={false} />
            </div>
          )}
        </div>
      </section>

      {/* Primary CTA — subscribe to nomination-open notification */}
      <section className="phase-coming-soon-cta">
        <button
          className="phase-cta-primary"
          onClick={handleSubscribeClick}
          disabled={subLoading || isSubscribed}
          aria-pressed={isSubscribed}
        >
          {isSubscribed ? (
            <>
              <Check size={18} />
              <span className="phase-cta-primary-label">You'll be notified when {opensLabel}</span>
            </>
          ) : subLoading ? (
            <>
              <Loader size={18} className="loading-spinner" />
              <span className="phase-cta-primary-label">Working…</span>
            </>
          ) : (
            <>
              <Bell size={18} />
              <span className="phase-cta-primary-label">Get notified when {opensLabel}</span>
            </>
          )}
        </button>
        {subError && (
          <p className="phase-coming-soon-cta-error" role="alert">{subError}</p>
        )}
      </section>

      {/* Host credibility — full card variant */}
      {hasHost && (
        <section className="phase-section phase-coming-soon-host">
          <HostCard variant="featured" />
        </section>
      )}

      {/* Journey timeline */}
      {hasTimeline && (
        <section className="phase-coming-soon-stakes">
          <div className="phase-coming-soon-stakes-timeline">
            <Timeline />
          </div>
        </section>
      )}

      {/* Rewards — host-uploaded prizes if any, otherwise the default reward cards */}
      <section className="phase-section">
        <Rewards />
      </section>

      {/* Judges credibility */}
      {hasJudges && (
        <section className="phase-section">
          <JudgesSection />
        </section>
      )}

      {/* Charity tie-in */}
      {hasCharity && (
        <section className="phase-section">
          <CharityHighlight />
        </section>
      )}

      {/* Hall of Winners — past champions / cross-comp prestige */}
      <section className="phase-section">
        <HallOfWinnersSection />
      </section>

      {/* Sponsors — hosts are already featured above, so suppress them here */}
      {hasSponsors && (
        <>
          <hr className="phase-divider" />
          <section className="phase-section">
            <HostSection showHosts={false} />
          </section>
        </>
      )}
    </div>
  );
}

export default ComingSoonPhase;
