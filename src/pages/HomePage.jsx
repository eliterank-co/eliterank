/**
 * HomePage - Public landing page showing competition listings
 *
 * Renders EliteRankCityModal in full-page mode as the main landing experience.
 */

import React, { lazy, Suspense, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore, useUserRole, useHasDashboardAccess, useUserName, ROLES } from '../stores';
import { useMyPerformance } from '../hooks';
import { getCompetitionUrl, generateCompetitionSlug } from '../utils/slugs';

const EliteRankCityModal = lazy(() => import('../components/modals/EliteRankCityModal'));
const ContestantGuide = lazy(() => import('../features/contestant-guide/ContestantGuide'));

/**
 * HomePage Component
 *
 * @param {Object} props
 * @param {Function} props.onShowLogin - Callback to show login modal
 * @param {Function} props.onShowProfile - Callback to show user profile
 * @param {Function} props.onShowRewards - Callback to show rewards page
 */
export default function HomePage({
  onShowLogin,
  onShowProfile,
  onShowRewards,
  onShowAchievements
}) {
  const navigate = useNavigate();

  // Use Zustand stores for auth state
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const user = useAuthStore(s => s.user);
  const profile = useAuthStore(s => s.profile);
  const signOut = useAuthStore(s => s.signOut);
  const userRole = useUserRole();

  // "How to Win" and "Rewards" show only while the user is still in the running
  // (active competition + not eliminated / not finished) — same rule as
  // PageHeader, so it's consistent across pages.
  const { performances } = useMyPerformance(user?.id);
  const isStillCompeting = performances.some((p) => p.isActive && p.status === 'active');
  const hasDashboardAccess = useHasDashboardAccess();
  const userName = useUserName();

  const handleOpenCompetition = useCallback((competition) => {
    const orgSlug = competition?.organization?.slug || competition?.orgSlug || 'most-eligible';

    // Priority 1: Use database slug directly (preferred)
    if (competition?.slug) {
      navigate(getCompetitionUrl(orgSlug, competition.slug));
      return;
    }

    // Priority 2: Use competition ID as fallback
    if (competition?.id) {
      navigate(`/${orgSlug}/id/${competition.id}`);
      return;
    }

    // Priority 3: Generate slug from competition data
    const generatedSlug = generateCompetitionSlug({
      name: competition?.name,
      citySlug: competition?.citySlug || competition?.city,
      season: competition?.season,
    });
    navigate(getCompetitionUrl(orgSlug, generatedSlug));
  }, [navigate]);

  const handleGoToDashboard = useCallback(() => {
    if (userRole === ROLES.SUPER_ADMIN) {
      // Admin is a separate app - use full page navigation
      window.location.href = '/admin/';
    } else if (userRole === ROLES.HOST) {
      navigate('/dashboard');
    }
  }, [userRole, navigate]);

  const handleLogout = useCallback(async () => {
    await signOut();
    navigate('/');
  }, [signOut, navigate]);

  // Guide modal state (generic guide for home page)
  const [showGuide, setShowGuide] = useState(false);

  const handleAccountSettings = useCallback(() => {
    navigate('/account');
  }, [navigate]);

  const handleHowToCompete = useCallback(() => {
    setShowGuide(true);
  }, []);

  // Launch-a-new-competition was missing on the landing page's profile menu, so
  // it appeared to "disappear" after coming back from a header that does show
  // it. Mirror PageHeader/CompetitionLayout: available to any authenticated user.
  const handleLaunchCompetition = useCallback(() => {
    navigate('/dashboard?create=1');
  }, [navigate]);

  const handleCloseGuide = useCallback(() => {
    setShowGuide(false);
  }, []);

  const handleHostInfo = useCallback(() => {
    navigate('/host');
  }, [navigate]);

  return (
    <Suspense fallback={<div className="min-h-screen bg-bg-primary" />}>
      <EliteRankCityModal
        isOpen={true}
        onClose={() => {}}
        isFullPage={true}
        onOpenCompetition={handleOpenCompetition}
        onLogin={onShowLogin}
        onDashboard={isAuthenticated && hasDashboardAccess ? handleGoToDashboard : null}
        onProfile={isAuthenticated ? onShowProfile : null}
        onRewards={isStillCompeting ? onShowRewards : null}
        onAchievements={isAuthenticated && profile?.is_nominee_or_contestant ? onShowAchievements : null}
        onAccountSettings={isAuthenticated ? handleAccountSettings : null}
        onHowToCompete={isStillCompeting ? handleHowToCompete : undefined}
        onLaunchCompetition={isAuthenticated ? handleLaunchCompetition : undefined}
        onHostInfo={handleHostInfo}
        isAuthenticated={isAuthenticated}
        userRole={userRole}
        userName={userName}
        onLogout={handleLogout}
      />

      {/* Generic Contestant Guide (no specific competition) */}
      {showGuide && (
        <Suspense fallback={null}>
          <ContestantGuide
            competition={null}
            mode="page"
            onClose={handleCloseGuide}
            onComplete={handleCloseGuide}
          />
        </Suspense>
      )}
    </Suspense>
  );
}
