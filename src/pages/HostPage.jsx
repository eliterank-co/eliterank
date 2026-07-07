/**
 * HostPage - Public marketing page for prospective hosts.
 *
 * A focused, interactive "features by competition type" explorer. Visitors pick
 * a competition format (Public Vote / Hybrid / Judged-Only) and the page
 * highlights the features, engagement mechanics, and revenue channels that apply
 * to that format while dimming the ones that do not. Defaults to "All formats".
 *
 * Public route: /host  (see src/routes/index.jsx)
 * Follows the theme-token + inline-styles convention (see CLAUDE.md).
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Phone } from 'lucide-react';
import { colors, spacing, typography, borderRadius, transitions, shadows } from '../styles/theme';

// ---------------------------------------------------------------------------
// Format model
// ---------------------------------------------------------------------------

const FORMATS = [
  { id: 'all', label: 'All formats', short: 'All', tagline: 'See everything the platform can do' },
  { id: 'publicVote', label: 'Public Vote', short: 'Public', tagline: 'Popularity decides' },
  { id: 'hybrid', label: 'Hybrid', short: 'Hybrid', tagline: 'Votes + judges' },
  { id: 'judged', label: 'Judged-Only', short: 'Judged', tagline: 'A panel decides, no voting' },
];

// The three real formats, in the order shown on availability pills.
const REAL_FORMATS = ['publicVote', 'hybrid', 'judged'];

// Attribute matrix shown when a specific format is selected.
const FORMAT_SPECS = {
  publicVote: {
    winner: 'Public votes', voting: 'Free + paid', entryFee: 'None',
    charity: 'Required', judges: 'None', bestFor: 'Quick start & viral growth',
  },
  hybrid: {
    winner: 'Judges', voting: 'Free + paid', entryFee: 'Optional',
    charity: 'Optional', judges: 'Panel of 3', bestFor: 'Credibility + engagement',
  },
  judged: {
    winner: 'Judges', voting: 'None', entryFee: 'Required',
    charity: 'Optional', judges: 'Panel of 3', bestFor: 'Prestige & expert fields',
  },
};

// Applicability shorthands.
const ALL = REAL_FORMATS;
const VOTE = ['publicVote', 'hybrid'];   // vote-based mechanics
const JUDGE = ['hybrid', 'judged'];      // judged formats
const FEE = ['hybrid', 'judged'];        // entry-fee formats

// ---------------------------------------------------------------------------
// Feature groups
// ---------------------------------------------------------------------------

const GROUPS = [
  {
    title: 'Entry & contestants',
    features: [
      { name: 'Flexible entry', blurb: 'Two ways in: a quick nomination, submitted by the contestant or anyone who backs them, or a longer application the contestant completes themselves. You review and approve every entry.', formats: ALL },
      { name: 'Branded onboarding', blurb: 'Custom qualifying questions and a branded flow that matches your competition.', formats: ALL },
      { name: 'Self-serve contestant profiles', blurb: 'Contestants build and manage their own page, photos, and pitch, and track their performance in real time.', formats: ALL },
      { name: 'Waitlist capture', blurb: 'Your coming-soon page collects interested nominees, fans, and sponsors before entry even opens.', formats: ALL },
    ],
  },
  {
    title: 'Voting & engagement',
    features: [
      { name: 'Free daily voting', blurb: 'One free vote a day keeps fans coming back all season.', formats: VOTE },
      { name: 'Tiered paid vote packs', blurb: 'Volume-discounted vote bundles that sell at every price point.', formats: VOTE },
      { name: 'Double-vote days', blurb: 'Schedule days where every vote counts double to spike engagement.', formats: VOTE },
      { name: 'Per-round vote resets', blurb: 'Reset tallies between advancement rounds to keep each round competitive.', formats: VOTE },
      { name: 'Bonus-vote tasks & gamification', blurb: 'Sharing, referrals, and custom challenges award bonus votes. Contestants earn achievement cards and rank-up alerts as they climb.', formats: VOTE },
      { name: 'Video challenges', blurb: 'Post a prompt, contestants respond on camera for bonus votes, you approve.', formats: VOTE },
    ],
  },
  {
    title: 'Judging',
    features: [
      { name: 'Judge portal', blurb: 'Invite judges by email to score contestants against your weighted criteria, round by round.', formats: JUDGE },
      { name: 'Weighted judging criteria', blurb: 'Define the rubric and the weight each criterion carries toward the result.', formats: JUDGE },
      { name: 'Live votes + judges blend', blurb: 'Judge scores and public votes combine into one live leaderboard.', formats: ['hybrid'] },
    ],
  },
  {
    title: 'Monetization',
    features: [
      { name: 'Paid vote revenue', blurb: 'The core revenue engine of vote-based competitions.', formats: VOTE },
      { name: 'Entry fees', blurb: 'Applying is free; contestants are charged only after you accept them.', formats: FEE },
      { name: 'Sponsorships', blurb: 'Title, prize, and per-event sponsors pay for visibility. You own the relationships.', formats: ALL },
      { name: 'Paid events', blurb: 'VIP tickets, after-parties, and meet-and-greets that double as content.', formats: ALL },
      { name: 'Charity overlay', blurb: 'Earmark a share of revenue to a cause. Required for pure public-vote formats.', formats: ALL },
      { name: 'Prize pool', blurb: 'In-kind or cash prizes, funded by your brand or sponsors.', formats: ALL },
    ],
  },
  {
    title: 'Marketing & audience',
    features: [
      { name: 'Auto-transforming public page', blurb: 'Your page shifts automatically from entries, to live competition, to winner showcase.', formats: ALL },
      { name: 'Auto-generated share cards', blurb: 'Shareable social cards generated for votes, advancement, and wins.', formats: ALL },
      { name: 'Fan follow + weekly digests', blurb: 'Fans follow the contestants they back, with opt-in weekly digests that keep them returning.', formats: ALL },
      { name: 'Automated email + in-app updates', blurb: 'Lifecycle updates reach your audience without you lifting a finger.', formats: ALL },
    ],
  },
  {
    title: 'Payouts & control',
    features: [
      { name: 'Co-hosts + team roles', blurb: 'Share the dashboard with defined roles for hosts, co-hosts, judges, and sponsors.', formats: ALL },
      { name: 'Email deliverability log', blurb: 'A per-competition delivery log shows exactly what went out and to whom.', formats: ALL },
      { name: 'Real-time revenue + Stripe payouts', blurb: 'Live revenue insights and direct payouts to your own Stripe account.', formats: ALL },
      { name: 'Bot & fraud protection', blurb: 'Device-fingerprinted voting and safeguards keep results clean.', formats: ALL },
      { name: 'Run every city from one account', blurb: 'A built-in competition switcher lets you launch and repeat seasons across metros.', formats: ALL },
      { name: 'Auto-generated rules + publish locks', blurb: 'Official rules generate automatically and settings lock at publish.', formats: ALL },
    ],
  },
];

const TOTAL_FEATURES = GROUPS.reduce((n, g) => n + g.features.length, 0);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: {
    minHeight: '100vh',
    background: colors.background.primary,
    color: colors.text.primary,
  },
  container: {
    maxWidth: '1040px',
    margin: '0 auto',
    padding: `${spacing[8]} ${spacing[4]} ${spacing[16]}`,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[2],
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    marginBottom: spacing[8],
    transition: `color ${transitions.fast}`,
  },
  eyebrow: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: colors.gold.primary,
    marginBottom: spacing[3],
  },
  title: {
    fontSize: typography.fontSize['5xl'],
    fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.tight,
    margin: 0,
    marginBottom: spacing[3],
  },
  lede: {
    fontSize: typography.fontSize.lg,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.relaxed,
    maxWidth: '620px',
    marginBottom: spacing[8],
  },
  selectorLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.secondary,
    marginBottom: spacing[3],
  },
  selectorRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: spacing[2],
    marginBottom: spacing[6],
  },
  chipBase: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: spacing[0.5],
    padding: `${spacing[2.5]} ${spacing[4]}`,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.primary}`,
    background: colors.background.secondary,
    cursor: 'pointer',
    transition: transitions.all,
    minWidth: '120px',
  },
  chipActive: {
    border: `1px solid ${colors.gold.primary}`,
    background: colors.gold.muted,
    boxShadow: shadows.goldInset,
  },
  chipLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  chipTagline: {
    fontSize: typography.fontSize.xs,
    color: colors.text.tertiary,
  },
  // Format summary bar (shown when a specific format is selected)
  summaryBar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: spacing[3],
    padding: spacing[5],
    borderRadius: borderRadius.xl,
    border: `1px solid ${colors.border.primary}`,
    background: colors.background.secondary,
    marginBottom: spacing[8],
  },
  summaryItem: { display: 'flex', flexDirection: 'column', gap: spacing[1] },
  summaryKey: {
    fontSize: typography.fontSize.xs,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: colors.text.tertiary,
  },
  summaryVal: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  countPill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[2],
    padding: `${spacing[2]} ${spacing[4]}`,
    borderRadius: borderRadius.pill,
    background: colors.gold.muted,
    color: colors.gold.primary,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    marginBottom: spacing[8],
  },
  groupTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: colors.gold.primary,
    paddingBottom: spacing[2],
    borderBottom: `1px solid ${colors.gold.muted}`,
    marginBottom: spacing[4],
    marginTop: spacing[8],
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
    gap: spacing[3],
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: spacing[2],
    padding: spacing[4],
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.primary}`,
    background: colors.background.card,
    transition: transitions.all,
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing[2],
  },
  cardName: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
  },
  cardBlurb: {
    fontSize: typography.fontSize.sm,
    color: colors.text.secondary,
    lineHeight: typography.lineHeight.normal,
  },
  checkDot: {
    flexShrink: 0,
    width: '22px',
    height: '22px',
    borderRadius: borderRadius.full,
    background: colors.gold.muted,
    color: colors.gold.primary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillRow: { display: 'flex', flexWrap: 'wrap', gap: spacing[1], marginTop: 'auto', paddingTop: spacing[2] },
  pill: {
    fontSize: '0.6875rem',
    fontWeight: typography.fontWeight.semibold,
    padding: `2px ${spacing[2]}`,
    borderRadius: borderRadius.pill,
    letterSpacing: '0.02em',
  },
  notAvailTag: {
    fontSize: typography.fontSize.xs,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  // CTA
  cta: {
    marginTop: spacing[16],
    padding: spacing[8],
    borderRadius: borderRadius.xl,
    border: `1px solid ${colors.border.primary}`,
    background: colors.background.secondary,
    textAlign: 'center',
  },
  ctaTitle: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    marginBottom: spacing[2],
  },
  ctaText: {
    fontSize: typography.fontSize.base,
    color: colors.text.secondary,
    marginBottom: spacing[6],
    maxWidth: '480px',
    marginLeft: 'auto',
    marginRight: 'auto',
    lineHeight: typography.lineHeight.relaxed,
  },
  ctaButtons: { display: 'flex', flexWrap: 'wrap', gap: spacing[3], justifyContent: 'center' },
  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[2],
    padding: `${spacing[3]} ${spacing[6]}`,
    borderRadius: borderRadius.pill,
    background: colors.gold.primary,
    color: colors.text.inverse,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    border: 'none',
    cursor: 'pointer',
    textDecoration: 'none',
    transition: transitions.all,
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[2],
    padding: `${spacing[3]} ${spacing[6]}`,
    borderRadius: borderRadius.pill,
    background: 'transparent',
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    border: `1px solid ${colors.border.primary}`,
    cursor: 'pointer',
    textDecoration: 'none',
    transition: transitions.all,
  },
};

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function AvailabilityPills({ formats }) {
  return (
    <div style={styles.pillRow}>
      {REAL_FORMATS.map((f) => {
        const on = formats.includes(f);
        const label = FORMATS.find((x) => x.id === f).short;
        return (
          <span
            key={f}
            style={{
              ...styles.pill,
              background: on ? colors.gold.muted : 'transparent',
              color: on ? colors.gold.primary : colors.text.muted,
              border: `1px solid ${on ? 'transparent' : colors.border.secondary}`,
            }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function FeatureCard({ feature, selected }) {
  const applicable = selected === 'all' || feature.formats.includes(selected);
  const specific = selected !== 'all';

  return (
    <div
      style={{
        ...styles.card,
        opacity: applicable ? 1 : 0.4,
        borderColor: applicable && specific ? colors.border.focus : styles.card.border,
        boxShadow: applicable && specific ? shadows.goldInset : 'none',
        filter: applicable ? 'none' : 'grayscale(0.5)',
      }}
    >
      <div style={styles.cardHead}>
        <span style={styles.cardName}>{feature.name}</span>
        {applicable && specific && (
          <span style={styles.checkDot}><Check size={13} strokeWidth={3} /></span>
        )}
      </div>
      <span style={styles.cardBlurb}>{feature.blurb}</span>
      {applicable && !specific && <AvailabilityPills formats={feature.formats} />}
      {!applicable && (
        <span style={{ ...styles.notAvailTag, marginTop: 'auto', paddingTop: spacing[2] }}>
          Not part of this format
        </span>
      )}
      {applicable && specific && <AvailabilityPills formats={feature.formats} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HostPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState('all');

  const applicableCount = useMemo(() => {
    if (selected === 'all') return TOTAL_FEATURES;
    return GROUPS.reduce(
      (n, g) => n + g.features.filter((f) => f.formats.includes(selected)).length,
      0,
    );
  }, [selected]);

  const spec = selected !== 'all' ? FORMAT_SPECS[selected] : null;
  const selectedLabel = FORMATS.find((f) => f.id === selected).label;

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button
          onClick={() => navigate('/')}
          style={styles.backLink}
          onMouseEnter={(e) => { e.currentTarget.style.color = colors.gold.primary; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = colors.text.secondary; }}
        >
          <ArrowLeft size={16} />
          Back to EliteRank
        </button>

        <div style={styles.eyebrow}>For Hosts</div>
        <h1 style={styles.title}>Build your competition, your way.</h1>
        <p style={styles.lede}>
          EliteRank is a system, not a template. Pick how your winner is chosen and see exactly
          which features, engagement mechanics, and revenue channels come with it.
        </p>

        <div style={styles.selectorLabel}>Choose a format</div>
        <div style={styles.selectorRow} role="tablist" aria-label="Competition format">
          {FORMATS.map((f) => {
            const active = selected === f.id;
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={active}
                onClick={() => setSelected(f.id)}
                style={{ ...styles.chipBase, ...(active ? styles.chipActive : {}) }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = colors.border.focus; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = colors.border.primary; }}
              >
                <span style={styles.chipLabel}>{f.label}</span>
                <span style={styles.chipTagline}>{f.tagline}</span>
              </button>
            );
          })}
        </div>

        {spec && (
          <div style={styles.summaryBar}>
            {[
              ['Winner', spec.winner],
              ['Voting', spec.voting],
              ['Entry fee', spec.entryFee],
              ['Charity', spec.charity],
              ['Judges', spec.judges],
              ['Best for', spec.bestFor],
            ].map(([k, v]) => (
              <div key={k} style={styles.summaryItem}>
                <span style={styles.summaryKey}>{k}</span>
                <span style={styles.summaryVal}>{v}</span>
              </div>
            ))}
          </div>
        )}

        <div style={styles.countPill}>
          {selected === 'all'
            ? `${TOTAL_FEATURES} features across every format`
            : `${applicableCount} of ${TOTAL_FEATURES} features available in ${selectedLabel}`}
        </div>

        {GROUPS.map((group) => (
          <section key={group.title}>
            <h2 style={styles.groupTitle}>{group.title}</h2>
            <div style={styles.grid}>
              {group.features.map((feature) => (
                <FeatureCard key={feature.name} feature={feature} selected={selected} />
              ))}
            </div>
          </section>
        ))}

        <div style={styles.cta}>
          <div style={styles.ctaTitle}>Let's run your first competition.</div>
          <p style={styles.ctaText}>
            Start building in the self-serve setup flow, or book a quick call and we'll map out
            your first competition together.
          </p>
          <div style={styles.ctaButtons}>
            <button
              onClick={() => navigate('/dashboard')}
              style={styles.btnPrimary}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.gold.light; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.gold.primary; }}
            >
              Launch a competition
            </button>
            <a
              href="mailto:info@eliterank.co?subject=Booking%20a%20call"
              style={styles.btnSecondary}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.border.focus; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.border.primary; }}
            >
              <Phone size={16} />
              Book a call
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
