import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { User, MapPin } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { transformSupabaseImage } from '../../../lib/storageImage';

function buildHostList(competition) {
  const list = [];
  // The creator/host is shown publicly only when show_public_host is on
  // (default true). Co-hosts are unaffected.
  if (competition?.host && competition?.show_public_host !== false) list.push(competition.host);
  const coHostRows = competition?.competition_co_hosts || [];
  for (const row of coHostRows) {
    if (row?.profile) list.push(row.profile);
  }
  return list;
}

function getHostName(host) {
  return `${host.first_name || ''} ${host.last_name || ''}`.trim();
}

/**
 * Host information section (sidebar). Renders the primary host plus any
 * co-hosts side-by-side in a responsive grid.
 */
export function HostSection({ showHosts = true } = {}) {
  const { competition, sponsors } = usePublicCompetition();
  const navigate = useNavigate();
  const location = useLocation();

  const hosts = showHosts ? buildHostList(competition) : [];
  const isPlural = hosts.length > 1;

  // Don't render anything if no hosts AND no sponsors
  if (hosts.length === 0 && (!sponsors || sponsors.length === 0)) {
    return null;
  }

  // Split paid sponsors (who bought a visibility tier) from in-kind partners
  // (who contribute prizes/services, no cash tier). Paid sponsors get top
  // billing with larger tiles; in-kind partners get their own quieter group.
  const isInKind = (s) => (s.tier || '').toLowerCase() === 'inkind';
  const TIER_RANK = { platinum: 0, gold: 1, silver: 2 };
  const paidSponsors = (sponsors || [])
    .filter((s) => !isInKind(s))
    .sort(
      (a, b) =>
        (TIER_RANK[(a.tier || '').toLowerCase()] ?? 99) -
        (TIER_RANK[(b.tier || '').toLowerCase()] ?? 99)
    );
  const inKindSponsors = (sponsors || []).filter(isInKind);

  const renderSponsor = (sponsor) => {
    const hasUrl = !!sponsor.website_url;
    const Wrapper = hasUrl ? 'a' : 'div';
    const wrapperProps = hasUrl
      ? { href: sponsor.website_url, target: '_blank', rel: 'noopener noreferrer' }
      : {};
    return (
      <Wrapper
        key={sponsor.id}
        {...wrapperProps}
        className={`sponsor-item sponsor-tier-${sponsor.tier?.toLowerCase()}`}
      >
        {sponsor.logo_url ? (
          <img src={transformSupabaseImage(sponsor.logo_url, { width: 200, height: 100, resize: 'contain' })} alt={sponsor.name} className="sponsor-logo" />
        ) : (
          <span className="sponsor-name">{sponsor.name}</span>
        )}
        {sponsor.tier && !isInKind(sponsor) && (
          <span className="sponsor-tier">{sponsor.tier}</span>
        )}
      </Wrapper>
    );
  };

  return (
    <div className="host-section">
      {hosts.length > 0 && (
        <div className="host-card">
          <h4 className="section-label">{isPlural ? 'Your Hosts' : 'Your Host'}</h4>
          <div
            className="host-info-grid"
            style={{
              display: 'grid',
              gridTemplateColumns: isPlural ? 'repeat(auto-fit, minmax(200px, 1fr))' : '1fr',
              gap: '0.75rem',
            }}
          >
            {hosts.map((host) => {
              const hostName = getHostName(host);
              return (
                <button
                  key={host.id}
                  className="host-info host-info-clickable"
                  onClick={() => navigate(`/profile/${host.id}${location.search || ''}`)}
                >
                  {host.avatar_url ? (
                    <img src={transformSupabaseImage(host.avatar_url, { width: 150, height: 150 })} alt={hostName} className="host-avatar" />
                  ) : (
                    <div className="host-avatar-placeholder">
                      <User size={48} />
                    </div>
                  )}
                  <div className="host-details">
                    <span className="host-name">{hostName || 'Competition Host'}</span>
                    {host.bio && (
                      <span className="host-title">
                        {host.bio.length > 100 ? host.bio.substring(0, 100) + '...' : host.bio}
                      </span>
                    )}
                    {host.city && (
                      <span className="host-location">
                        <MapPin size={12} />
                        {host.city}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Sponsors — paid sponsors up top with greater presence, in-kind
          partners in their own group below */}
      {sponsors?.length > 0 && (
        <div className="sponsors-card">
          <h4 className="section-label">Sponsors</h4>

          {paidSponsors.length > 0 && (
            <div className="sponsors-list sponsors-list-paid">
              {paidSponsors.map(renderSponsor)}
            </div>
          )}

          {inKindSponsors.length > 0 && (
            <div className="sponsors-inkind">
              <h5 className="sponsors-subheading">In-Kind Partners</h5>
              <div className="sponsors-list sponsors-list-inkind">
                {inKindSponsors.map(renderSponsor)}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

export default HostSection;
