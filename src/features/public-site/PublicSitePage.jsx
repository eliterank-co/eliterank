import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Crown, Users, Calendar, Sparkles, Award, UserPlus, Trophy, Clock, ChevronLeft, Home, BookOpen } from 'lucide-react';
import { Button, Badge, OrganizationLogo } from '../../components/ui';
import { colors, spacing, borderRadius, typography, transitions, shadows, gradients, components, styleHelpers } from '../../styles/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { supabase } from '../../lib/supabase';
import { PROFILE_PUBLIC_COLS } from '../../constants/safeColumns';
import { COMPETITION_STATUSES } from '../../utils/competitionPhase';
import { useSponsors, useVotingRounds, useProfile } from '../../hooks/useCachedQuery';
import ContestantsTab from './components/ContestantsTab';
import EventsTab from './components/EventsTab';
import AnnouncementsTab from './components/AnnouncementsTab';
import AboutTab from './components/AboutTab';
import NominationTab from './components/NominationTab';
import WinnersTab from './components/WinnersTab';
import VoteModal from './components/VoteModal';
import CompetitionTeaser from './components/CompetitionTeaser';
import PublicProfileView from './components/PublicProfileView';
import UpcomingEventCard from './components/UpcomingEventCard';
import { getOrgLogo } from '../../lib/storageImage';

// A contestant's OWN profile wins over the contestant row.
//
// The contestant row is seeded by the host (roster import or a nomination) and
// is never written again when that person edits their profile — only `profiles`
// is. While the contestant row took priority, anything the host typed
// permanently shadowed what the contestant wrote about herself, so her edits
// looked like they never saved. The host's values stay as the fallback for
// entrants with no account, or fields they haven't filled in.
//
// `name` already behaved this way; everything else now matches it.
const own = (mine, hostValue) =>
  mine === null || mine === undefined || mine === '' ? hostValue : mine;

function profileFirstFields(c) {
  const profile = c.profile || {};
  const profileName = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
  return {
    name: profileName || c.name,
    age: own(profile.age, c.age),
    occupation: own(profile.occupation, c.occupation),
    bio: own(profile.bio, c.bio),
    avatarUrl: own(profile.avatar_url, c.avatar_url),
    avatar_url: own(profile.avatar_url, c.avatar_url),
    instagram: own(profile.instagram, c.instagram),
    twitter: own(profile.twitter, c.twitter),
    linkedin: own(profile.linkedin, c.linkedin),
    city: own(profile.city, c.city),
    hobbies: profile.interests?.length ? profile.interests : (c.interests || []),
    gallery: profile.gallery?.length ? profile.gallery : (c.gallery || []),
  };
}

const VOTING_TABS = [
  { id: 'contestants', label: 'Vote', mobileLabel: 'Vote', icon: Users },
  { id: 'events', label: 'Events', mobileLabel: 'Events', icon: Calendar },
  { id: 'announcements', label: 'News', mobileLabel: 'News', icon: Sparkles },
  { id: 'about', label: 'About', mobileLabel: 'About', icon: Award },
];

const NOMINATION_TABS = [
  { id: 'nominate', label: 'Nominate', mobileLabel: 'Nominate', icon: UserPlus },
  { id: 'events', label: 'Events', mobileLabel: 'Events', icon: Calendar },
  { id: 'announcements', label: 'News', mobileLabel: 'News', icon: Sparkles },
  { id: 'about', label: 'About', mobileLabel: 'About', icon: Award },
];

const COMPLETED_TABS = [
  { id: 'winners', label: 'Winners', mobileLabel: 'Winners', icon: Trophy },
  { id: 'events', label: 'Events', mobileLabel: 'Events', icon: Calendar },
  { id: 'announcements', label: 'News', mobileLabel: 'News', icon: Sparkles },
  { id: 'about', label: 'About', mobileLabel: 'About', icon: Award },
];

export default function PublicSitePage({
  isOpen,
  onClose,
  city = 'New York',
  season = '2026',
  phase = 'voting',
  contestants = [],
  events = [],
  announcements = [],
  judges = [],
  sponsors = [],
  host,
  winners = [],
  forceDoubleVoteDay: forceDoubleVoteDayProp,
  competition = null,
  isAuthenticated = false,
  onLogin,
  userEmail,
  userInstagram,
  user,
  canEditEvents = false,
  onEditEvent,
  onAddEvent,
}) {
  const { isMobile, isTablet } = useResponsive();

  // Use cached hooks for static data
  const competitionId = competition?.id;
  const { data: cachedSponsors, loading: sponsorsLoading } = useSponsors(competitionId);
  const { data: cachedVotingRounds, loading: votingRoundsLoading } = useVotingRounds(competitionId);
  const { data: cachedHostProfile, loading: hostLoading } = useProfile(competition?.host_id);

  // State for fetched data (contestants, events, announcements, judges need real-time updates)
  const [fetchedData, setFetchedData] = useState({
    contestants: [],
    events: [],
    announcements: [],
    judges: [],
    isDoubleVoteDay: false,
    loading: true,
  });

  // Transform cached host profile
  const transformedHost = useMemo(() => {
    if (!cachedHostProfile) return null;
    const hostProfile = cachedHostProfile;
    return {
      ...hostProfile,
      id: hostProfile.id,
      name: `${hostProfile.first_name || ''} ${hostProfile.last_name || ''}`.trim() || 'Host',
      first_name: hostProfile.first_name,
      last_name: hostProfile.last_name,
      title: hostProfile.occupation || 'Competition Host',
      bio: hostProfile.bio || '',
      avatar: hostProfile.avatar_url,
      avatar_url: hostProfile.avatar_url,
      instagram: hostProfile.instagram,
      twitter: hostProfile.twitter,
      linkedin: hostProfile.linkedin,
      city: hostProfile.city,
      hobbies: hostProfile.interests || [],
      gallery: hostProfile.gallery || [],
      occupation: hostProfile.occupation,
    };
  }, [cachedHostProfile]);

  // Transform cached sponsors
  const transformedSponsors = useMemo(() => {
    return (cachedSponsors || []).map(s => ({
      id: s.id, name: s.name, tier: s.tier, logo: s.logo_url, website: s.website,
    }));
  }, [cachedSponsors]);

  // Transform cached voting rounds
  const transformedVotingRounds = useMemo(() => {
    return (cachedVotingRounds || []).map(r => ({
      id: r.id,
      title: r.title,
      roundOrder: r.round_order,
      roundType: r.round_type || 'voting',
      startDate: r.start_date,
      endDate: r.end_date,
      contestantsAdvance: r.contestants_advance,
    }));
  }, [cachedVotingRounds]);

  // Fetch dynamic competition data (contestants, events, announcements, judges)
  useEffect(() => {
    const fetchCompetitionData = async () => {
      if (!competitionId || !supabase) {
        setFetchedData(prev => ({ ...prev, loading: false }));
        return;
      }

      try {
        // Fetch only dynamic data - sponsors, host, and voting rounds come from cached hooks.
        // The effective multiplier is the authoritative UTC-window and
        // competition-timezone calculation; render labels are never a second
        // pricing or credit authority.
        const [contestantsResult, eventsResult, announcementsResult, judgesResult, multiplierResult] = await Promise.all([
          // Join with profiles to get full profile data when contestant is linked to a user
          supabase.from('contestants').select(`*, profile:profiles!user_id(${PROFILE_PUBLIC_COLS})`).eq('competition_id', competitionId).order('votes', { ascending: false }),
          supabase.from('events').select('*').eq('competition_id', competitionId).order('date'),
          supabase.from('announcements').select('*').eq('competition_id', competitionId).order('pinned', { ascending: false }).order('published_at', { ascending: false }),
          supabase.rpc('get_competition_judges', { p_competition_id: competitionId }),
          supabase.rpc('effective_vote_multiplier', { p_competition_id: competitionId }),
        ]);

        setFetchedData({
          contestants: (contestantsResult.data || []).map((c, idx) => {
            return {
              ...c, // Pass through all contestant fields
              id: c.id,
              votes: c.votes || 0,
              rank: idx + 1,
              ...profileFirstFields(c),
            };
          }),
          events: (eventsResult.data || []).map(e => ({
            id: e.id, name: e.name, date: e.date, endDate: e.end_date, time: e.time,
            location: e.location, description: e.description, imageUrl: e.image_url,
            ticketUrl: e.ticket_url, status: e.status, featured: e.featured,
            isDoubleVoteDay: e.is_double_vote_day, publicVisible: e.public_visible,
          })),
          announcements: (announcementsResult.data || []).map(a => ({
            id: a.id, title: a.title, content: a.content, date: a.published_at, pinned: a.pinned,
          })),
          voteMultiplier: Number.isInteger(multiplierResult.data) ? multiplierResult.data : 1,
          isDoubleVoteDay: multiplierResult.data > 1,
          judges: (judgesResult.data || []).map(j => {
            // Merge profile data with judge data (profile has more fields)
            const profile = j.profile || {};
            return {
              ...j,
              id: j.id,
              name: j.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim(),
              title: j.title || profile.occupation,
              bio: j.bio || profile.bio,
              avatarUrl: j.avatar_url || profile.avatar_url,
              avatar_url: j.avatar_url || profile.avatar_url,
              instagram: j.instagram || profile.instagram,
              twitter: j.twitter || profile.twitter,
              linkedin: j.linkedin || profile.linkedin,
              city: j.city || profile.city,
              hobbies: j.interests || profile.interests || [],
              gallery: j.gallery || profile.gallery || [],
            };
          }),
          loading: false,
        });
      } catch (error) {
        console.error('Error fetching competition data:', error);
        setFetchedData(prev => ({ ...prev, loading: false }));
      }
    };

    fetchCompetitionData();
  }, [competitionId]);

  // Real-time subscription for contestant vote updates
  useEffect(() => {
    const competitionId = competition?.id;
    if (!competitionId || !supabase) return;

    const channel = supabase
      .channel(`competition-${competitionId}-votes`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contestants',
          filter: `competition_id=eq.${competitionId}`,
        },
        (payload) => {
          // Round finalization flips status / advancement_status / current_round
          // on the contestant row, so merge the full payload (not just votes)
          // to keep eliminated state in sync without a hard reload.
          setFetchedData((prev) => {
            const updatedContestants = prev.contestants
              .map((c) =>
                c.id === payload.new.id
                  ? {
                      ...c,
                      ...payload.new,
                      // payload.new is the raw contestant row, so re-apply the
                      // profile-first merge — otherwise every vote update would
                      // silently restore the host's copy of bio/photo/socials.
                      ...profileFirstFields({ ...payload.new, profile: c.profile }),
                    }
                  : c
              )
              .sort((a, b) => (b.votes || 0) - (a.votes || 0))
              .map((c, idx) => ({ ...c, rank: idx + 1 }));

            return {
              ...prev,
              contestants: updatedContestants,
            };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [competition?.id]);

  // Realtime: keep the numeric multiplier in sync if the host edits the schedule
  // mid-session. Without this the badge would stay stale until refresh while
  // the server is already doubling (or not).
  useEffect(() => {
    const competitionId = competition?.id;
    if (!competitionId || !supabase) return;

    const channel = supabase
      .channel(`competition-${competitionId}-doubledays`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'competition_double_days',
          filter: `competition_id=eq.${competitionId}`,
        },
        async () => {
          const { data } = await supabase.rpc('effective_vote_multiplier', {
            p_competition_id: competitionId,
          });
          setFetchedData((prev) => ({
            ...prev,
            voteMultiplier: Number.isInteger(data) ? data : 1,
            isDoubleVoteDay: data > 1,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [competition?.id]);

  // Callback to refresh contestant data after voting
  const handleVoteSuccess = useCallback(async () => {
    const competitionId = competition?.id;
    if (!competitionId || !supabase) return;

    try {
      const { data: contestantsData } = await supabase
        .from('contestants')
        .select(`*, profile:profiles!user_id(${PROFILE_PUBLIC_COLS})`)
        .eq('competition_id', competitionId)
        .order('votes', { ascending: false });

      if (contestantsData) {
        setFetchedData((prev) => ({
          ...prev,
          contestants: contestantsData.map((c, idx) => {
            const profile = c.profile || {};
            return {
              ...c,
              id: c.id,
              name: c.name,
              age: c.age || profile.age,
              occupation: c.occupation || profile.occupation,
              bio: c.bio || profile.bio,
              votes: c.votes || 0,
              rank: idx + 1,
              avatarUrl: c.avatar_url || profile.avatar_url,
              avatar_url: c.avatar_url || profile.avatar_url,
              instagram: c.instagram || profile.instagram,
              twitter: c.twitter || profile.twitter,
              linkedin: c.linkedin || profile.linkedin,
              city: c.city || profile.city,
              hobbies: c.interests || profile.interests || [],
              gallery: c.gallery || profile.gallery || [],
            };
          }),
        }));
      }
    } catch (error) {
      console.error('Error refreshing contestant data:', error);
    }
  }, [competition?.id]);

  // Use fetched data or fall back to props (sponsors, host, votingRounds come from cached hooks)
  const displayContestants = fetchedData.contestants.length > 0 ? fetchedData.contestants : contestants;
  const displayEvents = fetchedData.events.length > 0 ? fetchedData.events : events;
  const displayAnnouncements = fetchedData.announcements.length > 0 ? fetchedData.announcements : announcements;
  const displayJudges = fetchedData.judges.length > 0 ? fetchedData.judges : judges;
  const displaySponsors = transformedSponsors.length > 0 ? transformedSponsors : sponsors;
  const displayHost = transformedHost || host;

  // The is_double_vote_day RPC (server-side, timezone-aware) is the single
  // source of truth — see migration 051. Phase 3 wires up a realtime channel
  // so this stays fresh when the host edits the schedule mid-session.
  const isDoubleVoteDay = forceDoubleVoteDayProp !== undefined
    ? forceDoubleVoteDayProp
    : !!fetchedData.isDoubleVoteDay;
  const voteMultiplier = forceDoubleVoteDayProp !== undefined
    ? forceDoubleVoteDayProp ? 2 : 1
    : fetchedData.voteMultiplier || 1;

  // Compute current voting/judging round and its end date
  const currentRound = useMemo(() => {
    const rounds = transformedVotingRounds;
    if (!rounds || rounds.length === 0) return null;

    const now = new Date();

    // Find the active round (current time is between start and end)
    const activeRound = rounds.find(round => {
      if (!round.startDate || !round.endDate) return false;
      const start = new Date(round.startDate);
      const end = new Date(round.endDate);
      return now >= start && now < end;
    });

    if (activeRound) {
      return {
        ...activeRound,
        isActive: true,
      };
    }

    // If no active round, find the next upcoming round
    const upcomingRounds = rounds
      .filter(round => round.startDate && new Date(round.startDate) > now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (upcomingRounds.length > 0) {
      return {
        ...upcomingRounds[0],
        isActive: false,
        isUpcoming: true,
      };
    }

    return null;
  }, [transformedVotingRounds]);

  // Check if teaser page
  const isTeaser = competition?.isTeaser === true || competition?.status === COMPETITION_STATUSES.PUBLISH;

  if (isOpen && isTeaser) {
    return (
      <CompetitionTeaser
        competition={competition}
        onClose={onClose}
        isAuthenticated={isAuthenticated}
        onLogin={onLogin}
        user={user}
      />
    );
  }

  // Phase detection
  const isDraftPhase = phase === 'draft';
  const isNominationPhase = phase === 'nomination';
  const isVotingPhase = phase === 'voting';
  const isJudgingPhase = phase === 'judging';
  const isCompletedPhase = phase === 'completed' || phase === 'complete';

  // Determine tabs based on phase
  let TABS, defaultTab;
  if (isCompletedPhase) {
    TABS = COMPLETED_TABS;
    defaultTab = 'winners';
  } else if (isNominationPhase || isDraftPhase) {
    TABS = NOMINATION_TABS;
    defaultTab = 'nominate';
  } else {
    TABS = VOTING_TABS;
    defaultTab = 'contestants';
  }

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [selectedContestant, setSelectedContestant] = useState(null);
  const [voteCount, setVoteCount] = useState(1);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [viewingProfileRole, setViewingProfileRole] = useState('fan');

  const handleViewProfile = (profile, role = 'fan') => {
    setViewingProfile(profile);
    setViewingProfileRole(role);
  };

  const handleCloseProfile = () => {
    setViewingProfile(null);
    setViewingProfileRole('fan');
  };

  // Reset tab when phase changes
  useEffect(() => {
    let newDefaultTab;
    if (phase === 'completed' || phase === 'complete') newDefaultTab = 'winners';
    else if (phase === 'nomination' || phase === 'draft') newDefaultTab = 'nominate';
    else newDefaultTab = 'contestants';
    setActiveTab(newDefaultTab);
  }, [phase, city]);

  if (!isOpen) return null;

  const platinumSponsor = displaySponsors.find((s) => s.tier === 'Platinum');

  // Get status badge config
  const getStatusBadge = () => {
    if (isCompletedPhase) return { variant: 'gold', icon: Trophy, label: 'COMPLETED' };
    if (isJudgingPhase) return { variant: 'info', icon: Award, label: 'JUDGING' };
    if (isNominationPhase) return { variant: 'warning', icon: Sparkles, label: 'NOMINATING' };
    return { variant: 'success', icon: null, label: 'VOTING LIVE', dot: true };
  };

  const statusConfig = getStatusBadge();

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: colors.background.primary,
      zIndex: 100,
      overflow: 'auto',
      fontFamily: typography.fontFamily.sans,
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(10, 10, 12, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${colors.border.secondary}`,
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: isMobile ? `${spacing.md} ${spacing.lg}` : `${spacing.lg} ${spacing.xxl}`,
          ...styleHelpers.flexBetween,
        }}>
          {/* Left: Back + Title */}
          <div style={{ ...styleHelpers.flexStart, gap: spacing.md, flex: 1, minWidth: 0 }}>
            <button
              onClick={onClose}
              style={{
                ...styleHelpers.flexCenter,
                width: '36px',
                height: '36px',
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: borderRadius.lg,
                color: colors.text.secondary,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <ChevronLeft size={20} />
            </button>

            <div style={{ ...styleHelpers.flexStart, gap: spacing.md, minWidth: 0 }}>
              <OrganizationLogo
                logo={getOrgLogo(competition?.organization)}
                size={isMobile ? 32 : 40}
                style={{ borderRadius: borderRadius.md, flexShrink: 0 }}
              />
              <div style={{ minWidth: 0 }}>
                <p style={{
                  fontSize: typography.fontSize.xs,
                  color: colors.gold.primary,
                  fontWeight: typography.fontWeight.semibold,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  {competition?.organization?.name || 'Elite Rank'}
                </p>
                <p style={{
                  fontSize: isMobile ? typography.fontSize.md : typography.fontSize.lg,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text.primary,
                  ...styleHelpers.truncate,
                }}>
                  {city} · Season {season}
                </p>
              </div>
            </div>
          </div>

          {/* Right: Status Badge */}
          <div style={{ ...styleHelpers.flexStart, gap: spacing.md, flexShrink: 0 }}>
            <Badge variant={statusConfig.variant} size={isMobile ? 'sm' : 'md'} pill dot={statusConfig.dot}>
              {statusConfig.icon && <statusConfig.icon size={12} />}
              {!isMobile && statusConfig.label}
              {isMobile && statusConfig.label.split(' ')[0]}
            </Badge>
          </div>
        </div>
      </header>

      {/* Navigation - Desktop: under header, Mobile: bottom */}
      {!isMobile && (
        <nav style={{
          position: 'sticky',
          top: '73px',
          zIndex: 40,
          background: 'rgba(10, 10, 12, 0.9)',
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${colors.border.secondary}`,
        }}>
          <div style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: `0 ${spacing.xxl}`,
            display: 'flex',
            gap: 0,
          }}>
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    ...styleHelpers.flexCenter,
                    gap: spacing.sm,
                    padding: `${spacing.lg} ${spacing.xl}`,
                    background: 'none',
                    border: 'none',
                    borderBottom: `2px solid ${isActive ? colors.gold.primary : 'transparent'}`,
                    color: isActive ? colors.gold.primary : colors.text.secondary,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.medium,
                    cursor: 'pointer',
                    transition: `all ${transitions.fast}`,
                  }}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Main Content */}
      <main style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: isMobile ? `${spacing.lg} ${spacing.lg} 100px` : `${spacing.xxl} ${spacing.xxl}`,
        minHeight: isMobile ? 'calc(100vh - 140px)' : 'auto',
      }}>
        {/* Tabs with sidebar (contestants, nominate, winners, announcements) */}
        {['contestants', 'nominate', 'winners', 'announcements'].includes(activeTab) && (
          <div style={{
            display: isMobile ? 'block' : 'grid',
            gridTemplateColumns: isMobile ? '1fr' : '1fr 300px',
            gap: spacing.xxl,
          }}>
            {/* Main Column */}
            <div>
              {activeTab === 'winners' && (
                <WinnersTab
                  city={city}
                  season={season}
                  winners={winners}
                  competitionId={competition?.id}
                  onViewProfile={(profile) => handleViewProfile(profile, 'winner')}
                />
              )}
              {activeTab === 'nominate' && (
                <NominationTab
                  city={city}
                  competitionId={competition?.id}
                  onNominationSubmit={onClose}
                  isAuthenticated={isAuthenticated}
                  onLogin={onLogin}
                  userEmail={userEmail}
                  userInstagram={userInstagram}
                  formConfig={competition?.nomination_form_config}
                />
              )}
              {activeTab === 'contestants' && (
                <ContestantsTab
                  contestants={displayContestants}
                  events={displayEvents}
                  forceDoubleVoteDay={isDoubleVoteDay}
                  voteMultiplier={voteMultiplier}
                  onVote={setSelectedContestant}
                  isAuthenticated={isAuthenticated}
                  onLogin={onLogin}
                  isJudgingPhase={isJudgingPhase}
                  onViewProfile={(profile) => handleViewProfile(profile, 'contestant')}
                  currentRound={currentRound}
                />
              )}
              {activeTab === 'announcements' && (
                <AnnouncementsTab announcements={displayAnnouncements} city={city} season={season} competition={competition} />
              )}
            </div>

            {/* Sidebar Column */}
            {!isMobile && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                {/* Upcoming Event Card */}
                <UpcomingEventCard
                  events={displayEvents}
                  onViewAllEvents={() => setActiveTab('events')}
                />

                {/* Rules Summary Card */}
                {competition?.rules?.length > 0 && (
                  <div
                    style={{
                      background: colors.background.card,
                      border: `1px solid ${colors.border.light}`,
                      borderRadius: borderRadius.xl,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header */}
                    <div
                      style={{
                        padding: `${spacing.md} ${spacing.lg}`,
                        borderBottom: `1px solid ${colors.border.light}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: spacing.sm,
                      }}
                    >
                      <BookOpen size={16} style={{ color: colors.text.secondary }} />
                      <span
                        style={{
                          fontSize: typography.fontSize.sm,
                          fontWeight: typography.fontWeight.semibold,
                          color: colors.text.primary,
                        }}
                      >
                        Competition Rules
                      </span>
                    </div>
                    {/* Preview */}
                    <div style={{ padding: spacing.lg }}>
                      <p
                        style={{
                          fontSize: typography.fontSize.sm,
                          color: colors.text.secondary,
                          marginBottom: spacing.md,
                          lineHeight: 1.5,
                        }}
                      >
                        {competition.rules.length} rule section{competition.rules.length !== 1 ? 's' : ''} for this competition.
                      </p>
                      <button
                        onClick={() => setActiveTab('about')}
                        style={{
                          background: 'none',
                          border: `1px solid ${colors.border.light}`,
                          borderRadius: borderRadius.md,
                          padding: `${spacing.sm} ${spacing.md}`,
                          color: colors.text.primary,
                          fontSize: typography.fontSize.sm,
                          fontWeight: typography.fontWeight.medium,
                          cursor: 'pointer',
                          width: '100%',
                        }}
                      >
                        View Rules
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Full-width tabs (events, about) */}
        {activeTab === 'events' && (
          <EventsTab
            events={displayEvents}
            city={city}
            season={season}
            phase={phase}
            canEdit={canEditEvents}
            onEditEvent={onEditEvent}
            onAddEvent={onAddEvent}
          />
        )}
        {activeTab === 'about' && (
          <AboutTab
            judges={displayJudges}
            sponsors={displaySponsors}
            host={displayHost}
            city={city}
            competition={competition}
            onViewProfile={handleViewProfile}
          />
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      {isMobile && (
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: components.bottomBar.height,
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          background: 'rgba(10, 10, 12, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: `1px solid ${colors.border.secondary}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 100,
        }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  ...styleHelpers.flexColumn,
                  ...styleHelpers.flexCenter,
                  gap: '2px',
                  padding: spacing.sm,
                  background: 'none',
                  border: 'none',
                  color: isActive ? colors.gold.primary : colors.text.muted,
                  cursor: 'pointer',
                  transition: `all ${transitions.fast}`,
                  flex: 1,
                }}
              >
                <tab.icon size={22} />
                <span style={{
                  fontSize: '10px',
                  fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.normal,
                }}>
                  {tab.mobileLabel}
                </span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Vote Modal */}
      <VoteModal
        isOpen={!!selectedContestant}
        onClose={() => setSelectedContestant(null)}
        contestant={selectedContestant}
        voteCount={voteCount}
        onVoteCountChange={setVoteCount}
        forceDoubleVoteDay={isDoubleVoteDay}
        voteMultiplier={voteMultiplier}
        isAuthenticated={isAuthenticated}
        onLogin={onLogin}
        competitionId={competition?.id}
        user={user}
        onVoteSuccess={handleVoteSuccess}
        currentRound={currentRound}
        votePrice={competition?.price_per_vote}
        useBundler={competition?.use_price_bundler}
      />

      {/* Full-page Profile View */}
      {viewingProfile && (
        <PublicProfileView
          profile={viewingProfile}
          role={viewingProfileRole}
          onBack={handleCloseProfile}
        />
      )}
    </div>
  );
}
