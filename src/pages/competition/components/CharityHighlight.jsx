import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { transformSupabaseImage } from '../../../lib/storageImage';

/**
 * Charity proceeds highlight section
 * Shows charity logo (clickable to website) centered with a label
 * Only renders if competition has charity_name set
 */
export function CharityHighlight() {
  const { competition } = usePublicCompetition();

  const charityName = competition?.charity_name;
  const charityLogoUrl = competition?.charity_logo_url;
  const charityWebsiteUrl = competition?.charity_website_url;
  const charityPct = Number(competition?.charity_percentage);
  const hasPct = Number.isFinite(charityPct) && charityPct > 0;

  if (!charityName) return null;

  const label = hasPct
    ? `${charityPct}% of Proceeds Benefit`
    : 'A Portion of Proceeds Benefits';

  const content = (
    <div className="charity-highlight-inner">
      <span className="charity-highlight-label">{label}</span>
      {charityLogoUrl ? (
        <img
          src={transformSupabaseImage(charityLogoUrl, { width: 400, resize: 'contain' })}
          alt={charityName}
          className="charity-highlight-logo"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span className="charity-highlight-name">{charityName}</span>
      )}
    </div>
  );

  if (charityWebsiteUrl) {
    return (
      <div className="charity-highlight">
        <a
          href={charityWebsiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="charity-highlight-link"
        >
          {content}
        </a>
      </div>
    );
  }

  return (
    <div className="charity-highlight">
      {content}
    </div>
  );
}

export default CharityHighlight;
