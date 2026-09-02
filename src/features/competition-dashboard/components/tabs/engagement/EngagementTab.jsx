import React, { useEffect } from 'react';
import { colors } from '../../../../../styles/theme';
import { useResponsive } from '../../../../../hooks/useResponsive';
import { useAuthStore } from '../../../../../stores';
import { useAuthContextSafe } from '../../../../../contexts/AuthContext';
import { useToast } from '../../../../../contexts/ToastContext';
import { getTimezoneOptionGroups } from '../../../../../lib/timezones';
import EventsSection from './EventsSection';
import DoubleVoteDaysSection from './DoubleVoteDaysSection';
import BonusVotesSection from './BonusVotesSection';
import VideoPromptsSection from './VideoPromptsSection';

/**
 * EngagementTab — the dashboard's "Engagement" tab: participation-driving tools
 * (events, double-vote days, bonus votes, video prompts). Each section is a
 * self-contained component that loads and owns its own data; this orchestrator
 * just provides shared context (auth, timezone, deep-link focus) and ordering.
 *
 * Split out of SetupTab, which previously rendered these sections in an
 * `mode='engagement'` slice of one ~1,900-line file.
 */
export default function EngagementTab({
  competition,
  focusSection,
  events = [],
  doubleDays = [],
  voteBoosts = [],
  onRefresh,
  onDeleteEvent,
  onOpenEventModal,
  onAddDoubleDay,
  onDeleteDoubleDay,
  onAddVoteBoost,
  onCancelVoteBoost,
  onUpdateTimezone,
}) {
  const { isMobile } = useResponsive();
  const { profile: currentUser } = useAuthContextSafe();
  const toast = useToast();
  const authStoreUser = useAuthStore(s => s.user);
  const reviewerId = currentUser?.id || authStoreUser?.id;

  const competitionId = competition?.id;
  const competitionTimezone = competition?.timezone || 'UTC';
  const timezoneGroups = React.useMemo(() => getTimezoneOptionGroups(), []);

  const hiddenSections = competition?.hiddenSetupSections || [];
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

  return (
    <div className="er-engagement" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Scoped form polish — a gold focus ring so the Engagement tab's inputs
          feel consistent with the rest of the dashboard. Uses a box-shadow ring
          (works regardless of each control's inline border). */}
      <style>{`
        .er-engagement input:focus, .er-engagement select:focus, .er-engagement textarea:focus {
          outline: none;
          box-shadow: 0 0 0 3px rgba(212,175,55,0.15);
          border-color: ${colors.gold.primary} !important;
        }
        .er-engagement input, .er-engagement select, .er-engagement textarea {
          transition: box-shadow .15s ease, border-color .15s ease;
        }
      `}</style>

      <EventsSection
        events={events}
        isMobile={isMobile}
        focusId={focusId}
        focusNonce={focusNonce}
        onOpenEventModal={onOpenEventModal}
        onDeleteEvent={onDeleteEvent}
      />

      <DoubleVoteDaysSection
        doubleDays={doubleDays}
        voteBoosts={voteBoosts}
        isMobile={isMobile}
        focusId={focusId}
        focusNonce={focusNonce}
        competitionTimezone={competitionTimezone}
        timezoneGroups={timezoneGroups}
        onAddDoubleDay={onAddDoubleDay}
        onDeleteDoubleDay={onDeleteDoubleDay}
        onAddVoteBoost={onAddVoteBoost}
        onCancelVoteBoost={onCancelVoteBoost}
        onUpdateTimezone={onUpdateTimezone}
      />

      <BonusVotesSection
        competitionId={competitionId}
        isMobile={isMobile}
        focusId={focusId}
        defaultCollapsed={isHidden('bonusVotes')}
        reviewerId={reviewerId}
        toast={toast}
        onRefresh={onRefresh}
      />

      <VideoPromptsSection
        competitionId={competitionId}
        isMobile={isMobile}
        defaultCollapsed={isHidden('videoPrompts')}
        reviewerId={reviewerId}
      />
    </div>
  );
}
