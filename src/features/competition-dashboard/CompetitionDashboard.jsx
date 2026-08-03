import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Crown, ArrowLeft, Star, LogOut, BarChart3, Settings as SettingsIcon,
  Eye, AlertCircle, ChevronDown, Check, Rocket, TrendingUp, Activity, Megaphone, Globe, Lock, Gauge, Plus
} from 'lucide-react';
import { Button, Badge, Avatar, NotificationBell } from '../../components/ui';
import { HostAssignmentModal, JudgeModal, SponsorWizardModal, EventModal, PrizeModal, AddPersonModal, ImportRosterModal, CharityModal } from '../../components/modals';
import { colors, gradients, spacing, borderRadius, typography, transitions } from '../../styles/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { useToast } from '../../contexts/ToastContext';
import { useCompetitionDashboard } from './hooks/useCompetitionDashboard';
import { useStripeConnect } from './hooks/useStripeConnect';
import { SkeletonPulse, SkeletonCard } from '../../components/common/Skeleton';

// Import tab components
import { OverviewTab, PeopleTab, EmailActivityTab, ContentTab, SetupTab, EngagementTab, PreviewTab } from './components/tabs';
import AnnouncementsManager from './components/AnnouncementsManager';
import AudienceManager from './components/AudienceManager';
import JudgingResultsPanel from './components/JudgingResultsPanel';
import HostAgreementGate from './components/HostAgreementGate';
import { COMPETITION_STATUS } from '../../types/competition';
import { HOST_AGREEMENT_VERSION } from '../../lib/hostAgreement';

// Consolidated tab navigation. Launch leads — it's the guided checklist for
// getting a competition live; the rest are the day-to-day management surfaces.
const TABS = [
  { id: 'dashboard', label: 'Status', shortLabel: 'Status', icon: Gauge },
  { id: 'setup', label: 'Setup', shortLabel: 'Setup', icon: SettingsIcon },
  { id: 'site', label: 'Site', shortLabel: 'Site', icon: Globe },
  { id: 'people', label: 'People', shortLabel: 'People', icon: Crown },
  { id: 'activity', label: 'Activity', shortLabel: 'Activity', icon: Activity },
  { id: 'communications', label: 'Communications', shortLabel: 'Comms', icon: Megaphone },
  { id: 'engagement', label: 'Engagement', shortLabel: 'Engage', icon: TrendingUp },
];

// SponsorWizardModal collects sponsor + child prizes. The dashboard hook persists prizes
// into competition_prizes (linked by sponsor_id), so they appear on the public Prizes page.
const TIER_CAPS = { platinum: 1, gold: 2, silver: 3 };

function computeTierAvailability(allSponsors, editingSponsor) {
  const usedByTier = { platinum: 0, gold: 0, silver: 0 };
  for (const s of allSponsors) {
    if (editingSponsor && s.id === editingSponsor.id) continue;
    if (usedByTier[s.tier] !== undefined) usedByTier[s.tier] += 1;
  }
  return {
    platinum: Math.max(0, TIER_CAPS.platinum - usedByTier.platinum),
    gold: Math.max(0, TIER_CAPS.gold - usedByTier.gold),
    silver: Math.max(0, TIER_CAPS.silver - usedByTier.silver),
  };
}

function sponsorToWizardForm(sponsor) {
  const isInKind = sponsor.tier === 'inkind';
  const prizes = (sponsor.prizes || []).map((p) => ({
    id: p.id,
    title: p.title || '',
    description: p.description || '',
    value: p.value ? String(p.value) : '',
    imageUrl: p.imageUrl || '',
    recipientGender: p.recipientGender || 'all',
  }));
  // Prefer the stored recipient; fall back to inferring from the first prize's
  // prize_type for legacy sponsors saved before reward_recipient was persisted.
  const firstPrizeType = sponsor.prizes?.[0]?.prizeType;
  const inferredRecipient = firstPrizeType === 'winner' ? 'winners' : (prizes.length > 0 ? 'all' : '');
  const recipient = sponsor.rewardRecipient || inferredRecipient;
  return {
    name: sponsor.name || '',
    logoUrl: sponsor.logoUrl || '',
    websiteUrl: sponsor.websiteUrl || '',
    sponsorshipType: isInKind ? 'in_kind' : 'paid',
    value: sponsor.amount ? String(sponsor.amount) : '',
    visibilityTier: isInKind ? '' : (sponsor.tier || ''),
    providesContestantRewards: prizes.length > 0,
    recipient,
    topXCount: sponsor.rewardTopXCount != null ? String(sponsor.rewardTopXCount) : '',
    prizes,
  };
}

function wizardFormToSponsor(form) {
  const tier = form.sponsorshipType === 'in_kind' ? 'inkind' : form.visibilityTier;
  return {
    name: form.name,
    tier,
    amount: form.value,
    logoUrl: form.logoUrl,
    websiteUrl: form.websiteUrl,
    recipient: form.recipient,
    topXCount: form.topXCount ?? null,
    prizes: form.prizes || [],
  };
}

export default function CompetitionDashboard({
  competitionId,
  role = 'host',
  onBack,
  onLogout,
  onViewPublicSite,
  onLaunchCompetition,
  currentUserId,
  competitions = [],
  selectedCompetitionId,
  onSelectCompetition,
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  // When a launch-checklist CTA deep-links into the Setup tab, this carries the
  // section to auto-expand + scroll to. The nonce re-triggers the scroll even
  // when the host clicks the same step twice.
  const [setupFocus, setSetupFocus] = useState(null);
  const [showHostAssignment, setShowHostAssignment] = useState(false);
  const [showAddCoHost, setShowAddCoHost] = useState(false);
  const [showCompSwitcher, setShowCompSwitcher] = useState(false);
  const isSuperAdmin = role === 'superadmin';
  const { isMobile } = useResponsive();

  // Fetch all dashboard data
  const dashboard = useCompetitionDashboard(competitionId);
  const {
    data,
    loading,
    error,
    refresh,
    addNominee,
    approveNominee,
    rejectNominee,
    removeContestant,
    unconvertContestant,
    restoreNominee,
    resendInvite,
    sendHostBroadcast,
    getHostBroadcastStatus,
    addContestant,
    bulkImportContestants,
    addJudge,
    updateJudge,
    deleteJudge,
    sendJudgeInvite,
    addCriterion,
    updateCriterion,
    deleteCriterion,
    updateCharity,
    removeCharity,
    addSponsor,
    updateSponsor,
    deleteSponsor,
    addEvent,
    updateEvent,
    deleteEvent,
    addDoubleDay,
    deleteDoubleDay,
    updateCompetitionTimezone,
    addAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    toggleAnnouncementPin,
    addRule,
    updateRule,
    deleteRule,
    addPrize,
    updatePrize,
    assignHost,
    removeHost,
    addCoHost,
    removeCoHost,
    removeSubscriber,
    repairNomineeAccount,
    repairAllNomineeAccounts,
  } = dashboard;

  const competition = data.competition;
  const competitionName = competition?.name || 'Competition';

  // Blocking re-acceptance gate: after the Host Agreement version is bumped, an
  // existing host who accepted an OLDER version must re-accept before using the
  // dashboard. New hosts (no prior acceptance) go through the normal onboarding
  // card, so we gate only a stale prior acceptance. Managed orgs and super-admin
  // viewers are never gated.
  const agreementVersion = competition?.agreement?.version || null;
  const needsAgreementReAcceptance =
    !loading &&
    !isSuperAdmin &&
    !!competition &&
    !competition.managed &&
    !!competition.organizationId &&
    !!agreementVersion &&
    agreementVersion !== HOST_AGREEMENT_VERSION;

  // A finished competition (completed/archived) has already run, so the launch
  // flow is moot — hide the Launch tab entirely rather than presenting its
  // steps as open to-dos.
  const isFinished =
    competition?.status === COMPETITION_STATUS.COMPLETED ||
    competition?.status === COMPETITION_STATUS.ARCHIVE;

  // The dashboard (Overview) is the landing surface; the launch lifecycle now
  // lives in the Launch Status tracker on that tab, so there's no separate
  // Launch checklist tab.
  //
  // Before a competition is live we keep premature tabs visible but locked
  // (not clickable), so the host stays focused on finishing their launch steps
  // without the nav feeling like it lost features. Tabs unlock in step with the
  // lifecycle, one new tab per phase:
  //   draft                    → Dashboard + Setup unlocked
  //   pending_approval         → + People (start gathering nominees while
  //                              they wait on approval)
  //   approved                 → + Site (prepping the public specifics)
  //   published / live / done  → everything unlocked
  const launchPhase = (() => {
    const s = competition?.status;
    if (s === 'draft') return 'draft';
    if (s === 'pending_approval') return 'pending';
    if (s === 'approved') return 'approved';
    return 'live';
  })();
  const unlockedTabIds =
    launchPhase === 'draft' ? ['dashboard', 'setup']
    : launchPhase === 'pending' ? ['dashboard', 'setup', 'site', 'people']
    : launchPhase === 'approved' ? ['dashboard', 'setup', 'site', 'people']
    : TABS.map((t) => t.id);
  const isTabLocked = (id) => !unlockedTabIds.includes(id);
  // Per-tab tooltip explaining when a locked tab becomes available, matching
  // the unlock schedule above (Site & People at submit, the rest at publish) so
  // each lock reads accurately regardless of the current phase.
  const lockedTabReason = (id) => {
    if (id === 'people' || id === 'site') return 'Available after you submit for approval.';
    return 'Available once your competition is published.';
  };
  const visibleTabs = TABS;

  // Stripe Connect return handler. When the host comes back from Stripe's
  // hosted onboarding (return_url carries ?connect=return&org=...), pull the
  // latest KYC status, refresh the dashboard, and clean the URL. A 'refresh'
  // param means the onboarding link expired before completion — just clear it.
  const { syncStatus: syncConnectStatus } = useStripeConnect();
  const connectReturnHandledRef = useRef(false);
  useEffect(() => {
    if (connectReturnHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    const org = params.get('org');
    if (!connect) return;
    connectReturnHandledRef.current = true;

    // Strip the connect params so a reload doesn't re-trigger this.
    params.delete('connect');
    params.delete('org');
    const cleaned = window.location.pathname + (params.toString() ? `?${params}` : '');
    window.history.replaceState({}, '', cleaned);

    if (connect === 'return' && org) {
      syncConnectStatus(org).then((status) => {
        refresh();
        if (status?.kyc_status === 'verified') {
          toast?.success?.('Stripe account connected — payouts are enabled.');
        } else if (status?.kyc_status === 'pending') {
          toast?.info?.('Stripe is verifying your details. We’ll update your status shortly.');
        }
      });
    } else if (connect === 'refresh') {
      toast?.info?.('Onboarding link expired. Tap “Connect with Stripe” to continue.');
    }
  }, [syncConnectStatus, refresh, toast]);

  // When the host runs more than one competition, the header name becomes a
  // switcher so they can jump between dashboards without leaving the page.
  const hasMultipleCompetitions = competitions.length > 1;
  const activeCompetitionId = selectedCompetitionId ?? competitionId;

  // Gradient gold title shared by the single-competition and switcher renders.
  const competitionNameStyle = {
    fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.xxl,
    fontWeight: typography.fontWeight.semibold,
    background: 'linear-gradient(135deg, #d4af37, #f4d03f)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: isMobile ? '100px' : 'none',
    lineHeight: 1.2,
  };

  const handleSelectCompetition = (id) => {
    setShowCompSwitcher(false);
    if (id !== activeCompetitionId) onSelectCompetition?.(id);
  };

  // Tab navigation that can optionally focus a specific Setup section.
  const navigateToTab = (tab, section = null) => {
    setActiveTab(tab);
    setSetupFocus(section ? { id: section, nonce: Date.now() } : null);
  };

  // Add person modal state
  const [addPersonModal, setAddPersonModal] = useState({ isOpen: false, type: 'nominee' });

  const openAddPersonModal = (type) => {
    setAddPersonModal({ isOpen: true, type });
  };

  const closeAddPersonModal = () => {
    setAddPersonModal({ isOpen: false, type: 'nominee' });
  };

  // Import roster (bulk contestant upload) modal
  const [showImportRoster, setShowImportRoster] = useState(false);

  const handleImportRoster = async (rows) => {
    const result = await bulkImportContestants(rows);
    if (result?.created?.length) {
      toast.success(`${result.created.length} ${result.created.length === 1 ? 'contestant' : 'contestants'} imported`);
    } else if (!result?.success && result?.error) {
      toast.error(result.error);
    }
    return result;
  };

  const handleAddPerson = async (personData) => {
    const { type } = addPersonModal;
    try {
      if (type === 'contestant') {
        const result = await addContestant(personData);
        if (!result.success) {
          toast.error(result.error || 'Failed to add contestant');
          throw new Error(result.error);
        }
        toast.success(`${personData.name} added as contestant`);
      } else {
        const result = await addNominee(personData);
        if (!result.success) {
          toast.error(result.error || 'Failed to add nominee');
          throw new Error(result.error);
        }
        toast.success(`${personData.name} added as nominee`);
      }
    } catch (err) {
      console.error('Error adding person:', err);
      throw err;
    }
  };

  // Entity modals
  const [judgeModal, setJudgeModal] = useState({ isOpen: false, judge: null });
  const [sponsorModal, setSponsorModal] = useState({ isOpen: false, sponsor: null });
  const [eventModal, setEventModal] = useState({ isOpen: false, event: null });
  const [prizeModal, setPrizeModal] = useState({ isOpen: false, prize: null, prizeType: 'winner' });
  const [charityModal, setCharityModal] = useState(false);

  // ============================================================================
  // HEADER
  // ============================================================================

  const renderHeader = () => (
    <header style={{
      background: 'rgba(20,20,30,0.95)',
      borderBottom: '1px solid rgba(212,175,55,0.15)',
      padding: isMobile ? `${spacing.sm} ${spacing.md}` : `${spacing.md} ${spacing.xxl}`,
      position: 'sticky',
      top: 0,
      zIndex: 40,
      backdropFilter: 'blur(20px)',
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: spacing.sm,
      }}>
        {/* Left side: Back, Logo, Name, Badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? spacing.sm : spacing.md,
          minWidth: 0,
          flex: 1,
        }}>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isMobile ? '32px' : '36px',
                height: isMobile ? '32px' : '36px',
                background: 'rgba(212,175,55,0.1)',
                border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: borderRadius.md,
                color: colors.gold.primary,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ArrowLeft size={isMobile ? 16 : 18} />
            </button>
          )}

          <div style={{
            width: isMobile ? '28px' : '40px',
            height: isMobile ? '28px' : '40px',
            background: 'linear-gradient(135deg, #d4af37, #f4d03f)',
            borderRadius: borderRadius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#0a0a0f',
            boxShadow: '0 0 20px rgba(212,175,55,0.3)',
            flexShrink: 0,
          }}>
            <Crown size={isMobile ? 16 : 22} />
          </div>

          {/* Name + Badge stacked on mobile */}
          <div style={{
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
            gap: isMobile ? '1px' : spacing.md,
            minWidth: 0,
          }}>
            {hasMultipleCompetitions ? (
              <div style={{ position: 'relative', minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => setShowCompSwitcher((v) => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={showCompSwitcher}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: spacing.xs,
                    maxWidth: '100%',
                    minWidth: 0,
                    padding: 0,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  <span style={competitionNameStyle}>{competitionName}</span>
                  <ChevronDown
                    size={isMobile ? 14 : 18}
                    color={colors.gold.primary}
                    style={{
                      flexShrink: 0,
                      transition: 'transform 0.2s ease',
                      transform: showCompSwitcher ? 'rotate(180deg)' : 'none',
                    }}
                  />
                </button>

                {showCompSwitcher && (
                  <>
                    {/* Click-away backdrop */}
                    <div
                      onClick={() => setShowCompSwitcher(false)}
                      style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                    />
                    {/* Switcher menu */}
                    <div
                      role="listbox"
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 8px)',
                        left: 0,
                        zIndex: 50,
                        minWidth: isMobile ? '220px' : '260px',
                        maxWidth: '80vw',
                        maxHeight: '60vh',
                        overflowY: 'auto',
                        background: 'rgba(20,20,30,0.98)',
                        border: `1px solid ${colors.border.light}`,
                        borderRadius: borderRadius.lg,
                        boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(20px)',
                        padding: spacing.xs,
                      }}
                    >
                      {competitions.map((c) => {
                        const isActive = c.id === activeCompetitionId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onClick={() => handleSelectCompetition(c.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: spacing.sm,
                              width: '100%',
                              textAlign: 'left',
                              padding: `${spacing.sm} ${spacing.md}`,
                              background: isActive ? 'rgba(212,175,55,0.12)' : 'transparent',
                              border: 'none',
                              borderRadius: borderRadius.md,
                              color: isActive ? colors.gold.primary : colors.text.primary,
                              fontSize: typography.fontSize.sm,
                              fontWeight: isActive
                                ? typography.fontWeight.semibold
                                : typography.fontWeight.normal,
                              cursor: 'pointer',
                            }}
                          >
                            <Crown
                              size={14}
                              style={{ flexShrink: 0, opacity: isActive ? 1 : 0.5 }}
                            />
                            <span style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {c.name}
                            </span>
                            {isActive && <Check size={14} style={{ flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                      {onLaunchCompetition && (
                        <button
                          type="button"
                          onClick={() => { setShowCompSwitcher(false); onLaunchCompetition(); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: spacing.sm, width: '100%',
                            textAlign: 'left', padding: `${spacing.sm} ${spacing.md}`, marginTop: spacing.xs,
                            borderTop: `1px solid ${colors.border.light}`, background: 'transparent',
                            border: 'none', color: colors.gold.primary, fontSize: typography.fontSize.sm,
                            fontWeight: typography.fontWeight.medium, cursor: 'pointer',
                          }}
                        >
                          <Plus size={14} style={{ flexShrink: 0 }} />
                          Launch a new competition
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <span style={competitionNameStyle}>{competitionName}</span>
            )}

            <span style={{
              padding: isMobile ? `1px ${spacing.xs}` : `${spacing.xs} ${spacing.md}`,
              background: 'rgba(212,175,55,0.15)',
              color: colors.gold.primary,
              borderRadius: borderRadius.sm,
              fontSize: isMobile ? '9px' : typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              whiteSpace: 'nowrap',
            }}>
              <Star size={isMobile ? 8 : 12} /> {isSuperAdmin ? 'ADMIN' : 'HOST'}
            </span>
          </div>
        </div>

        {/* Right side: Notifications + Preview + Logout */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: isMobile ? spacing.xs : spacing.md,
          flexShrink: 0,
        }}>
          <NotificationBell size={isMobile ? 32 : 36} />
          {onViewPublicSite && (
            <button
              onClick={onViewPublicSite}
              title={launchPhase === 'live'
                ? 'View your live competition page'
                : 'Preview your coming-soon page — a live look at what you’ve entered so far'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
                padding: isMobile ? `${spacing.xs} ${spacing.sm}` : `${spacing.sm} ${spacing.md}`,
                background: 'rgba(212,175,55,0.1)',
                border: `1px solid ${colors.gold.primary}`,
                borderRadius: borderRadius.md,
                color: colors.gold.primary,
                fontSize: isMobile ? '11px' : typography.fontSize.sm,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Eye size={isMobile ? 12 : 14} />
              {launchPhase === 'live'
                ? (isMobile ? 'View' : 'View Competition')
                : (isMobile ? 'Preview' : 'Preview Competition')}
            </button>
          )}

          {onLaunchCompetition && !hasMultipleCompetitions && (
            <button
              onClick={onLaunchCompetition}
              title="Launch a new competition"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
                padding: isMobile ? spacing.xs : `${spacing.sm} ${spacing.md}`,
                background: 'transparent', border: `1px solid ${colors.border.light}`,
                borderRadius: borderRadius.md, color: colors.text.secondary,
                fontSize: typography.fontSize.sm, cursor: 'pointer',
                minWidth: isMobile ? '32px' : 'auto', minHeight: isMobile ? '32px' : 'auto',
              }}
            >
              <Plus size={16} />
              {!isMobile && <span>New</span>}
            </button>
          )}
          {onLogout && (
            <button
              onClick={onLogout}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: isMobile ? spacing.xs : `${spacing.sm} ${spacing.md}`,
                background: 'transparent',
                border: `1px solid ${colors.border.light}`,
                borderRadius: borderRadius.md,
                color: colors.text.secondary,
                fontSize: typography.fontSize.sm,
                cursor: 'pointer',
                minWidth: isMobile ? '32px' : 'auto',
                minHeight: isMobile ? '32px' : 'auto',
              }}
            >
              <LogOut size={16} />
              {!isMobile && <span style={{ marginLeft: spacing.sm }}>Logout</span>}
            </button>
          )}
        </div>
      </div>
    </header>
  );

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  const renderNavigation = () => (
    <nav style={{
      background: 'rgba(20,20,30,0.8)',
      borderBottom: `1px solid ${colors.border.lighter}`,
      padding: `0 ${isMobile ? spacing.md : spacing.xxl}`,
    }}>
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        display: 'flex',
        gap: '0',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch', // Smooth scroll on iOS
        scrollbarWidth: 'none', // Hide scrollbar on Firefox
        msOverflowStyle: 'none', // Hide scrollbar on IE/Edge
      }}>
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const locked = isTabLocked(tab.id);
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setSetupFocus(null); }}
              title={locked ? lockedTabReason(tab.id) : undefined}
              style={{
                padding: isMobile ? `${spacing.md} ${spacing.md}` : `${spacing.md} ${spacing.xl}`,
                color: isActive ? colors.gold.primary : locked ? colors.text.muted : colors.text.secondary,
                fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.md,
                fontWeight: typography.fontWeight.medium,
                cursor: 'pointer',
                opacity: locked && !isActive ? 0.55 : 1,
                borderBottom: `2px solid ${isActive ? colors.gold.primary : 'transparent'}`,
                background: 'none',
                border: 'none',
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: isMobile ? '2px' : spacing.sm,
                transition: `all ${transitions.fast}`,
                whiteSpace: 'nowrap',
                minWidth: isMobile ? '60px' : 'auto',
                minHeight: '44px', // Touch-friendly
              }}
            >
              {locked ? <Lock size={isMobile ? 18 : 15} /> : <Icon size={isMobile ? 20 : 18} />}
              {isMobile ? (
                <span style={{ fontSize: '10px' }}>{tab.shortLabel || tab.label}</span>
              ) : (
                tab.label
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  // The "Setup" tab — core competition config. Participation tools live on the
  // separate Engagement tab (see EngagementTab below).
  const renderSetupTab = () => (
    <SetupTab
      competition={competition}
      focusSection={setupFocus}
      host={data.host}
      coHosts={data.coHosts || []}
      canManageHosts={isSuperAdmin || role === 'host'}
      onShowHostAssignment={() => setShowHostAssignment(true)}
      onShowAddCoHost={() => setShowAddCoHost(true)}
      onRemoveCoHost={removeCoHost}
      judges={data.judges}
      onOpenJudgeModal={(judge) => setJudgeModal({ isOpen: true, judge })}
      onDeleteJudge={deleteJudge}
      onSendJudgeInvite={sendJudgeInvite}
      judgingCriteria={data.judgingCriteria}
      sponsors={data.sponsors}
      isSuperAdmin={isSuperAdmin}
      onRefresh={refresh}
      onAddCriterion={addCriterion}
      onUpdateCriterion={updateCriterion}
      onDeleteCriterion={deleteCriterion}
      onDeleteSponsor={deleteSponsor}
      onOpenSponsorModal={(sponsor) => setSponsorModal({ isOpen: true, sponsor })}
      onOpenCharityModal={() => setCharityModal(true)}
    />
  );

  // The "Engagement" tab — participation-driving tools (events, double-vote
  // days, bonus votes, video prompts). Each section loads its own data.
  const renderEngagementTab = () => (
    <EngagementTab
      competition={competition}
      focusSection={setupFocus}
      events={data.events}
      doubleDays={data.doubleDays}
      onRefresh={refresh}
      onDeleteEvent={deleteEvent}
      onOpenEventModal={(event) => setEventModal({ isOpen: true, event })}
      onAddDoubleDay={addDoubleDay}
      onDeleteDoubleDay={deleteDoubleDay}
      onUpdateTimezone={updateCompetitionTimezone}
    />
  );

  const renderContent = () => {
    if (loading) {
      return (
        <div style={{ padding: spacing.lg }}>
          {/* Tab bar skeleton */}
          <div style={{ display: 'flex', gap: spacing.md, marginBottom: spacing.xl }}>
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonPulse key={i} width="100px" height="36px" radius={borderRadius.lg} />
            ))}
          </div>
          {/* Stat cards skeleton */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: spacing.md, marginBottom: spacing.xl }}>
            {Array.from({ length: 4 }, (_, i) => (
              <SkeletonCard key={i} height="100px" />
            ))}
          </div>
          {/* Content skeleton */}
          <SkeletonCard height="300px" />
        </div>
      );
    }

    if (error) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacing.xxxl,
          gap: spacing.lg,
        }}>
          <AlertCircle size={48} style={{ color: '#ef4444' }} />
          <p style={{ color: '#ef4444', fontSize: typography.fontSize.lg }}>
            Error loading data: {error}
          </p>
          <Button onClick={refresh} variant="secondary">Try Again</Button>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <OverviewTab
            competition={competition}
            contestants={data.contestants}
            nominees={data.nominees}
            sponsors={data.sponsors}
            events={data.events}
            announcements={data.announcements}
            host={data.host}
            voteRevenue={data.voteRevenue}
            isSuperAdmin={isSuperAdmin}
            onViewPublicSite={onViewPublicSite}
            onNavigateToTab={navigateToTab}
            onOpenSponsorModal={(sponsor) => setSponsorModal({ isOpen: true, sponsor })}
            onOpenEventModal={(event) => setEventModal({ isOpen: true, event })}
            onAddAnnouncement={addAnnouncement}
            onUpdateAnnouncement={updateAnnouncement}
            onDeleteAnnouncement={deleteAnnouncement}
            onTogglePin={toggleAnnouncementPin}
            onRefresh={refresh}
            mode="launch"
          />
        );
      case 'activity':
        return (
          <>
            <OverviewTab
              competition={competition}
              contestants={data.contestants}
              nominees={data.nominees}
              sponsors={data.sponsors}
              events={data.events}
              announcements={data.announcements}
              host={data.host}
              voteRevenue={data.voteRevenue}
              isSuperAdmin={isSuperAdmin}
              onViewPublicSite={onViewPublicSite}
              onNavigateToTab={navigateToTab}
              onOpenSponsorModal={(sponsor) => setSponsorModal({ isOpen: true, sponsor })}
              onOpenEventModal={(event) => setEventModal({ isOpen: true, event })}
              onAddAnnouncement={addAnnouncement}
              onUpdateAnnouncement={updateAnnouncement}
              onDeleteAnnouncement={deleteAnnouncement}
              onTogglePin={toggleAnnouncementPin}
              onRefresh={refresh}
              mode="activity"
            />
            {/* Judging results — the live leaderboard of judge scores blended
                with votes. Sits with the other live activity; renders nothing
                until a judging-enabled round exists. */}
            <div style={{ marginTop: spacing.xl }}>
              <JudgingResultsPanel
                contestants={data.contestants}
                judges={data.judges}
                judgingCriteria={data.judgingCriteria}
                judgeScores={data.judgeScores}
                votingRounds={competition?.voting_rounds || []}
              />
            </div>
          </>
        );
      case 'people':
        return (
          <PeopleTab
            competition={competition}
            votingRounds={competition?.voting_rounds || []}
            nominees={data.nominees}
            contestants={data.contestants}
            host={data.host}
            coHosts={data.coHosts || []}
            isSuperAdmin={isSuperAdmin}
            onRefresh={refresh}
            onApproveNominee={approveNominee}
            onRejectNominee={rejectNominee}
            onRemoveContestant={removeContestant}
            onUnconvertContestant={unconvertContestant}
            onRestoreNominee={restoreNominee}
            onOpenAddPersonModal={openAddPersonModal}
            onOpenImportRoster={() => setShowImportRoster(true)}
            onShowHostAssignment={() => setShowHostAssignment(true)}
            onRemoveHost={removeHost}
            onShowAddCoHost={() => setShowAddCoHost(true)}
            onRemoveCoHost={removeCoHost}
            onResendInvite={resendInvite}
            onSendHostBroadcast={sendHostBroadcast}
            onGetHostBroadcastStatus={getHostBroadcastStatus}
            onRepairNomineeAccount={repairNomineeAccount}
            onRepairAllNomineeAccounts={repairAllNomineeAccounts}
          />
        );
      case 'communications':
        return (
          <>
            <AnnouncementsManager
              announcements={data.announcements}
              competition={competition}
              host={data.host}
              isSuperAdmin={isSuperAdmin}
              onAddAnnouncement={addAnnouncement}
              onUpdateAnnouncement={updateAnnouncement}
              onDeleteAnnouncement={deleteAnnouncement}
              onTogglePin={toggleAnnouncementPin}
            />
            <EmailActivityTab
              competitionId={competitionId}
            />
            <AudienceManager
              competition={competition}
              subscribers={data.subscribers || []}
              onRemoveSubscriber={removeSubscriber}
            />
          </>
        );
      case 'site':
        // The public-facing page: edit its content, then preview how visitors
        // see it — two halves of the same job, under one tab.
        return (
          <>
            <ContentTab
              competition={competition}
              onRefresh={refresh}
              organizationName={competition?.organizationName}
              organizationId={competition?.organizationId}
              organizationHeaderLogoUrl={competition?.organizationHeaderLogoUrl}
              organizationLogoUrl={competition?.organizationLogoUrl}
              organizationWebsiteUrl={competition?.organizationWebsiteUrl}
              organizationLegalEntityName={competition?.organizationLegalEntityName}
              organizationInstagram={competition?.organizationInstagram}
              organizationTiktok={competition?.organizationTiktok}
              organizationFacebook={competition?.organizationFacebook}
            />
            <PreviewTab
              competition={competition}
              contestants={data.contestants}
            />
          </>
        );
      case 'setup':
        return renderSetupTab();
      case 'engagement':
        return renderEngagementTab();
      default:
        return null;
    }
  };

  // Slim banner shown atop a locked tab's real content. Locked tabs are fully
  // viewable before they "go live" — this just sets expectations (it's a peek
  // ahead, not yet active) and says when it formally unlocks.
  const renderPreviewBanner = () => {
    if (!isTabLocked(activeTab)) return null;
    const tab = TABS.find((t) => t.id === activeTab);
    if (!tab) return null;
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: spacing.sm,
        padding: `${spacing.sm} ${spacing.md}`,
        marginBottom: spacing.xl,
        background: 'rgba(212,175,55,0.08)',
        border: `1px solid rgba(212,175,55,0.3)`,
        borderRadius: borderRadius.lg,
        color: colors.gold.primary,
        fontSize: typography.fontSize.sm,
      }}>
        <Lock size={15} style={{ flexShrink: 0 }} />
        <span>
          <strong style={{ fontWeight: typography.fontWeight.semibold }}>Preview — {tab.label} isn’t live yet.</strong>{' '}
          <span style={{ color: colors.text.secondary }}>{lockedTabReason(tab.id)} Look around to see what’s coming.</span>
        </span>
      </div>
    );
  };

  return (
    <>
      <div style={{ minHeight: '100vh', background: gradients.background }}>
        {renderHeader()}
        {renderNavigation()}
        <main style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: isMobile ? `${spacing.lg} ${spacing.md}` : `${spacing.xxxl} ${spacing.xxl}`,
        }}>
          {renderPreviewBanner()}
          {renderContent()}
        </main>
      </div>
      {needsAgreementReAcceptance && (
        <HostAgreementGate
          organizationId={competition?.organizationId}
          onAccepted={refresh}
          onLogout={onLogout}
        />
      )}
      <HostAssignmentModal
        isOpen={showHostAssignment}
        onClose={() => setShowHostAssignment(false)}
        onAssign={async (userId) => {
          await assignHost(userId);
          setShowHostAssignment(false);
        }}
        currentHostId={data.host?.id}
      />
      <HostAssignmentModal
        isOpen={showAddCoHost}
        onClose={() => setShowAddCoHost(false)}
        onAssign={async (userId) => {
          await addCoHost(userId);
          setShowAddCoHost(false);
        }}
        currentHostId={data.host?.id}
        excludeIds={(data.coHosts || []).map((c) => c.id)}
        title="Add Co-Host"
        assignLabel="Add Co-Host"
        emailOnly
      />
      <JudgeModal
        isOpen={judgeModal.isOpen}
        onClose={() => setJudgeModal({ isOpen: false, judge: null })}
        judge={judgeModal.judge}
        onSave={async (judgeData) => {
          if (judgeModal.judge) {
            await updateJudge(judgeModal.judge.id, judgeData);
          } else {
            await addJudge(judgeData);
          }
          setJudgeModal({ isOpen: false, judge: null });
        }}
      />
      <SponsorWizardModal
        isOpen={sponsorModal.isOpen}
        onClose={() => setSponsorModal({ isOpen: false, sponsor: null })}
        sponsor={sponsorModal.sponsor ? sponsorToWizardForm(sponsorModal.sponsor) : null}
        tierAvailability={computeTierAvailability(data.sponsors, sponsorModal.sponsor)}
        // The per-prize gender control only appears when the competition crowns
        // winners split by gender. Known edge: if a super-admin later turns
        // winners_split_by_gender OFF, any prizes already tagged male/female keep
        // that value (and public chip) with no host UI to clear it. Acceptable
        // because that flag is not expected to be toggled off once set; revisit
        // if it becomes editable post-setup.
        genderSplit={!!competition?.winnersSplitByGender}
        onSave={async (wizardData) => {
          const sponsorData = wizardFormToSponsor(wizardData);
          if (sponsorModal.sponsor) {
            await updateSponsor(sponsorModal.sponsor.id, sponsorData);
          } else {
            await addSponsor(sponsorData);
          }
          setSponsorModal({ isOpen: false, sponsor: null });
        }}
      />
      <CharityModal
        isOpen={charityModal}
        onClose={() => setCharityModal(false)}
        charity={competition?.charityName ? {
          name: competition.charityName,
          logoUrl: competition.charityLogoUrl,
          websiteUrl: competition.charityWebsiteUrl,
        } : null}
        onSave={async (charityData) => {
          await updateCharity(charityData);
          setCharityModal(false);
        }}
        onRemove={async () => {
          await removeCharity();
          setCharityModal(false);
        }}
      />
      <EventModal
        isOpen={eventModal.isOpen}
        onClose={() => setEventModal({ isOpen: false, event: null })}
        event={eventModal.event}
        onSave={async (eventData) => {
          let result;
          if (eventModal.event) {
            result = await updateEvent(eventModal.event.id, eventData);
          } else {
            result = await addEvent(eventData);
          }
          if (result?.success === false) {
            toast.error(result.error || 'Failed to save event');
            return;
          }
          toast.success(eventModal.event ? 'Event updated' : 'Event added');
          setEventModal({ isOpen: false, event: null });
        }}
      />
      <PrizeModal
        isOpen={prizeModal.isOpen}
        onClose={() => setPrizeModal({ isOpen: false, prize: null, prizeType: 'winner' })}
        prize={prizeModal.prize}
        prizeType={prizeModal.prizeType}
        onSave={async (prizeData) => {
          if (prizeModal.prize) {
            await updatePrize(prizeModal.prize.id, prizeData);
          } else {
            await addPrize(prizeData);
          }
          setPrizeModal({ isOpen: false, prize: null, prizeType: 'winner' });
        }}
      />
      <AddPersonModal
        isOpen={addPersonModal.isOpen}
        onClose={closeAddPersonModal}
        onAdd={handleAddPerson}
        type={addPersonModal.type}
        competitionId={competitionId}
        splitByGender={!!competition?.winnersSplitByGender}
      />
      <ImportRosterModal
        isOpen={showImportRoster}
        onClose={() => setShowImportRoster(false)}
        onImport={handleImportRoster}
        splitByGender={!!competition?.winnersSplitByGender}
      />
    </>
  );
}
