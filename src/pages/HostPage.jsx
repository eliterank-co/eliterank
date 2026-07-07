/**
 * HostPage - Public marketing page for prospective hosts.
 *
 * A calm, benefit-led "features by competition type" explorer. Visitors pick a
 * competition format (Public Vote / Hybrid / Judged-Only) and the feature lists
 * filter down to just what applies to that format. Defaults to "All formats",
 * which shows the full catalog grouped into scannable sections.
 *
 * Public route: /host  (see src/routes/index.jsx)
 * Follows the theme-token + inline-styles convention (see CLAUDE.md).
 */

import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Phone, Users, Vote, Gavel, DollarSign, Megaphone, ShieldCheck,
} from 'lucide-react';
import { EliteRankCrown } from '../components/ui';
import { useResponsive } from '../hooks/useResponsive';
import { colors, spacing, typography, borderRadius, transitions, shadows } from '../styles/theme';

// ---------------------------------------------------------------------------
// Format model
// ---------------------------------------------------------------------------

const REAL_FORMATS = ['publicVote', 'hybrid', 'judged'];

const FORMAT_CARDS = [
  { id: 'publicVote', label: 'Public Vote', tagline: 'Popularity decides', note: 'Fans vote, free and paid. Quickest to launch.' },
  { id: 'hybrid', label: 'Hybrid', tagline: 'Votes + judges', note: 'Public voting plus a judging panel for credibility.' },
  { id: 'judged', label: 'Judged-Only', tagline: 'A panel decides', note: 'No public voting. Prestige and expert fields.' },
];

const FORMAT_SPECS = {
  publicVote: { Winner: 'Public votes', Voting: 'Free + paid', 'Entry fee': 'None', Charity: 'Required', Judges: 'None' },
  hybrid: { Winner: 'Judges', Voting: 'Free + paid', 'Entry fee': 'Optional', Charity: 'Optional', Judges: 'Panel of 3' },
  judged: { Winner: 'Judges', Voting: 'None', 'Entry fee': 'Required', Charity: 'Optional', Judges: 'Panel of 3' },
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
    lead: 'Bring people in, then let them run their own profiles.',
    icon: Users,
    features: [
      { name: 'Nominations or applications', blurb: 'A quick nomination (by the contestant or anyone who backs them) or a longer self-submitted application. You approve every entry.', formats: ALL },
      { name: 'Add your own lineup', blurb: 'Skip public nominations and add contestants yourself, from your subscribers or by name and email, and upload their photos.', formats: ALL },
      { name: 'Branded onboarding', blurb: 'Custom qualifying questions in a flow that matches your competition.', formats: ALL },
      { name: 'Self-serve profiles', blurb: 'Contestants manage their own page and track performance in real time.', formats: ALL },
      { name: 'Waitlist capture', blurb: 'Your coming-soon page collects interest before entry opens.', formats: ALL },
    ],
  },
  {
    title: 'Voting & engagement',
    lead: 'Turn attention into daily, repeatable participation.',
    icon: Vote,
    features: [
      { name: 'Free daily voting', blurb: 'One free vote a day keeps fans coming back.', formats: VOTE },
      { name: 'Paid vote packs', blurb: 'Volume-discounted bundles at every price point.', formats: VOTE },
      { name: 'Double-vote days', blurb: 'Scheduled days where every vote counts double.', formats: VOTE },
      { name: 'Bonus votes & gamification', blurb: 'Tasks and challenges award bonus votes, with achievement cards and rank-up alerts.', formats: VOTE },
      { name: 'Video challenges', blurb: 'Post a prompt, contestants respond on camera for bonus votes.', formats: VOTE },
    ],
  },
  {
    title: 'Judging',
    lead: 'Add expert credibility with a scored panel.',
    icon: Gavel,
    features: [
      { name: 'Judge portal', blurb: 'Invite judges by email to score against your criteria, round by round.', formats: JUDGE },
      { name: 'Weighted criteria', blurb: 'Define the rubric and the weight each criterion carries.', formats: JUDGE },
      { name: 'Votes + judges blend', blurb: 'Judge scores and public votes combine into one live leaderboard.', formats: ['hybrid'] },
    ],
  },
  {
    title: 'Monetization',
    lead: 'Multiple revenue streams, designed to stack.',
    icon: DollarSign,
    features: [
      { name: 'Paid vote revenue', blurb: 'The core revenue engine of vote-based competitions.', formats: VOTE },
      { name: 'Entry fees', blurb: 'Free to apply; contestants are charged only after you accept them.', formats: FEE },
      { name: 'Sponsorships', blurb: 'Title, prize, and per-event sponsors pay for visibility.', formats: ALL },
      { name: 'Paid events', blurb: 'VIP tickets and meet-and-greets that double as content.', formats: ALL },
      { name: 'Charity & prizes', blurb: 'Earmark revenue to a cause and award in-kind or cash prizes.', formats: ALL },
    ],
  },
  {
    title: 'Marketing & audience',
    lead: 'Your page and audience, working while you sleep.',
    icon: Megaphone,
    features: [
      { name: 'Self-transforming page', blurb: 'Shifts automatically from entries, to live competition, to winner showcase.', formats: ALL },
      { name: 'Multiple winners', blurb: 'Crown more than one winner, whether a set number of champions or a separate winner for each gender, all featured in the winner showcase.', formats: ALL },
      { name: 'Auto share cards', blurb: 'Shareable social cards generated for votes, advancement, and wins.', formats: ALL },
      { name: 'Fan follows & digests', blurb: 'Fans follow contestants they back, with opt-in weekly digests.', formats: ALL },
      { name: 'Automated updates', blurb: 'Lifecycle emails and in-app updates reach your audience for you.', formats: ALL },
    ],
  },
  {
    title: 'Payouts & control',
    lead: 'Get paid, stay in control, and scale.',
    icon: ShieldCheck,
    features: [
      { name: 'Stripe payouts', blurb: 'Live revenue insights and direct payouts to your own account.', formats: ALL },
      { name: 'Bot & fraud protection', blurb: 'Device-fingerprinted voting keeps results clean.', formats: ALL },
      { name: 'Team roles', blurb: 'Share the dashboard with co-hosts, judges, and sponsors.', formats: ALL },
      { name: 'Run every city', blurb: 'A competition switcher to launch and repeat seasons across metros.', formats: ALL },
    ],
  },
];

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = {
  page: { minHeight: '100vh', background: colors.background.primary, color: colors.text.primary },
  container: { maxWidth: '960px', margin: '0 auto', padding: `${spacing[8]} ${spacing[5]} ${spacing[20]}` },
  backLink: {
    display: 'inline-flex', alignItems: 'center', gap: spacing[2],
    color: colors.text.secondary, fontSize: typography.fontSize.base,
    background: 'none', border: 'none', cursor: 'pointer',
    marginBottom: spacing[10], transition: `color ${transitions.fast}`,
  },

  // Hero
  heroGrid: { display: 'grid', gap: spacing[8], alignItems: 'start' },
  eyebrow: {
    fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold,
    letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.gold.primary,
    marginBottom: spacing[4],
  },
  // "What is a social competition?" panel
  defCard: {
    padding: spacing[6], borderRadius: borderRadius.xl,
    border: `1px solid ${colors.border.primary}`, background: colors.background.secondary,
    display: 'flex', flexDirection: 'column', gap: spacing[3],
  },
  defCrownWrap: {
    width: '56px', height: '56px', borderRadius: borderRadius.lg,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: colors.gold.muted, boxShadow: shadows.goldInset,
  },
  defEyebrow: {
    fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold,
    letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.gold.primary,
  },
  defTitle: {
    fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold,
    color: colors.text.primary, margin: 0,
  },
  defText: {
    fontSize: typography.fontSize.base, color: colors.text.secondary,
    lineHeight: typography.lineHeight.relaxed, margin: 0,
  },
  title: {
    fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: typography.fontWeight.bold,
    lineHeight: typography.lineHeight.tight, margin: 0, marginBottom: spacing[4], maxWidth: '18ch',
  },
  lede: {
    fontSize: typography.fontSize.lg, color: colors.text.secondary,
    lineHeight: typography.lineHeight.relaxed, maxWidth: '54ch', margin: 0,
  },

  // Step label
  stepLabel: {
    fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary, marginTop: spacing[12], marginBottom: spacing[1],
  },
  stepHint: { fontSize: typography.fontSize.sm, color: colors.text.tertiary, marginBottom: spacing[5] },

  // Format chooser
  formatGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: spacing[3],
  },
  formatCard: {
    textAlign: 'left', padding: spacing[5], borderRadius: borderRadius.xl,
    border: `1px solid ${colors.border.primary}`, background: colors.background.secondary,
    cursor: 'pointer', transition: transitions.all, display: 'flex', flexDirection: 'column', gap: spacing[1],
  },
  formatCardActive: {
    border: `1px solid ${colors.gold.primary}`, background: colors.gold.muted, boxShadow: shadows.gold,
  },
  formatLabel: { fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text.primary },
  formatTagline: { fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.gold.primary },
  formatNote: { fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: typography.lineHeight.normal, marginTop: spacing[1] },

  resetRow: { display: 'flex', alignItems: 'center', gap: spacing[3], marginTop: spacing[4], flexWrap: 'wrap' },
  resetText: { fontSize: typography.fontSize.sm, color: colors.text.tertiary },

  // Snapshot strip (shown when a specific format is selected)
  snapshot: {
    display: 'flex', flexWrap: 'wrap', gap: `${spacing[3]} ${spacing[6]}`,
    padding: `${spacing[4]} ${spacing[5]}`, marginTop: spacing[5],
    borderRadius: borderRadius.lg, border: `1px solid ${colors.border.secondary}`,
    background: colors.background.secondary,
  },
  snapItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  snapKey: { fontSize: typography.fontSize.xs, textTransform: 'uppercase', letterSpacing: '0.05em', color: colors.text.tertiary },
  snapVal: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.text.primary },

  // Feature groups
  groupsWrap: {
    columnWidth: '360px', columnGap: spacing[10], marginTop: spacing[12],
  },
  group: {
    breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', pageBreakInside: 'avoid',
    display: 'inline-block', width: '100%', marginBottom: spacing[10],
  },
  groupHead: { display: 'flex', alignItems: 'center', gap: spacing[3], marginBottom: spacing[1] },
  groupIcon: {
    width: '34px', height: '34px', borderRadius: borderRadius.md, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: colors.gold.muted, color: colors.gold.primary,
  },
  groupTitle: { fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.bold, color: colors.text.primary },
  groupLead: { fontSize: typography.fontSize.sm, color: colors.text.tertiary, margin: 0, marginBottom: spacing[4], marginLeft: '46px' },

  featureList: { marginLeft: '46px' },
  featureRow: { display: 'flex', gap: spacing[3], padding: `${spacing[2.5]} 0`, borderTop: `1px solid ${colors.border.secondary}` },
  dot: { width: '6px', height: '6px', borderRadius: '50%', background: colors.gold.primary, flexShrink: 0, marginTop: '8px' },
  featureName: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, marginBottom: '2px' },
  featureBlurb: { fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: typography.lineHeight.normal },

  // CTA
  cta: {
    marginTop: spacing[20], padding: `${spacing[10]} ${spacing[6]}`, borderRadius: borderRadius.xl,
    border: `1px solid ${colors.border.primary}`,
    background: colors.background.secondary, textAlign: 'center',
  },
  ctaTitle: { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, marginBottom: spacing[2] },
  ctaText: {
    fontSize: typography.fontSize.base, color: colors.text.secondary, marginBottom: spacing[6],
    maxWidth: '46ch', marginLeft: 'auto', marginRight: 'auto', lineHeight: typography.lineHeight.relaxed,
  },
  ctaButtons: { display: 'flex', flexWrap: 'wrap', gap: spacing[3], justifyContent: 'center' },
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: spacing[2],
    padding: `${spacing[3]} ${spacing[6]}`, borderRadius: borderRadius.pill,
    background: colors.gold.primary, color: colors.text.inverse,
    fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold,
    border: 'none', cursor: 'pointer', textDecoration: 'none', transition: transitions.all,
  },
  btnSecondary: {
    display: 'inline-flex', alignItems: 'center', gap: spacing[2],
    padding: `${spacing[3]} ${spacing[6]}`, borderRadius: borderRadius.pill,
    background: 'transparent', color: colors.text.primary,
    fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold,
    border: `1px solid ${colors.border.primary}`, cursor: 'pointer', textDecoration: 'none', transition: transitions.all,
  },
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HostPage() {
  const navigate = useNavigate();
  const { isMobile } = useResponsive();
  const [selected, setSelected] = useState('hybrid');
  const specific = selected !== 'all';

  // Filter each group's features to what applies; drop empty groups.
  const visibleGroups = useMemo(() => {
    if (!specific) return GROUPS;
    return GROUPS
      .map((g) => ({ ...g, features: g.features.filter((f) => f.formats.includes(selected)) }))
      .filter((g) => g.features.length > 0);
  }, [selected, specific]);

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

        {/* Hero */}
        <div style={{ ...styles.heroGrid, gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.6fr) minmax(0, 1fr)' }}>
          <div>
            <div style={styles.eyebrow}>For Hosts</div>
            <h1 style={styles.title}>Run a competition your audience can't look away from.</h1>
            <p style={styles.lede}>
              EliteRank gives you everything to launch and run a branded social competition,
              start to finish. Choose how your winner is chosen and see what comes with it.
            </p>
          </div>

          <aside style={styles.defCard}>
            <div style={styles.defCrownWrap}>
              <EliteRankCrown size={32} />
            </div>
            <div style={styles.defEyebrow}>Social competition (n.)</div>
            <h2 style={styles.defTitle}>What you're actually running</h2>
            <p style={styles.defText}>
              A multi-week contest where a curated lineup competes for a title, decided by
              public votes, a judging panel, or a mix of both. Fans follow, vote, and share,
              turning your audience into participants and participants into ambassadors who
              keep promoting your brand long after the final vote.
            </p>
          </aside>
        </div>

        {/* Step 1: format */}
        <div style={styles.stepLabel}>How is your winner chosen?</div>
        <div style={styles.stepHint}>Pick a format, or explore everything the platform can do.</div>

        <div style={styles.formatGrid}>
          {FORMAT_CARDS.map((f) => {
            const active = selected === f.id;
            return (
              <button
                key={f.id}
                onClick={() => setSelected(active ? 'all' : f.id)}
                aria-pressed={active}
                style={{ ...styles.formatCard, ...(active ? styles.formatCardActive : {}) }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.borderColor = colors.border.focus; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.borderColor = colors.border.primary; }}
              >
                <span style={styles.formatLabel}>{f.label}</span>
                <span style={styles.formatTagline}>{f.tagline}</span>
                <span style={styles.formatNote}>{f.note}</span>
              </button>
            );
          })}
        </div>

        {specific ? (
          <div style={styles.snapshot}>
            {Object.entries(FORMAT_SPECS[selected]).map(([k, v]) => (
              <div key={k} style={styles.snapItem}>
                <span style={styles.snapKey}>{k}</span>
                <span style={styles.snapVal}>{v}</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...styles.resetRow, marginTop: spacing[5] }}>
            <span style={styles.resetText}>Everything below is included. Pick a format to narrow it down.</span>
          </div>
        )}

        {/* Feature groups */}
        <div style={styles.groupsWrap}>
          {visibleGroups.map((group) => {
            const Icon = group.icon;
            return (
              <section key={group.title} style={styles.group}>
                <div style={styles.groupHead}>
                  <span style={styles.groupIcon}><Icon size={18} /></span>
                  <h2 style={styles.groupTitle}>{group.title}</h2>
                </div>
                <p style={styles.groupLead}>{group.lead}</p>
                <div style={styles.featureList}>
                  {group.features.map((feature) => (
                    <div key={feature.name} style={styles.featureRow}>
                      <span style={styles.dot} />
                      <div>
                        <div style={styles.featureName}>{feature.name}</div>
                        <div style={styles.featureBlurb}>{feature.blurb}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* CTA */}
        <div style={styles.cta}>
          <div style={styles.ctaTitle}>Let's run your first competition.</div>
          <p style={styles.ctaText}>
            Start building in the self-serve setup flow, or book a quick call and we'll map
            out your first competition together.
          </p>
          <div style={styles.ctaButtons}>
            <button
              onClick={() => navigate('/dashboard')}
              style={styles.btnPrimary}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.gold.light; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = colors.gold.primary; }}
            >
              Launch a competition
              <ArrowRight size={16} />
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
