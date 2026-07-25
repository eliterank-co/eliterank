import { useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { useNomineeCount } from '../../../hooks/useNomineeCount';
import { Users, Clock } from 'lucide-react';
import { Rewards } from '../components/Rewards';
import { WhoCompetes } from '../components/WhoCompetes';
import { HallOfWinnersSection } from '../components/HallOfWinnersSection';
import { Timeline } from '../components/Timeline';
import { RulesAccordion } from '../components/RulesAccordion';
import { HostCard } from '../components/HostCard';
import { CountdownDisplay } from '../components/CountdownDisplay';
import { CompetitionHeader } from '../components/CompetitionHeader';
import { CharityHighlight } from '../components/CharityHighlight';
import { JudgesSection } from '../components/JudgesSection';
import { HostSection } from '../components/HostSection';

/**
 * Nominations phase view
 * Shows while nominations are open
 * CTA buttons navigate to /:orgSlug/:slug/enter (gamified entry flow)
 *
 * URL Parameters:
 * - ?apply=self  - Auto-redirects to entry flow
 * - ?apply=other - Auto-redirects to entry flow
 * - ?apply=true  - Auto-redirects to entry flow
 */
export function NominationsPhase() {
  const {
    competition, orgSlug, competitionSlug, votingRounds, nominationPeriods,
    about, events, isPreview, sponsors,
  } = usePublicCompetition();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Honor whichever URL scheme the user landed on: slug-based URLs build a
  // slug-based entry path; the ID-based route (used by the dashboard's
  // preview iframe) doesn't expose a slug, so we fall back to the ID route.
  // Without this the iframe's Nominate button would navigate to
  // "/<org>/null/enter" and bounce to the home page.
  const entryPath = competitionSlug
    ? `/${orgSlug}/${competitionSlug}/enter`
    : competition?.id
      ? `/${orgSlug}/id/${competition.id}/enter`
      : null;

  // Path to the full Official Rules page, built the same way as the entry path
  // so it works across slug-based and ID-based URLs.
  const rulesPath = competitionSlug
    ? `/${orgSlug}/${competitionSlug}/rules`
    : competition?.id
      ? `/${orgSlug}/id/${competition.id}/rules`
      : null;

  // Real nominee count — counts every nomination submitted (the `nominees`
  // table), NOT the contestants roster (which excludes nominees who haven't
  // accepted + completed entry). The stat card only appears once there are
  // enough nominees to signal momentum (10+); below that we keep it private.
  const { count: nomineeCount } = useNomineeCount(competition?.id);
  const showNomineeCount = nomineeCount >= 10;

  // The timeline column (Timeline + Charity) only renders once a host has
  // added at least one date or a charity; otherwise the page drops to a
  // single column so the layout never goes lopsided.
  const hasTimelineData = Boolean(
    nominationPeriods?.some(p => p.start_date || p.end_date)
    || votingRounds?.some(r => r.start_date || r.end_date)
    || competition?.nomination_start
    || competition?.nomination_end
    || competition?.finals_date,
  );
  const hasTimelineColumn = hasTimelineData || Boolean(competition?.charity_name);

  const hasSponsors = sponsors && sponsors.length > 0;

  // Auto-redirect if ?apply param is present (skipped in preview so hosts
  // don't get kicked out of the preview by a stray query param).
  useEffect(() => {
    if (isPreview) return;
    if (!entryPath) return;
    const applyParam = searchParams.get('apply');
    if (applyParam) {
      searchParams.delete('apply');
      setSearchParams(searchParams, { replace: true });
      navigate(entryPath);
    }
  }, [searchParams, setSearchParams, navigate, entryPath, isPreview]);

  const handleEnter = () => {
    if (!entryPath) return;
    // In preview, navigate to the entry flow with the preview param preserved
    // so EntryFlow knows to stub submissions and not create a real nominee.
    if (isPreview) {
      navigate(`${entryPath}?preview=nominations`);
      return;
    }
    navigate(entryPath);
  };

  return (
    <div className="phase-view phase-nominations">
      {/* Competition Header - Consistent across all phases */}
      <CompetitionHeader
        badge="Nominations Open"
        badgeVariant="active"
      />

      {/* Main CTA Card */}
      <section className="nomination-cta-card">
        <h3 className="nomination-cta-title">Who Deserves The Spotlight?</h3>
        <div className="nomination-cta-buttons">
          <button
            className="btn btn-primary btn-large"
            onClick={handleEnter}
          >
            Nominate
          </button>
        </div>
      </section>

      {/* Stats Row - Centered below CTA */}
      <section className={`phase-stats ${showNomineeCount ? 'phase-stats-centered' : 'phase-stats-solo'}`}>
        <div className="stat-card stat-card-urgent">
          <div className="stat-icon-wrap">
            <Clock size={20} className="stat-icon" />
          </div>
          <CountdownDisplay label="" />
          <span className="stat-label">Nominations Close</span>
        </div>
        {showNomineeCount && (
          <div className="stat-card">
            <div className="stat-icon-wrap">
              <Users size={20} className="stat-icon" />
            </div>
            <span className="stat-value">{nomineeCount.toLocaleString()}</span>
            <span className="stat-label">Nominees</span>
          </div>
        )}
      </section>

      {/* Who Competes */}
      <section className="phase-section">
        <WhoCompetes />
      </section>

      {/* Hall of Winners - Past Elites */}
      <section className="phase-section">
        <HallOfWinnersSection />
      </section>

      {/* Rewards */}
      <section className="phase-section">
        <Rewards />
      </section>

      {/* Judges */}
      <section className="phase-section">
        <JudgesSection />
      </section>

      <hr className="phase-divider" />

      {/* Hosts — featured card layout, solid card surface to match the
          Timeline / Rules cards on this page (the translucent featured
          background is only appropriate over the Coming Soon hero image). */}
      <section className="phase-section phase-nominations-host">
        <HostCard variant="featured" />
      </section>

      {/* Timeline + Rules — two columns once the host has added timeline/charity
          content, otherwise a single stacked column. */}
      {hasTimelineColumn ? (
        <section className="phase-grid phase-grid-2">
          <div>
            <Timeline />
            <CharityHighlight />
          </div>
          <div className="sidebar-stack">
            <RulesAccordion competition={competition} votingRounds={votingRounds} about={about} events={events} rulesPath={rulesPath} />
          </div>
        </section>
      ) : (
        <section className="sidebar-stack">
          <RulesAccordion competition={competition} votingRounds={votingRounds} about={about} events={events} rulesPath={rulesPath} />
        </section>
      )}

      {/* Sponsors — hosts are already featured above, so suppress them here.
          Matches the boxed-logo layout used on the Coming Soon phase. */}
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

export default NominationsPhase;
