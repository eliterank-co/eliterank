import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { usePublicCompetition } from '../../../contexts/PublicCompetitionContext';
import { buildOfficialRules } from '../../../lib/officialRules';
import { colors, spacing, typography, borderRadius, transitions } from '../../../styles/theme';

/**
 * OfficialRulesView — the complete, auto-generated Official Rules document for
 * a single competition.
 *
 * Rendered by CompetitionLayout at the `/.../rules` URL, independent of the
 * competition's current phase, so the rules are reachable and identical in
 * every phase (coming-soon, nominations, voting, between-rounds, results).
 * Content comes from `buildOfficialRules`, derived from the competition's own
 * configuration — nothing is hand-typed or phase-specific.
 */

const styles = {
  container: {
    maxWidth: '760px',
    margin: '0 auto',
    padding: `${spacing[6]} ${spacing[4]} ${spacing[10]}`,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[2],
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    marginBottom: spacing[6],
    transition: `color ${transitions.fast}`,
  },
  eyebrow: {
    color: colors.gold.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: spacing[2],
  },
  title: {
    fontSize: typography.fontSize['4xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.text.primary,
    marginBottom: spacing[2],
    lineHeight: typography.lineHeight.tight,
  },
  subtitle: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    marginBottom: spacing[8],
  },
  toc: {
    padding: spacing[5],
    background: colors.background.card,
    border: `1px solid ${colors.border.primary}`,
    borderRadius: borderRadius.lg,
    marginBottom: spacing[8],
  },
  tocLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: colors.text.tertiary,
    marginBottom: spacing[3],
  },
  tocList: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: `${spacing[1]} ${spacing[4]}`,
  },
  tocLink: {
    color: colors.text.secondary,
    textDecoration: 'none',
    fontSize: typography.fontSize.sm,
    background: 'none',
    border: 'none',
    padding: `${spacing[1]} 0`,
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: `color ${transitions.fast}`,
  },
  section: {
    marginBottom: spacing[7],
    scrollMarginTop: spacing[6],
  },
  h2: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  p: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    marginBottom: spacing[3],
  },
  callout: {
    padding: spacing[4],
    background: colors.background.card,
    border: `1px solid ${colors.gold.primary}`,
    borderRadius: borderRadius.lg,
    marginBottom: spacing[3],
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    fontWeight: typography.fontWeight.medium,
  },
  ul: {
    listStyle: 'disc',
    paddingLeft: spacing[6],
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    marginBottom: spacing[3],
  },
  li: {
    marginBottom: spacing[2],
  },
  policyLinks: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: `${spacing[2]} ${spacing[4]}`,
    marginTop: spacing[2],
    marginBottom: spacing[2],
  },
  policyLink: {
    color: colors.gold.primary,
    textDecoration: 'none',
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  contactBox: {
    marginTop: spacing[2],
    padding: spacing[4],
    background: colors.background.card,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.primary}`,
  },
  contactLine: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    marginBottom: spacing[1],
  },
  link: {
    color: colors.gold.primary,
    textDecoration: 'none',
  },
};

const RELATED_POLICIES = [
  { label: 'Contest Terms', path: '/contest-terms' },
  { label: 'Terms of Use', path: '/terms' },
  { label: 'Privacy Policy', path: '/privacy' },
  { label: 'Cookie Policy', path: '/cookies' },
];

function PolicyLinks({ onNavigate }) {
  return (
    <div style={styles.policyLinks}>
      {RELATED_POLICIES.map((p) => (
        <button
          key={p.path}
          type="button"
          onClick={() => onNavigate(p.path)}
          style={styles.policyLink}
          onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onFocus={(e) => { e.currentTarget.style.textDecoration = 'underline'; }}
          onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
          onBlur={(e) => { e.currentTarget.style.textDecoration = 'none'; }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function ContactBox() {
  return (
    <div style={styles.contactBox}>
      <p style={{ ...styles.contactLine, color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>
        Most Eligible LLC
      </p>
      <p style={styles.contactLine}>c/o Registered Agent</p>
      <p style={styles.contactLine}>1 W Old State Capitol Plaza, Suite 805</p>
      <p style={styles.contactLine}>Springfield, IL 62701</p>
      <p style={styles.contactLine}>
        Email: <a href="mailto:info@eliterank.co" style={styles.link}>info@eliterank.co</a>
      </p>
      <p style={{ ...styles.contactLine, marginBottom: 0 }}>
        Website: <a href="https://eliterank.co" style={styles.link}>eliterank.co</a>
      </p>
    </div>
  );
}

function Block({ block, onNavigate }) {
  switch (block.kind) {
    case 'callout':
      return <div style={styles.callout}>{block.text}</div>;
    case 'ul':
      return (
        <ul style={styles.ul}>
          {block.items.map((item, i) => (
            <li key={i} style={styles.li}>{item}</li>
          ))}
        </ul>
      );
    case 'policyLinks':
      return <PolicyLinks onNavigate={onNavigate} />;
    case 'contact':
      return <ContactBox />;
    case 'p':
    default:
      return <p style={styles.p}>{block.text}</p>;
  }
}

export function OfficialRulesView() {
  const navigate = useNavigate();
  const {
    competition,
    organization,
    orgSlug,
    competitionSlug,
    prizes,
    judges,
    judgingCriteria,
    publicBasePath,
    bonusTasks,
    doubleVoteDays,
    votingRounds,
    nominationPeriods,
  } = usePublicCompetition();

  // Deterministic "back to competition" target — the rules page is deep-linkable
  // (footer link, shared URL), so navigate(-1) could leave the site entirely.
  const basePath = publicBasePath || (competitionSlug
    ? `/${orgSlug}/${competitionSlug}`
    : competition?.id
      ? `/${orgSlug}/id/${competition.id}`
      : null);
  const handleBack = () => (basePath ? navigate(basePath) : navigate(-1));

  const { sections } = buildOfficialRules(competition, {
    organization,
    host: competition?.host,
    prizes,
    judges,
    judgingCriteria,
    bonusTasks,
    doubleVoteDays,
    votingRounds,
    nominationPeriods,
  });

  const scrollTo = (id) => {
    const el = document.getElementById(`rule-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="phase-view official-rules-view">
      <div style={styles.container}>
        <button
          type="button"
          onClick={handleBack}
          style={styles.backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = colors.gold.primary; }}
          onFocus={(e) => { e.currentTarget.style.color = colors.gold.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.secondary; }}
          onBlur={(e) => { e.currentTarget.style.color = colors.text.secondary; }}
        >
          <ArrowLeft size={16} />
          Back to competition
        </button>

        <div style={styles.eyebrow}>Official Rules</div>
        <h1 style={styles.title}>{competition?.name || 'Competition'}</h1>
        <p style={styles.subtitle}>
          The complete, binding rules for this competition. They reflect how this
          competition is configured and apply throughout every phase.
        </p>

        {sections.length > 0 && (
          <nav style={styles.toc} aria-label="Rules contents">
            <div style={styles.tocLabel}>Contents</div>
            <div style={styles.tocList}>
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => scrollTo(s.id)}
                  style={styles.tocLink}
                  onMouseEnter={(e) => { e.currentTarget.style.color = colors.gold.primary; }}
                  onFocus={(e) => { e.currentTarget.style.color = colors.gold.primary; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.secondary; }}
                  onBlur={(e) => { e.currentTarget.style.color = colors.text.secondary; }}
                >
                  {s.title}
                </button>
              ))}
            </div>
          </nav>
        )}

        {sections.map((s) => (
          <section key={s.id} id={`rule-${s.id}`} style={styles.section}>
            <h2 style={styles.h2}>{s.title}</h2>
            {s.blocks.map((block, i) => (
              <Block key={i} block={block} onNavigate={navigate} />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

export default OfficialRulesView;
