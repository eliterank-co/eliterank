import { useEffect, useState } from 'react';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { EliteRankCrown } from '../../../components/ui/icons';
import { isDoubleVoteDayForCompetition } from '../../../lib/doubleVoteDay';
import { transformSupabaseImage, getOrgLogo } from '../../../lib/storageImage';

/**
 * Consistent competition header across all phases
 * Shows organization branding, season, name, and description
 *
 * Pass `compact` for secondary views (leaderboard, prizes) where the header
 * should take less vertical space so the primary content is above the fold.
 * Pass `iconOnly` to prefer the square icon logo over the wide wordmark while
 * keeping the full header layout (e.g. on the voting phase).
 */
export function CompetitionHeader({ badge, badgeIcon: BadgeIcon, badgeVariant = 'default', compact = false, iconOnly = false }) {
  const { competition, organization, about } = usePublicCompetition();

  // Resolve double-vote-day status so the phase badge can flip to a
  // green "DOUBLE DAY · ALL VOTES 2×" overlay during a host-scheduled
  // double day. Re-polls every 60s so the badge auto-flips at the
  // competition's local midnight without requiring a page refresh.
  const [isDoubleVoteDay, setIsDoubleVoteDay] = useState(false);
  useEffect(() => {
    if (!competition?.id) return undefined;
    let cancelled = false;
    const refresh = () => {
      isDoubleVoteDayForCompetition(competition.id).then((flag) => {
        if (!cancelled) setIsDoubleVoteDay(!!flag);
      });
    };
    refresh();
    const handle = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [competition?.id]);

  // Determine badge variant class (overridden to green 'active' style
  // during a double day so the visual cue matches the inline panel).
  const effectiveVariant = isDoubleVoteDay ? 'active' : badgeVariant;
  const badgeClass = {
    default: '',
    active: 'phase-badge-active',
    live: 'phase-badge-live',
    complete: 'phase-badge-complete',
  }[effectiveVariant] || '';
  const effectiveBadge = isDoubleVoteDay ? 'Double Day · All Votes 2×' : badge;

  // Use the single canonical host-uploaded logo everywhere (same file the
  // footer and listings use) so the org's branding is consistent across the
  // page rather than mixing the square mark and the wide wordmark.
  const headerLogo = getOrgLogo(organization);
  const websiteUrl = organization?.website_url;

  const logoContent = headerLogo ? (
    <img src={transformSupabaseImage(headerLogo, { width: 300, resize: 'contain' })} alt={organization.name} />
  ) : (
    <EliteRankCrown size={80} />
  );

  return (
    <section className={`competition-header${compact ? ' competition-header-compact' : ''}${iconOnly && !compact ? ' competition-header-icon-only' : ''}`}>
      {/* Organization Branding */}
      <div className="org-branding">
        <span className="org-presented-by">Presented by</span>
        <div className="org-logo">
          {websiteUrl ? (
            <a href={websiteUrl} target="_blank" rel="noopener noreferrer">
              {logoContent}
            </a>
          ) : (
            logoContent
          )}
        </div>
      </div>

      {/* Season Tag */}
      {competition?.season && (
        <span className="competition-season">Season {competition.season}</span>
      )}

      {/* Competition Name */}
      <h1 className="competition-name">{competition?.name || 'Most Eligible'}</h1>

      {/* City */}
      {competition?.city && (
        <h2 className="competition-city">{competition.city}</h2>
      )}

      {/* Description — hidden in compact header to save vertical space */}
      {about?.description && !compact && (
        <p className="competition-description">{about.description}</p>
      )}

      {/* Phase Badge */}
      {effectiveBadge && (
        <div className={`phase-badge ${badgeClass}`}>
          {BadgeIcon && !isDoubleVoteDay && <BadgeIcon size={14} />}
          <span className="badge-dot" />
          {effectiveBadge}
        </div>
      )}
    </section>
  );
}

export default CompetitionHeader;
