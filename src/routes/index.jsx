/**
 * Routes Configuration
 *
 * Main route definitions for the EliteRank application.
 * Uses React Router v6 declarative routing.
 */

import React, { lazy, Suspense, useCallback } from 'react';
import { Routes, Route, useLocation, useNavigate, Navigate } from 'react-router-dom';

// Route guards and utilities
import ProtectedRoute, { ROLE } from './ProtectedRoute';
import { isCompetitionSlug, isIdRoute, isReservedPath } from '../utils/slugs';
import { resolveCompetitionAlias, toCanonicalAliasUrl } from '../config/competitionAliases';

// Common components
import ErrorBoundary from '../components/common/ErrorBoundary';

// Page skeletons for Suspense fallbacks
import CompetitionSkeleton from '../components/skeletons/CompetitionSkeleton';
import ProfileSkeleton from '../components/skeletons/ProfileSkeleton';
import DashboardSkeleton from '../components/skeletons/DashboardSkeleton';
import NotificationsSkeleton from '../components/skeletons/NotificationsSkeleton';
import AchievementsSkeleton from '../components/skeletons/AchievementsSkeleton';
import RewardsSkeleton from '../components/skeletons/RewardsSkeleton';

// Lazy-loaded pages
const HomePage = lazy(() => import('../pages/HomePage'));
const LoginPageWrapper = lazy(() => import('../pages/LoginPageWrapper'));
const ResetPasswordPage = lazy(() => import('../features/auth/ResetPasswordPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const ClaimPage = lazy(() => import('../pages/ClaimPage'));
const UserProfilePage = lazy(() => import('../pages/UserProfilePage'));
const UserRewardsPage = lazy(() => import('../pages/UserRewardsPage'));
const ViewPublicProfilePage = lazy(() => import('../pages/ViewPublicProfilePage'));
const AchievementsPage = lazy(() => import('../pages/AchievementsPage'));
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'));
const PerformancePage = lazy(() => import('../pages/PerformancePage'));
const CompetitionLayout = lazy(() => import('../pages/competition/CompetitionLayout'));
const HostPage = lazy(() => import('../pages/HostPage'));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage'));
const TermsPage = lazy(() => import('../pages/TermsPage'));
const CookiesPage = lazy(() => import('../pages/CookiesPage'));
const ContestTermsPage = lazy(() => import('../pages/ContestTermsPage'));
const PhotoBoothPage = lazy(() => import('../pages/PhotoBoothPage'));
const AccountSettingsPage = lazy(() => import('../pages/AccountSettingsPage'));
const JudgeClaimPage = lazy(() => import('../features/judge/JudgeClaimPage'));
const JudgeDashboardPage = lazy(() => import('../features/judge/JudgeDashboardPage'));
const JudgeScoringPage = lazy(() => import('../features/judge/JudgeScoringPage'));

const darkVoid = <div style={{ minHeight: '100vh', background: '#0a0a0c' }} />;

/**
 * Suspense wrapper — uses page-matching skeleton when provided, dark bg as default.
 * Wraps the fallback in a consistent page container so there is no layout shift
 * between skeleton and real content.
 */
function SuspenseWrapper({ children, fallback }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={
        fallback
          ? <div style={{ minHeight: '100vh', background: '#0a0a0c', animation: 'fadeIn 0.2s ease-out' }}>{fallback}</div>
          : darkVoid
      }>
        {children}
      </Suspense>
    </ErrorBoundary>
  );
}

/**
 * AppRoutes Component
 *
 * Main routing configuration. This component should be wrapped in AppShell
 * which handles auth state and common modals.
 */
export default function AppRoutes() {
  const location = useLocation();
  const navigate = useNavigate();

  // Check for password reset flow
  // Supabase sends users to: your-site.com/reset-password#access_token=xxx&type=recovery
  // Also support legacy format: your-site.com?reset=true#...
  const searchParams = new URLSearchParams(location.search);
  const isResetFlow = location.pathname === '/reset-password' ||
    searchParams.get('reset') === 'true' ||
    location.hash.includes('type=recovery');

  // Check if this is a competition route
  const pathParts = location.pathname.split('/').filter(Boolean);
  const competitionAlias = resolveCompetitionAlias(location.pathname);

  const isCompetitionRoute =
    Boolean(competitionAlias) ||
    (pathParts.length >= 2 &&
      !isReservedPath(pathParts[0]) &&
      (isIdRoute(pathParts[1]) || isCompetitionSlug(pathParts[1])));
  const isLegacyCompetitionRoute = pathParts[0] === 'c' && pathParts.length >= 2;

  // Handlers for HomePage
  const handleShowLogin = useCallback(() => {
    navigate('/login');
  }, [navigate]);

  const handleShowProfile = useCallback(() => {
    navigate('/profile');
  }, [navigate]);

  const handleShowRewards = useCallback(() => {
    navigate('/rewards');
  }, [navigate]);

  const handleShowAchievements = useCallback(() => {
    navigate('/achievements');
  }, [navigate]);

  const handleResetComplete = useCallback(() => {
    // Clear the URL params and navigate to home
    navigate('/', { replace: true });
  }, [navigate]);

  const handleResetBack = useCallback(() => {
    navigate('/login', { replace: true });
  }, [navigate]);

  if (competitionAlias?.shouldRedirect) {
    return (
      <Navigate
        to={`${toCanonicalAliasUrl(competitionAlias, location.search)}${location.hash || ''}`}
        replace
      />
    );
  }

  // Password reset flow - intercept before other routes
  if (isResetFlow) {
    return (
      <SuspenseWrapper>
        <ResetPasswordPage
          onComplete={handleResetComplete}
          onBack={handleResetBack}
        />
      </SuspenseWrapper>
    );
  }

  // Competition routes - handle separately for cleaner organization
  if (isCompetitionRoute || isLegacyCompetitionRoute) {
    return (
      <SuspenseWrapper fallback={<CompetitionSkeleton />}>
        <Routes>
          {/* ID-based lookup: /:orgSlug/id/:competitionId */}
          <Route path="/:orgSlug/id/:competitionId/*" element={<CompetitionLayout />} />
          {/* New format: /:orgSlug/:slug/* */}
          <Route path="/:orgSlug/:slug/*" element={<CompetitionLayout />} />
          {/* Legacy format: /c/:orgSlug/:citySlug/:year/* */}
          <Route path="/c/:orgSlug/:citySlug/:year/*" element={<CompetitionLayout />} />
          <Route path="/c/:orgSlug/:citySlug/*" element={<CompetitionLayout />} />
          {/* One-segment customer aliases are resolved by the shared authority. */}
          <Route path="/:alias/*" element={<CompetitionLayout />} />
        </Routes>
      </SuspenseWrapper>
    );
  }

  return (
    <Routes>
      {/* Public routes */}
      <Route
        path="/"
        element={
          <SuspenseWrapper>
            <HomePage
              onShowLogin={handleShowLogin}
              onShowProfile={handleShowProfile}
              onShowRewards={handleShowRewards}
              onShowAchievements={handleShowAchievements}
            />
          </SuspenseWrapper>
        }
      />

      {/* Login page */}
      <Route
        path="/login"
        element={
          <SuspenseWrapper>
            <LoginPageWrapper />
          </SuspenseWrapper>
        }
      />

      {/* Host marketing page — interactive features-by-format explorer */}
      <Route
        path="/host"
        element={
          <SuspenseWrapper>
            <HostPage />
          </SuspenseWrapper>
        }
      />

      {/* Legal pages */}
      <Route
        path="/privacy"
        element={
          <SuspenseWrapper>
            <PrivacyPage />
          </SuspenseWrapper>
        }
      />
      <Route
        path="/terms"
        element={
          <SuspenseWrapper>
            <TermsPage />
          </SuspenseWrapper>
        }
      />
      <Route
        path="/cookies"
        element={
          <SuspenseWrapper>
            <CookiesPage />
          </SuspenseWrapper>
        }
      />
      <Route
        path="/contest-terms"
        element={
          <SuspenseWrapper>
            <ContestTermsPage />
          </SuspenseWrapper>
        }
      />

      {/* Photo booth (temporary event page) */}
      <Route
        path="/photobooth"
        element={
          <SuspenseWrapper>
            <PhotoBoothPage />
          </SuspenseWrapper>
        }
      />

      {/* Claim nomination flow */}
      <Route
        path="/claim/:token"
        element={
          <SuspenseWrapper>
            <ClaimPage />
          </SuspenseWrapper>
        }
      />
      <Route
        path="/claim/:token/complete"
        element={
          <SuspenseWrapper>
            <ClaimPage />
          </SuspenseWrapper>
        }
      />

      {/* Judge invite claim flow — public; sets password and signs the judge in */}
      <Route
        path="/claim-judge/:token"
        element={
          <SuspenseWrapper>
            <JudgeClaimPage />
          </SuspenseWrapper>
        }
      />

      {/* Judge dashboard — assignments and rounds */}
      <Route
        path="/judge"
        element={
          <ProtectedRoute>
            <SuspenseWrapper>
              <JudgeDashboardPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />
      <Route
        path="/judge/:competitionId/round/:roundId"
        element={
          <ProtectedRoute>
            <SuspenseWrapper>
              <JudgeScoringPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* Protected routes - require authentication */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <SuspenseWrapper fallback={<ProfileSkeleton />}>
              <UserProfilePage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/rewards"
        element={
          <ProtectedRoute>
            <SuspenseWrapper fallback={<RewardsSkeleton />}>
              <UserRewardsPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/achievements"
        element={
          <ProtectedRoute>
            <SuspenseWrapper fallback={<AchievementsSkeleton />}>
              <AchievementsPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <SuspenseWrapper fallback={<NotificationsSkeleton />}>
              <NotificationsPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/performance"
        element={
          <ProtectedRoute>
            <SuspenseWrapper>
              <PerformancePage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      <Route
        path="/account"
        element={
          <ProtectedRoute>
            <SuspenseWrapper>
              <AccountSettingsPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* View other user's public profile */}
      <Route
        path="/profile/:profileId"
        element={
          <SuspenseWrapper fallback={<ProfileSkeleton />}>
            <ViewPublicProfilePage />
          </SuspenseWrapper>
        }
      />

      {/* Host dashboard — any signed-in user can reach it. Hosts/co-hosts see
          their competitions; everyone else gets the "Launch your competition"
          create CTA (self-serve onboarding). Publishing stays admin-approved. */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <SuspenseWrapper fallback={<DashboardSkeleton />}>
              <DashboardPage />
            </SuspenseWrapper>
          </ProtectedRoute>
        }
      />

      {/* Catch-all redirect to home */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// Re-export route utilities
export { ProtectedRoute, ROLE };
