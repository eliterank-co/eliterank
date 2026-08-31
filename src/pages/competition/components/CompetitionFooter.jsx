import { Link } from 'react-router-dom';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { EliteRankCrown } from '../../../components/ui/icons';
import { transformSupabaseImage, getOrgLogo } from '../../../lib/storageImage';
import { buildHostLinks } from './hostLinks';

/**
 * Competition page footer showing organization and EliteRank branding, plus a
 * persistent row of policy links.
 *
 * Rendered at the CompetitionLayout level so the policies — this competition's
 * auto-generated Official Rules, plus the platform-wide Contest Terms, Terms of
 * Use, and Privacy Policy — are reachable in every phase and view.
 */
export function CompetitionFooter() {
  const { organization, orgSlug, competitionSlug, competition, publicBasePath } = usePublicCompetition();
  const hostLinks = buildHostLinks(organization);
  const orgLogo = getOrgLogo(organization);

  // Per-competition Official Rules path — built the same way across slug-based
  // and ID-based URLs so it resolves regardless of how the user arrived.
  const rulesPath = publicBasePath
    ? `${publicBasePath}/rules`
    : competitionSlug
    ? `/${orgSlug}/${competitionSlug}/rules`
    : competition?.id
      ? `/${orgSlug}/id/${competition.id}/rules`
      : null;

  return (
    <footer className="competition-footer">
      <div className="competition-footer-items">
        {orgLogo && (
          <div className="competition-footer-item">
            <div className="competition-footer-logo">
              <img src={transformSupabaseImage(orgLogo, { width: 150, height: 60, resize: 'contain' })} alt={organization.name} />
            </div>
            <div className="competition-footer-text">
              <span className="competition-footer-label">Presented by</span>
              <span className="competition-footer-name">{organization.name}</span>
            </div>
          </div>
        )}

        <div className="competition-footer-item">
          <div className="competition-footer-logo competition-footer-logo-eliterank">
            <EliteRankCrown size={20} />
          </div>
          <div className="competition-footer-text">
            <span className="competition-footer-label">Powered by</span>
            <span className="competition-footer-name">EliteRank</span>
          </div>
        </div>
      </div>

      <nav className="competition-footer-legal" aria-label="Policies">
        {rulesPath && <Link to={rulesPath} className="competition-footer-legal-link">Official Rules</Link>}
        <Link to="/contest-terms" className="competition-footer-legal-link">Contest Terms</Link>
        <Link to="/terms" className="competition-footer-legal-link">Terms of Use</Link>
        <Link to="/privacy" className="competition-footer-legal-link">Privacy</Link>
      </nav>

      {hostLinks.length > 0 && (
        <div className="competition-footer-socials">
          {hostLinks.map(({ key, label, Icon, url }) => (
            <a
              key={key}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="competition-footer-social"
              aria-label={label}
              title={label}
            >
              <Icon size={24} />
            </a>
          ))}
        </div>
      )}
    </footer>
  );
}

export default CompetitionFooter;
