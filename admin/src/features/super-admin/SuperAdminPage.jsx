import React, { useState, lazy, Suspense } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ArrowLeft, Loader } from 'lucide-react';
import { colors, spacing, borderRadius, typography, transitions } from '@shared/styles/theme';
import { HostAssignmentModal } from '@shared/components/modals';
import AdminSidebar from '../../components/AdminSidebar';
import AdminHeader from '../../components/AdminHeader';

// Lazy-load all manager components for code splitting
const CompetitionsManager = lazy(() => import('./components/CompetitionsManager'));
const HostsManager = lazy(() => import('./components/HostsManager'));
const CitiesManager = lazy(() => import('./components/CitiesManager'));
const OrganizationsManager = lazy(() => import('./components/OrganizationsManager'));
const AccountsManager = lazy(() => import('./components/AccountsManager'));
const RewardsManager = lazy(() => import('./components/RewardsManager'));
const SiteSettingsManager = lazy(() => import('./components/SiteSettingsManager'));
const PrizeRedemptionTracker = lazy(() => import('./components/PrizeRedemptionTracker'));
const InterestSubmissionsViewer = lazy(() => import('./components/InterestSubmissionsViewer'));
const CompetitionDashboard = lazy(() =>
  import('@shared/features/competition-dashboard').then((mod) => ({
    default: mod.CompetitionDashboard,
  }))
);

const SECTION_CONFIG = {
  competitions: { title: 'Competitions', subtitle: 'Create and manage competitions' },
  interests: { title: 'Interest Submissions', subtitle: 'Review pending submissions' },
  hosts: { title: 'Hosts', subtitle: 'Manage host accounts' },
  organizations: { title: 'Organizations', subtitle: 'Manage organizations' },
  accounts: { title: 'Account Enforcement', subtitle: 'Suspend, ban, or restore user accounts' },
  cities: { title: 'Cities', subtitle: 'Manage competition cities' },
  rewards: { title: 'Rewards', subtitle: 'Create and assign rewards' },
  redemptions: { title: 'Redemptions', subtitle: 'Track prize redemptions' },
  settings: { title: 'Site Settings', subtitle: 'Configure global settings' },
};

function SectionLoader() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.xxxl,
      color: colors.text.tertiary,
    }}>
      <Loader size={24} style={{ animation: 'spin 1s linear infinite' }} />
    </div>
  );
}

export default function SuperAdminPage({ onLogout, user, profile }) {
  const [activeSection, setActiveSection] = useState('competitions');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [viewingCompetition, setViewingCompetition] = useState(null);
  const [showHostAssignment, setShowHostAssignment] = useState(false);
  const [hostAssignCallback, setHostAssignCallback] = useState(null);

  // Interest submissions state - requires a competition to be selected
  const [interestCompetition, setInterestCompetition] = useState(null);

  const handleViewCompetition = (competition) => {
    setViewingCompetition(competition);
  };

  const handleBackToCompetitions = () => {
    setViewingCompetition(null);
  };

  const handleOpenHostAssignment = (callback) => {
    setHostAssignCallback(() => callback);
    setShowHostAssignment(true);
  };

  const handleCloseHostAssignment = () => {
    setShowHostAssignment(false);
    setHostAssignCallback(null);
  };

  const handleNavigate = (section) => {
    setActiveSection(section);
    // Clear competition view when navigating away
    if (section !== 'competitions') {
      setViewingCompetition(null);
    }
    // Clear interest competition when navigating away from interests
    if (section !== 'interests') {
      setInterestCompetition(null);
    }
  };

  const currentSection = viewingCompetition
    ? { title: 'Competition Dashboard', subtitle: viewingCompetition.name || 'Competition Details' }
    : SECTION_CONFIG[activeSection] || SECTION_CONFIG.competitions;

  const renderBackButton = () => {
    if (!viewingCompetition) return null;

    return (
      <button
        onClick={handleBackToCompetitions}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.xs,
          padding: `${spacing.xs} ${spacing.md}`,
          background: 'transparent',
          border: `1px solid ${colors.border.primary}`,
          borderRadius: borderRadius.md,
          color: colors.text.secondary,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.medium,
          cursor: 'pointer',
          transition: `all ${transitions.fast} ${transitions.ease}`,
          whiteSpace: 'nowrap',
          height: '32px',
          marginRight: spacing.sm,
        }}
      >
        <ArrowLeft size={14} />
        <span>Back</span>
      </button>
    );
  };

  const renderContent = () => {
    // If viewing a competition dashboard, render it in the content area
    if (viewingCompetition) {
      return (
        <MemoryRouter>
          <Suspense fallback={<SectionLoader />}>
            <CompetitionDashboard
              competitionId={viewingCompetition.id}
              role="superadmin"
              onBack={handleBackToCompetitions}
              onLogout={onLogout}
              onOpenHostAssignment={() => handleOpenHostAssignment(null)}
              onViewPublicSite={() => {
                const orgSlug = viewingCompetition?.organization?.slug || viewingCompetition?.organization_slug || 'most-eligible';
                // Use the competition's real DB slug; fall back to the always-valid
                // ID route. (The old citySlug-year guess didn't match the stored slug.)
                const base = viewingCompetition?.slug
                  ? `/${orgSlug}/${viewingCompetition.slug}`
                  : `/${orgSlug}/id/${viewingCompetition.id}`;
                // Before publish the live page isn't public, so open the host
                // coming-soon preview (super admins are allowed to view it).
                const preLaunch = ['draft', 'pending_approval', 'approved'].includes(viewingCompetition?.status);
                const path = preLaunch ? `${base}${base.includes('?') ? '&' : '?'}preview=coming-soon` : base;
                window.open(path, '_blank');
              }}
            />
          </Suspense>
        </MemoryRouter>
      );
    }

    switch (activeSection) {
      case 'competitions':
        return (
          <Suspense fallback={<SectionLoader />}>
            <CompetitionsManager onViewDashboard={handleViewCompetition} />
          </Suspense>
        );
      case 'interests':
        return (
          <Suspense fallback={<SectionLoader />}>
            <InterestSubmissionsViewer
              competition={interestCompetition}
              onClose={() => setInterestCompetition(null)}
            />
          </Suspense>
        );
      case 'hosts':
        return (
          <Suspense fallback={<SectionLoader />}>
            <HostsManager />
          </Suspense>
        );
      case 'organizations':
        return (
          <Suspense fallback={<SectionLoader />}>
            <OrganizationsManager />
          </Suspense>
        );
      case 'accounts':
        return (
          <Suspense fallback={<SectionLoader />}>
            <AccountsManager />
          </Suspense>
        );
      case 'cities':
        return (
          <Suspense fallback={<SectionLoader />}>
            <CitiesManager />
          </Suspense>
        );
      case 'rewards':
        return (
          <Suspense fallback={<SectionLoader />}>
            <RewardsManager />
          </Suspense>
        );
      case 'redemptions':
        return (
          <Suspense fallback={<SectionLoader />}>
            <PrizeRedemptionTracker />
          </Suspense>
        );
      case 'settings':
        return (
          <Suspense fallback={<SectionLoader />}>
            <SiteSettingsManager />
          </Suspense>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{
      display: 'flex',
      minHeight: '100vh',
      background: colors.background.primary,
    }}>
      <AdminSidebar
        activeSection={viewingCompetition ? 'competitions' : activeSection}
        onNavigate={handleNavigate}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        minWidth: 0,
      }}>
        <AdminHeader
          title={currentSection.title}
          subtitle={currentSection.subtitle}
          onLogout={onLogout}
          actions={renderBackButton()}
          user={user}
          profile={profile}
        />

        <main style={{
          flex: 1,
          overflow: 'auto',
          padding: spacing.xl,
        }}>
          {renderContent()}
        </main>
      </div>

      {/* Host Assignment Modal - available when viewing a competition */}
      {viewingCompetition && (
        <HostAssignmentModal
          isOpen={showHostAssignment}
          onClose={handleCloseHostAssignment}
          onAssign={async (userId) => {
            if (hostAssignCallback) {
              await hostAssignCallback(userId);
            }
            handleCloseHostAssignment();
          }}
          currentHostId={viewingCompetition.host_id}
        />
      )}

      {/* Inject keyframe for loader spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
