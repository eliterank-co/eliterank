/**
 * DashboardPage - Host competition dashboard
 * 
 * Fetches the host's assigned competition and renders the competition dashboard.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores';
import { CompetitionDashboard } from '../features/competition-dashboard';
import DashboardSkeleton from '../components/skeletons/DashboardSkeleton';
import ErrorState from '../components/common/ErrorState';
import CreateCompetitionModal from '../components/modals/CreateCompetitionModal';
import { getCompetitionUrl, generateCompetitionSlug, slugify } from '../utils/slugs';

/**
 * Build competition display name from city and season
 */
function buildCompetitionName(competition) {
  if (!competition) return 'Unknown Competition';

  const city = competition.city || 'Unknown';
  const season = competition.season || new Date().getFullYear();

  // If city already includes "Most Eligible", use as-is
  if (city.toLowerCase().includes('most eligible')) {
    return city;
  }

  return `${city} Most Eligible ${season}`.trim();
}

/**
 * DashboardPage Component
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  
  // Use Zustand store for auth state
  const user = useAuthStore(s => s.user);
  const signOut = useAuthStore(s => s.signOut);
  
  // A host may run several competitions (primary host or co-host). We load all
  // of them so the dashboard can offer a switcher, and track which one is
  // currently selected.
  const [competitions, setCompetitions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createStep, setCreateStep] = useState('ready');
  const [searchParams, setSearchParams] = useSearchParams();

  // "Launch a new competition" (from the profile dropdown, anywhere) navigates
  // here with ?create=1 — open the create wizard even if the host already has a
  // competition, then strip the param so a refresh doesn't reopen it.
  useEffect(() => {
    if (searchParams.get('create')) {
      setCreateStep('ready');
      setShowCreate(true);
      const next = new URLSearchParams(searchParams);
      next.delete('create');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Fetch all competitions this user hosts (primary + co-hosted) from Supabase
  useEffect(() => {
    const fetchHostCompetitions = async () => {
      if (!user?.id || !supabase) {
        setCompetitions([]);
        setLoading(false);
        return;
      }

      try {
        const { data: coHostRows } = await supabase
          .from('competition_co_hosts')
          .select('competition_id')
          .eq('user_id', user.id);

        const coHostIds = (coHostRows ?? []).map((r) => r.competition_id);
        const filter = coHostIds.length > 0
          ? `host_id.eq.${user.id},id.in.(${coHostIds.join(',')})`
          : `host_id.eq.${user.id}`;

        const { data, error } = await supabase
          .from('competitions')
          .select(`
            *,
            voting_rounds:voting_rounds(*),
            nomination_periods:nomination_periods(*),
            organization:organizations(slug, name)
          `)
          .or(filter)
          .order('created_at', { ascending: false });

        if (error) {
          setCompetitions([]);
          setLoading(false);
          return;
        }

        const list = (data ?? []).map((competition) => ({
          ...competition,
          // Prefer the stored name so the switcher matches the dashboard
          // header; fall back to a city + season label when it's blank.
          name: competition.name?.trim() || buildCompetitionName(competition),
        }));
        setCompetitions(list);
        // Keep the current selection if it's still in the list, otherwise
        // default to the most recent competition.
        setSelectedId((prev) =>
          prev && list.some((c) => c.id === prev) ? prev : list[0]?.id ?? null
        );
      } catch (err) {
        setCompetitions([]);
        setFetchError(err);
      }
      setLoading(false);
    };

    fetchHostCompetitions();
  }, [user?.id]);

  const selectedCompetition = competitions.find((c) => c.id === selectedId) || null;

  const handleBack = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleLogout = useCallback(async () => {
    await signOut();
    navigate('/');
  }, [signOut, navigate]);

  const handleViewPublicSite = useCallback(() => {
    if (!selectedCompetition) return;

    const orgSlug = selectedCompetition?.organization?.slug || 'most-eligible';

    // Before a competition is published it isn't public, so the live page would
    // show "not currently public". Open it in the host coming-soon preview
    // (?preview=coming-soon) which the public page renders for any phase.
    const preLaunch = ['draft', 'pending_approval', 'approved'].includes(selectedCompetition?.status);
    const withPreview = (url) => (preLaunch ? `${url}${url.includes('?') ? '&' : '?'}preview=coming-soon` : url);
    const open = (url) => window.open(withPreview(url), '_blank');

    // Priority 1: Use the database slug directly (preferred)
    if (selectedCompetition?.slug) {
      open(getCompetitionUrl(orgSlug, selectedCompetition.slug));
      return;
    }

    // Priority 2: Use the competition ID — the most reliable lookup
    if (selectedCompetition?.id) {
      open(`/${orgSlug}/id/${selectedCompetition.id}`);
      return;
    }

    // Priority 3: Generate the slug from competition data
    const cityName = selectedCompetition?.city?.name || selectedCompetition?.city || '';
    const generatedSlug = generateCompetitionSlug({
      name: selectedCompetition?.name,
      citySlug: slugify(cityName),
      season: selectedCompetition?.season,
    });
    open(getCompetitionUrl(orgSlug, generatedSlug));
  }, [selectedCompetition]);


  if (loading) {
    return <DashboardSkeleton />;
  }

  if (fetchError) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c' }}>
        <ErrorState
          title="Failed to load dashboard"
          message="We couldn't load your competition data. Please try again."
          onRetry={() => { setFetchError(null); setLoading(true); }}
        />
      </div>
    );
  }

  // No competition yet — go straight to the launch wizard instead of a
  // separate landing page. Closing it returns home.
  if (!selectedCompetition) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0c' }}>
        <CreateCompetitionModal
          isOpen
          initialStep="ready"
          onClose={handleBack}
          userId={user?.id}
          onCreated={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <>
      <CompetitionDashboard
        competitionId={selectedCompetition.id}
        role="host"
        onBack={handleBack}
        onLogout={handleLogout}
        currentUserId={user?.id}
        onViewPublicSite={handleViewPublicSite}
        onLaunchCompetition={() => { setCreateStep('ready'); setShowCreate(true); }}
        competitions={competitions}
        selectedCompetitionId={selectedCompetition.id}
        onSelectCompetition={setSelectedId}
      />
      {/* Launch-another-competition wizard, opened via ?create=1. */}
      <CreateCompetitionModal
        isOpen={showCreate}
        initialStep={createStep}
        onClose={() => setShowCreate(false)}
        userId={user?.id}
        onCreated={() => window.location.reload()}
      />
    </>
  );
}
