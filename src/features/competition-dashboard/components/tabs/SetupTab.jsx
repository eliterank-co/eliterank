import React, { useState, useEffect } from 'react';
import { Calendar, Lock, CheckCircle, Users } from 'lucide-react';
import { Panel } from '../../../../components/ui';
import { colors, spacing, typography } from '../../../../styles/theme';
import { useResponsive } from '../../../../hooks/useResponsive';
import TimelineSettings from '../TimelineSettings';
import JudgingPanel from '../JudgingPanel';
import JudgesManager from '../JudgesManager';
import CompetitionSummaryCard from '../CompetitionSummaryCard';
import HostsPanel from '../HostsPanel';
import { isFieldEditable } from '../../../../utils/fieldEditability';
import { NominationFormEditor } from '../settings';
import LockedSection from './setup/LockedSection';
import SponsorsSection from './setup/SponsorsSection';
import CharitySection from './setup/CharitySection';

// Top-to-bottom order of every Setup section, aligned with the launch
// checklist: Timeline → Nomination form → Judging (judges, criteria, results,
// charity), then the remaining setup extras (sponsors) below.
//
// `sectionStyle` maps each id to a CSS flex `order`, so THIS list — not DOM
// source order — is the single source of truth for vertical ordering. That
// lets us realign sections without physically moving large JSX blocks.
// Sections that don't apply (no judges / no charity) sort to the bottom.
//
// The participation-driving sections (events, double-vote days, bonus votes,
// video prompts) now live on their own EngagementTab.
const SECTION_ORDER = [
  'competitionDetails',
  // Locks at publish — get these right before going public (grouped first).
  'nominationForm',
  'timeline',
  'judgingCriteria',
  'charity',
  // Editable anytime — adjust whenever, even after going live.
  'hosts',
  'judges',
  'sponsors',
];

/**
 * SetupTab - Configuration settings tab.
 *
 * Layout shell that orders and wires the setup sections (competition details,
 * hosts, timeline, nomination form, judging, sponsors, charity). Each section
 * is its own component under ./setup or a standalone panel component.
 * Participation tools live on EngagementTab.
 */
export default function SetupTab({
  competition,
  focusSection,
  host,
  coHosts = [],
  canManageHosts = false,
  onShowHostAssignment,
  onShowAddCoHost,
  onRemoveCoHost,
  judges = [],
  onOpenJudgeModal,
  onDeleteJudge,
  onSendJudgeInvite,
  judgingCriteria = [],
  judgeScores = [],
  sponsors,
  isSuperAdmin = false,
  onRefresh,
  onAddCriterion,
  onUpdateCriterion,
  onDeleteCriterion,
  onDeleteSponsor,
  onOpenSponsorModal,
  onOpenCharityModal,
}) {
  const { isMobile } = useResponsive();

  // ---- Grayed-out Setup sections ----
  // Hosts can gray out sections they aren't using; grayed sections render
  // dimmed and sort to the bottom. Mirrored locally for an instant toggle,
  // then persisted on the competition row.
  const [hiddenSections, setHiddenSections] = useState(
    () => competition?.hiddenSetupSections || []
  );

  useEffect(() => {
    setHiddenSections(competition?.hiddenSetupSections || []);
  }, [competition?.hiddenSetupSections]);

  const isHidden = (id) => hiddenSections.includes(id);

  // ---- Deep-link focus from the launch checklist ----
  // A checklist CTA can target a section ({ id, nonce }); the matching Panel
  // opens expanded and we scroll it into view. The nonce makes repeat clicks
  // on the same step re-trigger the scroll.
  const focusId = focusSection?.id || null;
  const focusNonce = focusSection?.nonce || null;

  useEffect(() => {
    if (!focusId) return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById(`setup-section-${focusId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => clearTimeout(t);
  }, [focusId, focusNonce]);

  const sectionStyle = (id) => {
    const idx = SECTION_ORDER.indexOf(id);
    // Sections that don't apply to this competition's configuration are grayed
    // out and sink below the active ones.
    const usesJudgesLocal = ['judges', 'hybrid'].includes(competition?.selectionCriteria);
    const charityActive = !!competition?.charityPercentage || !!competition?.charityName;
    // Host-upload competitions have no public nomination period, so the
    // nomination form doesn't apply — gray it out and sink it to the bottom.
    const isHostUploadLocal =
      (competition?.entryType || competition?.entry_type) === 'host_upload';
    const locked =
      (!usesJudgesLocal && id === 'judgingCriteria') ||
      (!charityActive && id === 'charity') ||
      (isHostUploadLocal && id === 'nominationForm');
    return { order: locked ? 100 + idx : 1 + idx, opacity: 1 };
  };

  // What the host actually configured drives which Setup sections apply:
  //  - charity panel is only relevant if they're donating a % of proceeds
  //  - judging is only relevant if winners are decided by judges (not pure votes)
  const charityApplies = !!competition?.charityPercentage || !!competition?.charityName;
  const usesJudges = ['judges', 'hybrid'].includes(competition?.selectionCriteria);
  //  - the nomination form only applies when contestants enter by nomination;
  //    host-upload competitions build the roster directly, so it's not used
  const isHostUpload = (competition?.entryType || competition?.entry_type) === 'host_upload';
  // These public-facing sections only actually lock once the competition is
  // published (publish-lock tier) — show the lock badge only then.
  const publishLocked = !isFieldEditable('nomination_form', competition?.status);
  // Judging criteria are a special case: unlike other publish-locked fields they
  // stay editable after going live UNTIL judging actually starts. A competition
  // can go live with judges but no criteria set (or need them tweaked); the
  // fairness concern is only changing what judges score on AFTER they've begun.
  // So: editable until the first judge score is recorded, then locked.
  const judgingHasStarted = (judgeScores?.length || 0) > 0;
  const criteriaLocked = judgingHasStarted;
  // Voting dates lock later than the publish-locked sections — they stay editable
  // through the entry/nomination phase and only lock once voting opens (live).
  const votingLocked = !isFieldEditable('voting_start', competition?.status);

  // Per-section editability badges so the host knows, at a glance, which
  // sections lock when they publish vs. which stay editable throughout.
  const badgeBase = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: `2px ${spacing.sm}`, borderRadius: '999px',
    fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium,
    whiteSpace: 'nowrap',
  };
  const lockBadge = (
    <span style={{ ...badgeBase, background: 'rgba(212,175,55,0.12)', color: colors.gold.primary, border: '1px solid rgba(212,175,55,0.3)' }}>
      <Lock size={11} /> {publishLocked ? 'Locked' : 'Locks at publish'}
    </span>
  );
  // Judging criteria lock on a later trigger (judging starts), so its badge differs.
  const criteriaLockBadge = (
    <span style={{ ...badgeBase, background: 'rgba(212,175,55,0.12)', color: colors.gold.primary, border: '1px solid rgba(212,175,55,0.3)' }}>
      <Lock size={11} /> {criteriaLocked ? 'Locked — judging started' : 'Locks when judging starts'}
    </span>
  );
  // Voting Details lock on a later trigger (voting opens), so its badge differs.
  const votingLockBadge = (
    <span style={{ ...badgeBase, background: 'rgba(212,175,55,0.12)', color: colors.gold.primary, border: '1px solid rgba(212,175,55,0.3)' }}>
      <Lock size={11} /> {votingLocked ? 'Locked' : 'Locks when voting opens'}
    </span>
  );
  const editBadge = (
    <span style={{ ...badgeBase, background: 'rgba(255,255,255,0.05)', color: colors.text.muted, border: `1px solid ${colors.border.lighter}` }}>
      Editable anytime
    </span>
  );

  return (
    <div className="er-setup" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Scoped form polish — a gold focus ring + custom select chevron so the
          Setup tab's inputs feel consistent with the create wizard. Uses a
          box-shadow ring (works regardless of each control's inline border). */}
      <style>{`
        .er-setup input:focus, .er-setup select:focus, .er-setup textarea:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(212,175,55,0.15);
          border-color: ${colors.gold.primary} !important;
        }
        .er-setup input, .er-setup select, .er-setup textarea {
          transition: box-shadow .15s ease, border-color .15s ease;
        }
      `}</style>
      {/* Competition details — the same recap the host sees on the Dashboard, so
          Setup is aligned with what they entered during onboarding. Editable in
          draft, locked thereafter (handled inside the card). */}
      <div style={{ ...sectionStyle('competitionDetails'), marginBottom: spacing.xxl }}>
        <CompetitionSummaryCard competition={competition} onRefresh={onRefresh} />
      </div>

      {/* Intro for the publish-locked, public-facing sections below. */}
      <div style={{ order: 1, marginBottom: spacing.lg }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <Lock size={16} style={{ color: colors.gold.primary }} />
          <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, margin: 0 }}>Important Information</h3>
        </div>
        <p style={{ color: colors.text.muted, fontSize: typography.fontSize.sm, margin: `${spacing.xs} 0 0`, lineHeight: 1.6 }}>
          This is the public-facing information for your competition. Some of it{' '}
          <span style={{ color: colors.gold.primary }}>locks when you publish</span> — get the{' '}
          nomination form, voting &amp; judging dates, and your charity partner right before you go
          public. Your{' '}
          <span style={{ color: colors.text.secondary }}>host, judges, sponsors, and judging criteria stay editable</span>{' '}
          after you’re live — judging criteria lock only once judges start scoring.
        </p>
      </div>

      {/* Hosts (creator + co-hosts) — moved here from the People tab. The
          inner Panel already carries the standard bottom margin, so we don't
          add another here (doing so double-spaced this section). */}
      <div style={sectionStyle('hosts')}>
        <HostsPanel
          host={host}
          coHosts={coHosts}
          competition={competition}
          canManage={canManageHosts}
          badge={editBadge}
          isMobile={isMobile}
          onShowHostAssignment={onShowHostAssignment}
          onShowAddCoHost={onShowAddCoHost}
          onRemoveCoHost={onRemoveCoHost}
          onRefresh={onRefresh}
        />
      </div>

      {/* Voting Details (voting/judging rounds + finale) */}
      <Panel
        key={`section-timeline-${focusId === 'timeline' ? focusNonce : 'x'}`}
        id="setup-section-timeline"
        style={sectionStyle('timeline')}
        title="Voting Details"
        icon={Calendar}
        locked={votingLocked}
        badge={votingLockBadge}
        collapsible
        defaultCollapsed={focusId !== 'timeline'}
      >
        <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
          <TimelineSettings competition={competition} onSave={onRefresh} isSuperAdmin={isSuperAdmin} />
        </div>
      </Panel>

      {/* Nomination Form — checklist step 4. Lives here in Setup (not Content)
          so the launch flow's build steps (timeline → form → judging → events)
          all sit in one tab, in order. Host-upload competitions have no public
          nomination period, so it's grayed out and sinks to the bottom (like the
          Charity Partner card when charity is off). */}
      {isHostUpload ? (
        <div id="setup-section-nominationForm" style={sectionStyle('nominationForm')}>
          <LockedSection
            title="Nomination Form"
            icon={Users}
            reason="Not used — you’re uploading your contestant roster yourself, so there’s no public nomination period. Switch entry to Nominations in your competition details to set this up."
          />
        </div>
      ) : (
        <NominationFormEditor
          key={`section-nominationForm-${focusId === 'nominationForm' ? focusNonce : 'x'}`}
          id="setup-section-nominationForm"
          style={sectionStyle('nominationForm')}
          competition={competition}
          onSave={onRefresh}
          locked={publishLocked}
          badge={lockBadge}
          collapsible
          defaultCollapsed={focusId !== 'nominationForm'}
        />
      )}

      {/* Judging criteria — stays editable after publish/live and locks only
          once judges start scoring (see criteriaLocked). Only relevant when
          winners are decided by judges (or a hybrid); for pure public-vote
          competitions it's grayed out and inaccessible. The judge roster lives
          in its own section below (editable anytime). */}
      {usesJudges ? (
        <div id="setup-section-judgingCriteria" style={sectionStyle('judgingCriteria')}>
          <JudgingPanel
            competition={competition}
            criteria={judgingCriteria}
            votingRounds={competition?.voting_rounds || []}
            onAddCriterion={onAddCriterion}
            onUpdateCriterion={onUpdateCriterion}
            onDeleteCriterion={onDeleteCriterion}
            onRefresh={onRefresh}
            locked={criteriaLocked}
            badge={criteriaLockBadge}
          />
        </div>
      ) : (
        <div id="setup-section-judgingCriteria" style={sectionStyle('judgingCriteria')}>
          <LockedSection
            title="Judging"
            icon={CheckCircle}
            reason="Not used — winners are decided by public votes. Switch “How they win” to Judges or Votes + judges to set this up."
          />
        </div>
      )}

      {/* Judge roster — invite/manage; editable any time, so it's grouped with
          the other always-editable sections. */}
      {usesJudges && (
        <div id="setup-section-judges" style={sectionStyle('judges')}>
          <JudgesManager
            judges={judges}
            onOpenJudgeModal={onOpenJudgeModal}
            onDeleteJudge={onDeleteJudge}
            onSendJudgeInvite={onSendJudgeInvite}
            badge={editBadge}
          />
        </div>
      )}

      <SponsorsSection
        sponsors={sponsors}
        isMobile={isMobile}
        focusId={focusId}
        focusNonce={focusNonce}
        badge={editBadge}
        style={sectionStyle('sponsors')}
        onOpenSponsorModal={onOpenSponsorModal}
        onDeleteSponsor={onDeleteSponsor}
      />

      <CharitySection
        competition={competition}
        charityApplies={charityApplies}
        isMobile={isMobile}
        focusId={focusId}
        focusNonce={focusNonce}
        charityHidden={isHidden('charity')}
        badge={lockBadge}
        style={sectionStyle('charity')}
        publishLocked={publishLocked}
        onOpenCharityModal={onOpenCharityModal}
      />
    </div>
  );
}
