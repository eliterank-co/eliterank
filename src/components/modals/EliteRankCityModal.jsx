import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Crown, MapPin, Calendar, Trophy, Clock, ChevronRight, Sparkles, Users,
  Activity, Info, User, Megaphone, Award, Building, Heart,
  Home, Search, Bell, Menu, ArrowRight, Play, ExternalLink
} from 'lucide-react';
import { Button, Badge, OrganizationLogo, ProfileIcon, NotificationBell, EliteRankCrown, CrownIcon } from '../ui';
import { useAppSettings } from '../../hooks';
import { useAuthStore } from '../../stores';
import { colors, spacing, borderRadius, typography, shadows, transitions, gradients, components, styleHelpers } from '../../styles/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { supabase } from '../../lib/supabase';
import { getOrgLogo } from '../../lib/storageImage';
import { useTrimmedLogo } from '../../lib/trimLogo';
import {
  useCities,
  useOrganizations,
  useVotingRounds,
} from '../../hooks/useCachedQuery';
import {
  computeCompetitionPhase,
  isCompetitionVisible,
  isCompetitionAccessible,
  getPhaseDisplayConfig,
  COMPETITION_STATUSES,
  shouldAutoTransitionToLive,
  shouldAutoTransitionToCompleted,
  isLive,
  isPublished,
  isCompleted,
  compareByFinalizationProximity,
} from '../../utils/competitionPhase';
import { getCompetitionImage } from '../../utils/cityImages';
import { SkeletonPulse, SkeletonCard, SkeletonText } from '../common/Skeleton';

// Tab configuration
// Custom wrapper to make CrownIcon work like lucide icons
const CrownIconWrapper = ({ size, style }) => <CrownIcon size={size} color="currentColor" style={style} />;

const TABS = [
  { id: 'competitions', label: 'Explore', icon: CrownIconWrapper, mobileIcon: Home },
  { id: 'events', label: 'Events', icon: Calendar, mobileIcon: Calendar },
  { id: 'announcements', label: 'News', icon: Megaphone, mobileIcon: Bell },
  { id: 'about', label: 'About', icon: Info, mobileIcon: Info },
];

export default function EliteRankCityModal({
  isOpen,
  onClose,
  onOpenCompetition,
  onOpenTeaser,
  isFullPage = false,
  onLogin,
  onDashboard,
  onProfile,
  onRewards,
  onAchievements,
  onAccountSettings,
  onHowToCompete,
  onLaunchCompetition,
  onHostInfo,
  isAuthenticated = false,
  userRole = 'fan',
  userName,
  onLogout,
}) {
  const { isMobile, isTablet, width } = useResponsive();

  // Get user and profile data for ProfileIcon
  const user = useAuthStore(s => s.user);
  const profile = useAuthStore(s => s.profile);

  // Check if user has dashboard access
  const hasDashboardAccess = profile?.is_host || profile?.is_super_admin;
  const [activeTab, setActiveTab] = useState('competitions');
  const [showCrownAnimation, setShowCrownAnimation] = useState(true);
  const [hoveredCard, setHoveredCard] = useState(null);
  // Raw competition rows + related lookup maps. Mapping to display shape is
  // done in a useMemo below so it reacts to static-data (cities/orgs/profiles)
  // arriving without needing to re-fetch competitions.
  const [rawCompetitions, setRawCompetitions] = useState(null);
  const [votingRoundsMap, setVotingRoundsMap] = useState({});
  const [nominationPeriodsMap, setNominationPeriodsMap] = useState({});
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [statusFilter, setStatusFilter] = useState('active'); // Default to Live competitions
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Use cached hooks for static data (cities, organizations)
  const { data: cachedCities, loading: citiesLoading } = useCities();
  const { data: cachedOrganizations, loading: orgsLoading } = useOrganizations();

  // Fetch Hall of Winners settings
  const { data: hallOfWinnersData } = useAppSettings('hall_of_winners');

  // Memoize maps for quick lookups
  const cities = cachedCities || [];
  const organizations = cachedOrganizations || [];
  const citiesMap = useMemo(() => {
    return cities.reduce((acc, c) => { acc[c.id] = c; return acc; }, {});
  }, [cities]);

  // Fetch competitions + voting rounds + nomination periods.
  // Fires immediately when the modal opens — in parallel with the static
  // cities/orgs/profiles hooks — instead of waiting for them. The mapping
  // that actually *needs* the static data happens in a useMemo below, so
  // cards enrich as each source resolves without a second fetch.
  useEffect(() => {
    if (!isOpen || !supabase) return;
    let cancelled = false;

    const fetchData = async () => {
      try {
        const [compsResult, votingRoundsResult, nominationPeriodsResult] = await Promise.all([
          supabase
            .from('competitions')
            .select('*, host:profiles!competitions_host_id_fkey(id, first_name, last_name, avatar_url)')
            .order('created_at', { ascending: false }),
          supabase.from('voting_rounds').select('*').order('round_order'),
          supabase.from('nomination_periods').select('*').order('period_order'),
        ]);
        if (cancelled) return;

        const vrMap = (votingRoundsResult.data || []).reduce((acc, r) => {
          if (!acc[r.competition_id]) acc[r.competition_id] = [];
          acc[r.competition_id].push(r);
          return acc;
        }, {});
        const npMap = (nominationPeriodsResult.data || []).reduce((acc, p) => {
          if (!acc[p.competition_id]) acc[p.competition_id] = [];
          acc[p.competition_id].push(p);
          return acc;
        }, {});

        // Auto-transitions (settings are now directly on competition).
        // Only needs the competition + its nomination periods, not static data.
        const toTransition = [];
        for (const comp of (compsResult.data || [])) {
          const compWithPeriods = {
            ...comp,
            nomination_periods: npMap[comp.id] || [],
          };
          if (shouldAutoTransitionToLive(compWithPeriods, comp)) {
            toTransition.push({ id: comp.id, newStatus: 'live' });
          } else if (shouldAutoTransitionToCompleted(compWithPeriods, comp)) {
            toTransition.push({ id: comp.id, newStatus: 'completed' });
          }
        }

        if (toTransition.length > 0) {
          for (const { id, newStatus } of toTransition) {
            await supabase.from('competitions').update({ status: newStatus }).eq('id', id);
          }
          const { data: updated } = await supabase
            .from('competitions')
            .select('*')
            .order('created_at', { ascending: false });
          if (cancelled) return;
          if (updated) compsResult.data = updated;
        }

        setRawCompetitions(compsResult.data || []);
        setVotingRoundsMap(vrMap);
        setNominationPeriodsMap(npMap);
        // Events & announcements are fetched lazily when their tabs are selected
      } catch {
        // Silent fail — drop to empty state rather than an endless skeleton
        if (!cancelled) setRawCompetitions([]);
      }
    };

    fetchData();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Map raw competitions → display shape. Re-runs when raw data or any of the
  // static lookup sources update, so host/city/org info fills in as it loads.
  const competitions = useMemo(() => {
    if (!rawCompetitions) return [];
    return rawCompetitions.map(comp => {
      const compWithSettings = {
        ...comp,
        voting_rounds: votingRoundsMap[comp.id] || [],
        nomination_periods: nominationPeriodsMap[comp.id] || [],
      };
      const computedPhase = computeCompetitionPhase(compWithSettings);
      const visible = isCompetitionVisible(comp.status);
      const accessible = isCompetitionAccessible(comp.status);
      const cityFromLookup = citiesMap[comp.city_id];
      // Prioritize city lookup by city_id over potentially stale comp.city string
      const cityName = cityFromLookup?.name || comp.city || 'Unknown City';
      const hostProfile = comp.host || null;
      const org = organizations.find(o => o.id === comp.organization_id);

      return {
        id: comp.id,
        name: comp.name || `Most Eligible ${cityName}`,
        slug: comp.slug,
        city: cityName,
        cityState: cityFromLookup?.state || '',
        citySlug: cityFromLookup?.slug || cityName.toLowerCase().replace(/\s+/g, '-'),
        cityId: comp.city_id,
        season: comp.season || new Date().getFullYear(),
        status: (comp.status || COMPETITION_STATUSES.DRAFT).toLowerCase(),
        phase: computedPhase,
        visible,
        accessible,
        organizationId: comp.organization_id,
        orgSlug: org?.slug,
        organization: org ? { id: org.id, name: org.name, logo_url: org.logo_url || org.logo, header_logo_url: org.header_logo_url || null, slug: org.slug } : null,
        host_id: comp.host_id,
        host: hostProfile ? {
          id: hostProfile.id,
          name: `${hostProfile.first_name || ''} ${hostProfile.last_name || ''}`.trim() || 'Host',
          avatar: hostProfile.avatar_url,
        } : null,
        winners: comp.winners || [],
        nomination_start: compWithSettings.nomination_start,
        nomination_end: compWithSettings.nomination_end,
        voting_start: compWithSettings.voting_start,
        voting_end: compWithSettings.voting_end,
        finals_date: compWithSettings.finals_date,
        createdAt: comp.created_at,
        voting_rounds: compWithSettings.voting_rounds,
        nomination_periods: compWithSettings.nomination_periods,
      };
    });
  }, [rawCompetitions, votingRoundsMap, nominationPeriodsMap, citiesMap, organizations]);

  // Skeleton while competitions are in flight OR any static source is still
  // loading — otherwise cards would flash "Unknown City" then correct city.
  const loading = rawCompetitions === null || citiesLoading || orgsLoading;

  // Lazy-fetch events and announcements when their tabs are first selected
  const [eventsFetched, setEventsFetched] = useState(false);
  const [announcementsFetched, setAnnouncementsFetched] = useState(false);

  useEffect(() => {
    if (activeTab === 'events' && !eventsFetched && competitions.length > 0) {
      setEventsFetched(true);
      supabase.from('events').select('*').order('date', { ascending: true })
        .then(({ data }) => {
          if (data) {
            setEvents(data.map(event => {
              const comp = competitions.find(c => c.id === event.competition_id);
              return { ...event, competitionName: comp?.name || 'Elite Rank', cityName: comp?.city || 'Unknown' };
            }));
          }
        });
    }
    if (activeTab === 'announcements' && !announcementsFetched && competitions.length > 0) {
      setAnnouncementsFetched(true);
      supabase.from('announcements').select('*').order('published_at', { ascending: false })
        .then(({ data }) => {
          if (data) {
            setAnnouncements(data.map(a => {
              const comp = competitions.find(c => c.id === a.competition_id);
              return { ...a, competitionName: comp?.name || 'Elite Rank', cityName: comp?.city || 'Unknown', organization: comp?.organization || null };
            }));
          }
        });
    }
  }, [activeTab, eventsFetched, announcementsFetched, competitions]);

  const visibleCompetitions = useMemo(() => {
    return competitions
      .filter(c => {
        if (!c.visible) return false;
        if (statusFilter === 'active') {
          return isLive(c.status) && ['nomination', 'voting', 'judging', 'between'].includes(c.phase);
        }
        if (statusFilter === 'upcoming') return isPublished(c.status);
        if (statusFilter === 'complete') return isCompleted(c.status) || c.phase === 'completed';
        return true;
      })
      // Surface whichever competition is closest to finalizing first, so the
      // most time-sensitive one (e.g. in voting) leads over earlier ones (e.g.
      // still taking nominations).
      .sort(compareByFinalizationProximity);
  }, [competitions, statusFilter]);

  // Competition counts for header stats
  const competitionStats = useMemo(() => {
    const visible = competitions.filter(c => c.visible);
    const active = visible.filter(c => isLive(c.status) && ['nomination', 'voting', 'judging', 'between'].includes(c.phase)).length;
    const openingSoon = visible.filter(c => isPublished(c.status)).length;
    return { active, openingSoon };
  }, [competitions]);

  const getOrg = (orgId) => organizations.find(o => o.id === orgId);

  const handleCompetitionClick = (competition) => {
    if (onOpenCompetition) {
      onOpenCompetition(competition);
    }
  };

  if (!isOpen) return null;

  // ============================================
  // COMPETITION CARD - Modern, Instagram-style
  // ============================================
  const CompetitionCard = ({ competition }) => {
    const isHovered = hoveredCard === competition.id;
    const displayPhase = competition.accessible ? competition.phase : competition.status;
    const config = getPhaseDisplayConfig(displayPhase);
    const isClickable = competition.accessible || isPublished(competition.status);
    // The CTA already states the status for completed ("View Winners") and
    // coming-soon ("Coming Soon") cards, so the redundant status badge is
    // omitted for those. Live cards keep their pulsing indicator.
    const hideStatusBadge = displayPhase === 'completed' || isPublished(competition.status);
    const cityImage = getCompetitionImage(competition);
    const org = getOrg(competition.organizationId);
    // Show the host logo constrained by HEIGHT (width flexes) so logos of any
    // shape read at a consistent size: a wide wordmark stays wide and legible
    // instead of being shrunk to fit a square slot. Trim padding first so the
    // mark fills its height. Falls back to the square OrganizationLogo (which
    // handles the no-logo crown / emoji cases).
    const rawLogo = org ? (getOrgLogo(org) || org.logo) : null;
    const isImageLogo = typeof rawLogo === 'string' && rawLogo.startsWith('http');
    const trimmedLogo = useTrimmedLogo(isImageLogo ? rawLogo : null);

    const getCtaText = () => {
      if (isPublished(competition.status)) return 'Coming Soon';
      if (competition.phase === 'nomination') return 'Nominate';
      if (competition.phase === 'voting') return 'Vote Now';
      if (competition.phase === 'completed') return 'View Winners';
      return 'View';
    };

    return (
      <div
        onClick={() => handleCompetitionClick(competition)}
        onMouseEnter={() => setHoveredCard(competition.id)}
        onMouseLeave={() => setHoveredCard(null)}
        style={{
          position: 'relative',
          borderRadius: isMobile ? borderRadius.xxl : borderRadius.xl,
          overflow: 'hidden',
          cursor: isClickable ? 'pointer' : 'default',
          transform: isHovered && isClickable ? 'translateY(-8px) scale(1.01)' : 'translateY(0) scale(1)',
          transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isHovered
            ? '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(212, 175, 55, 0.2)'
            : '0 10px 30px -10px rgba(0, 0, 0, 0.3)',
          aspectRatio: isMobile ? '16/10' : '16/9',
          background: colors.background.card,
        }}
      >
        {/* Background Image */}
        <img
          src={cityImage}
          alt={competition.name}
          loading="eager"
          fetchpriority="high"
          style={{
            ...styleHelpers.absoluteFill,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            transition: 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isHovered ? 'scale(1.08)' : 'scale(1)',
          }}
        />

        {/* Gradient Overlay */}
        <div style={{
          ...styleHelpers.absoluteFill,
          background: isMobile
            ? 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.4) 100%)'
            : 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.7) 40%, rgba(0,0,0,0.5) 70%, rgba(0,0,0,0.4) 100%)',
          transition: 'opacity 0.3s',
          opacity: isHovered ? 0.9 : 1,
        }} />

        {/* Shine effect on hover */}
        {isHovered && (
          <div style={{
            ...styleHelpers.absoluteFill,
            background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.03) 45%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0.03) 55%, transparent 60%)',
            animation: 'shine 1.5s ease-in-out',
          }} />
        )}

        {/* Content */}
        <div style={{
          position: 'relative',
          height: '100%',
          padding: isMobile ? spacing.lg : spacing.xl,
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Top Row */}
          <div style={{ ...styleHelpers.flexBetween }}>
            {hideStatusBadge ? (
              /* Empty spacer keeps the org logo right-aligned */
              <span />
            ) : config.pulse ? (
              <span style={{
                width: isMobile ? '10px' : '12px',
                height: isMobile ? '10px' : '12px',
                borderRadius: '50%',
                background: colors.status.success,
                boxShadow: `0 0 6px ${colors.status.success}`,
                animation: 'pulseGlow 2s infinite',
              }} />
            ) : (
              <Badge variant={config.variant} size={isMobile ? 'sm' : 'md'} pill dot={false}>
                {config.label}
              </Badge>
            )}
            {org && (
              isImageLogo ? (
                <img
                  src={trimmedLogo}
                  alt={org.name || 'Organization logo'}
                  style={{
                    height: isMobile ? '34px' : '42px',
                    width: 'auto',
                    maxWidth: isMobile ? '100px' : '128px',
                    objectFit: 'contain',
                    objectPosition: 'top right',
                    // No frosted container — the logo sits directly on the
                    // photo; a soft shadow keeps light logos legible.
                    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
                    transition: 'transform 0.3s',
                    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              ) : (
                <OrganizationLogo
                  logo={rawLogo}
                  size={isMobile ? 44 : 52}
                  style={{
                    filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.45))',
                    transition: 'transform 0.3s',
                    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
                  }}
                />
              )
            )}
          </div>

          {/* Bottom Content — the competition name carries the brand;
              the logo is already shown in the card corner, so we don't
              need the uppercase org label repeating the name. */}
          <div style={{ marginTop: 'auto' }}>
            <h3 style={{
              fontSize: isMobile ? typography.fontSize.xl : typography.fontSize['2xl'],
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              marginBottom: spacing.sm,
              lineHeight: typography.lineHeight.tight,
              textShadow: '0 2px 10px rgba(0,0,0,0.3)',
            }}>
              {competition.name}
            </h3>

            <div style={{
              ...styleHelpers.flexStart,
              gap: spacing.lg,
              marginBottom: spacing.md,
            }}>
              <div style={{ ...styleHelpers.flexStart, gap: spacing.xs }}>
                <MapPin size={14} style={{ color: colors.gold.primary }} />
                <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
                  {competition.city}
                </span>
              </div>
              <div style={{ ...styleHelpers.flexStart, gap: spacing.xs }}>
                <Calendar size={14} style={{ color: colors.text.secondary }} />
                <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
                  Season {competition.season}
                </span>
              </div>
            </div>

            {/* CTA Button */}
            {isClickable && (
              <div style={{
                ...styleHelpers.flexCenter,
                gap: spacing.sm,
                padding: `${spacing.sm} ${spacing.lg}`,
                background: isHovered ? colors.gold.primary : 'rgba(212, 175, 55, 0.15)',
                border: `1.5px solid ${colors.gold.primary}`,
                borderRadius: borderRadius.lg,
                color: isHovered ? colors.text.inverse : colors.gold.primary,
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                width: 'fit-content',
                transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
              }}>
                {competition.phase === 'voting' && <Play size={14} />}
                {getCtaText()}
                <ArrowRight size={14} style={{
                  transition: 'transform 0.3s',
                  transform: isHovered ? 'translateX(4px)' : 'translateX(0)',
                }} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ============================================
  // FILTER BAR - Clean, minimal
  // ============================================
  const FilterBar = () => (
    <div style={{
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      marginBottom: spacing.xl,
      padding: isMobile ? `0 ${spacing.lg}` : 0,
      flexWrap: 'wrap',
    }}>
      {/* Status Pills */}
      <div style={{
        display: 'flex',
        gap: spacing.sm,
        overflowX: 'auto',
        paddingBottom: isMobile ? spacing.sm : 0,
        ...styleHelpers.hideScrollbar,
      }}>
        {[
          { id: 'active', label: 'Live', dot: true },
          { id: 'upcoming', label: 'Coming Soon' },
          { id: 'complete', label: 'Complete' },
        ].map((filter) => (
          <button
            key={filter.id}
            onClick={() => setStatusFilter(filter.id)}
            style={{
              ...styleHelpers.flexCenter,
              gap: spacing.xs,
              padding: `${spacing.sm} ${spacing.lg}`,
              background: statusFilter === filter.id ? colors.gold.muted : 'transparent',
              border: statusFilter === filter.id ? `1.5px solid ${colors.gold.primary}` : `1px solid ${colors.border.primary}`,
              borderRadius: borderRadius.pill,
              color: statusFilter === filter.id ? colors.gold.primary : colors.text.secondary,
              fontSize: typography.fontSize.sm,
              fontWeight: typography.fontWeight.medium,
              cursor: 'pointer',
              transition: `all ${transitions.fast}`,
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {filter.dot && statusFilter === filter.id && (
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: colors.status.success,
                animation: 'pulse 2s infinite',
              }} />
            )}
            {filter.label}
          </button>
        ))}
      </div>
    </div>
  );

  // ============================================
  // WINNER AVATAR - handles load/error gracefully
  // ============================================
  const WinnerAvatar = ({ src, name }) => {
    const [failed, setFailed] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const initial = name?.charAt(0) || '?';

    return (
      <div style={{
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: colors.background.card,
        border: `2px solid rgba(212, 175, 55, 0.3)`,
        ...styleHelpers.flexCenter,
        flexShrink: 0,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {(!src || failed || !loaded) && (
          <User size={18} style={{ color: colors.text.muted }} />
        )}
        {src && !failed && (
          <img
            src={src}
            alt={name}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: loaded ? 1 : 0,
              transition: 'opacity 0.2s ease',
            }}
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    );
  };

  // ============================================
  // HALL OF WINNERS - Champions showcase
  // ============================================
  const HallOfWinners = () => {
    // Use dynamic data from app settings
    const winners = hallOfWinnersData?.winners || [];
    const year = hallOfWinnersData?.year || new Date().getFullYear();
    const [igMap, setIgMap] = useState({});

    useEffect(() => {
      const profileIds = winners.slice(0, 5).map(w => w.profileId).filter(Boolean);
      if (!profileIds.length) return;
      supabase
        .from('profiles')
        .select('id, instagram')
        .in('id', profileIds)
        .then(({ data }) => {
          if (data) {
            const m = {};
            data.forEach(p => { if (p.instagram) m[p.id] = p.instagram; });
            setIgMap(m);
          }
        });
    }, [winners]);

    const getIgUrl = (winner) => {
      const handle = igMap[winner.profileId];
      if (!handle) return null;
      const clean = handle.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/\/$/, '');
      return `https://instagram.com/${clean}`;
    };

    if (!winners.length) return null;

    return (
      <div style={{
        maxWidth: '760px',
        margin: '0 auto',
        marginTop: spacing.xxxl,
        marginBottom: spacing.xxxl,
        padding: spacing.lg,
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '2px',
          marginBottom: spacing.md,
        }}>
          <h2 style={{
            fontSize: typography.fontSize.md,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            margin: 0,
            textAlign: 'center',
          }}>
            Most Eligible Bachelorettes
          </h2>
          <p style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            color: colors.gold.primary,
            margin: 0,
            textAlign: 'center',
            letterSpacing: '0.04em',
          }}>
            Chicago &bull; {year}
          </p>
        </div>

        {/* Winners Grid - portrait photo cards */}
        <div style={{
          display: 'flex',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          justifyContent: 'center',
          gap: spacing.sm,
        }}>
          {winners.slice(0, 5).map((winner) => {
            const igUrl = getIgUrl(winner);
            const Tag = igUrl ? 'a' : 'div';
            const linkProps = igUrl
              ? { href: igUrl, target: '_blank', rel: 'noopener noreferrer' }
              : {};
            return (
              <Tag
                key={winner.id}
                {...linkProps}
                style={{
                  width: isMobile ? 'calc(33.33% - 8px)' : 'calc(20% - 10px)',
                  aspectRatio: '3 / 4',
                  display: 'block',
                  position: 'relative',
                  borderRadius: borderRadius.lg,
                  overflow: 'hidden',
                  background: colors.background.elevated,
                  border: `1px solid rgba(212, 175, 55, 0.25)`,
                  textDecoration: 'none',
                  color: 'inherit',
                  cursor: igUrl ? 'pointer' : 'default',
                  transition: 'border-color 0.2s ease, transform 0.2s ease',
                }}
                onMouseEnter={igUrl ? (e) => {
                  e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.55)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                } : undefined}
                onMouseLeave={igUrl ? (e) => {
                  e.currentTarget.style.borderColor = 'rgba(212, 175, 55, 0.25)';
                  e.currentTarget.style.transform = 'translateY(0)';
                } : undefined}
              >
                {/* Photo fills the card */}
                {winner.imageUrl ? (
                  <img
                    src={winner.imageUrl}
                    alt={winner.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{ width: '100%', height: '100%', ...styleHelpers.flexCenter }}>
                    <User size={32} style={{ color: colors.text.muted }} />
                  </div>
                )}

                {/* Name on a gradient background for legibility */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  padding: `${spacing.lg} ${spacing.xs} ${spacing.sm}`,
                  background: 'linear-gradient(to top, rgba(0, 0, 0, 0.85) 0%, rgba(0, 0, 0, 0.5) 55%, rgba(0, 0, 0, 0) 100%)',
                  textAlign: 'center',
                }}>
                  <p style={{
                    fontSize: typography.fontSize.xs,
                    fontWeight: typography.fontWeight.semibold,
                    color: colors.text.primary,
                    margin: 0,
                    lineHeight: 1.2,
                  }}>
                    {winner.name}
                  </p>
                </div>
              </Tag>
            );
          })}
        </div>
      </div>
    );
  };

  // ============================================
  // RENDER CONTENT
  // ============================================
  const renderContent = () => {
    if (loading) {
      return (
        <div style={{
          padding: isMobile ? spacing.lg : spacing.xxl,
          maxWidth: '1400px',
          margin: '0 auto',
        }}>
          {/* Hero skeleton */}
          <div style={{ textAlign: 'center', marginBottom: spacing.xl }}>
            <SkeletonPulse height="28px" width="240px" style={{ margin: '0 auto', marginBottom: spacing.md }} />
            <SkeletonPulse height="16px" width="180px" style={{ margin: '0 auto' }} />
          </div>
          {/* Filter bar skeleton */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.xl }}>
            {Array.from({ length: 3 }, (_, i) => (
              <SkeletonPulse key={i} width="100px" height="36px" radius={borderRadius.pill} />
            ))}
          </div>
          {/* Competition cards skeleton */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: isMobile ? spacing.lg : spacing.xl,
          }}>
            {Array.from({ length: isMobile ? 2 : 3 }, (_, i) => (
              <div key={i} style={{
                flex: isMobile ? '1 1 100%' : '1 1 380px',
                maxWidth: isMobile ? '100%' : '500px',
              }}>
                <SkeletonCard height={isMobile ? '200px' : '220px'} style={{ borderRadius: borderRadius.xl }} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    const contentPadding = isMobile ? spacing.lg : spacing.xxl;

    switch (activeTab) {
      case 'competitions':
        return (
          <div style={{ padding: contentPadding, paddingBottom: isMobile ? '100px' : contentPadding }}>
            {/* Hero */}
            <div style={{
              textAlign: 'center',
              maxWidth: '700px',
              margin: '0 auto',
              marginBottom: spacing.xl,
              padding: isMobile ? `${spacing.lg} 0` : `${spacing.xl} 0`,
            }}>
              {/* Animated Crown */}
              {showCrownAnimation && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  marginBottom: spacing.lg,
                }}>
                  <div style={{
                    animation: 'crownDrop 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
                  }}>
                    <EliteRankCrown size={isMobile ? 48 : 64} />
                  </div>
                </div>
              )}

              {/* Main Headline */}
              <h1 style={{
                fontSize: isMobile ? '2rem' : '3rem',
                fontWeight: typography.fontWeight.bold,
                lineHeight: 1.15,
                marginBottom: spacing.md,
              }}>
                <span style={{
                  display: 'block',
                  background: 'linear-gradient(90deg, #f5d485, #d4af37)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}>
                  Where the Best Get Recognized
                </span>
              </h1>

              {/* Action Line */}
              <p style={{
                fontSize: isMobile ? typography.fontSize.lg : '1.5rem',
                fontWeight: typography.fontWeight.bold,
                color: '#ffffff',
              }}>
                Enter <span style={{ color: '#d4af37' }}>·</span> Compete <span style={{ color: '#d4af37' }}>·</span> Win
              </p>
            </div>

            <FilterBar />

            {/* Competition Grid */}
            {visibleCompetitions.length > 0 ? (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: isMobile ? spacing.lg : spacing.xl,
                maxWidth: '1400px',
                margin: '0 auto',
              }}>
                {visibleCompetitions.map((comp) => (
                  <div key={comp.id} style={{
                    flex: isMobile ? '1 1 100%' : isTablet ? '1 1 calc(50% - 16px)' : '1 1 380px',
                    maxWidth: isMobile ? '100%' : isTablet ? 'calc(50% - 16px)' : '500px',
                  }}>
                    <CompetitionCard competition={comp} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{
                ...styleHelpers.flexCenter,
                flexDirection: 'column',
                padding: spacing.xxxl,
                background: colors.background.card,
                borderRadius: borderRadius.xl,
                border: `1px solid ${colors.border.primary}`,
                textAlign: 'center',
              }}>
                <Crown size={48} style={{ color: colors.text.muted, marginBottom: spacing.lg }} />
                <h3 style={{ fontSize: typography.fontSize.xl, color: colors.text.primary, marginBottom: spacing.sm }}>
                  No competitions found
                </h3>
                <p style={{ color: colors.text.secondary, marginBottom: spacing.lg }}>
                  Try adjusting your filters or check back soon.
                </p>
                {statusFilter !== 'active' && (
                  <Button variant="outline" size="sm" onClick={() => setStatusFilter('active')}>
                    Clear Filters
                  </Button>
                )}
              </div>
            )}

            {/* Hall of Winners showcase */}
            <HallOfWinners />

            {/* Ready to Host CTA */}
            <div style={{
              maxWidth: '700px',
              margin: '0 auto',
              marginTop: spacing.xxxl,
              marginBottom: spacing.xl,
              padding: isMobile ? spacing.xl : spacing.xxl,
              background: 'linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(212,175,55,0.02) 100%)',
              borderRadius: borderRadius.xl,
              border: `1px solid rgba(212, 175, 55, 0.2)`,
              textAlign: 'center',
            }}>
              <h3 style={{
                fontSize: isMobile ? typography.fontSize.xl : typography.fontSize['2xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.text.primary,
                marginBottom: spacing.md,
              }}>
                Ready to host?
              </h3>
              <p style={{
                fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.md,
                color: colors.text.secondary,
                lineHeight: typography.lineHeight.relaxed,
                maxWidth: '550px',
                marginLeft: 'auto',
                marginRight: 'auto',
                marginBottom: spacing.xl,
              }}>
                EliteRank is the premier competition, contest, and award management platform. 
                Applications, events, voting, sponsors — we've got you covered.
              </p>
              <Button
                variant="gold"
                size="sm"
                onClick={() => window.location.href = 'mailto:info@eliterank.co?subject=Host%20Application'}
              >
                Contact Us
                <ArrowRight size={16} style={{ marginLeft: spacing.sm }} />
              </Button>
            </div>
          </div>
        );

      case 'events':
        // Use string comparison to avoid timezone issues
        const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time
        const upcomingEvents = events.filter(e => e.date >= todayStr).sort((a, b) => new Date(a.date) - new Date(b.date));
        const pastEvents = events.filter(e => e.date < todayStr).sort((a, b) => new Date(b.date) - new Date(a.date));

        const formatTime12h = (timeStr) => {
          if (!timeStr) return '';
          const [hours, minutes] = timeStr.split(':').map(Number);
          const period = hours >= 12 ? 'PM' : 'AM';
          const displayHour = hours % 12 || 12;
          return `${displayHour}:${String(minutes).padStart(2, '0')} ${period} CST`;
        };

        const formatDateBadge = (dateStr, timeStr) => {
          if (!dateStr) return 'Date TBD';
          const eventDate = new Date(dateStr + 'T00:00:00');
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const isToday = eventDate.getTime() === today.getTime();
          const datePart = isToday
            ? 'TODAY'
            : eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
          if (timeStr) {
            return `${datePart}  \u2022  ${formatTime12h(timeStr)}`;
          }
          return datePart;
        };

        const renderEventCard = (event, isPast = false) => {
          const CardWrapper = event.ticket_url && !isPast ? 'a' : 'div';
          const wrapperProps = event.ticket_url && !isPast
            ? { href: event.ticket_url, target: '_blank', rel: 'noopener noreferrer' }
            : {};

          return (
            <CardWrapper
              key={event.id}
              {...wrapperProps}
              style={{
                display: 'block',
                opacity: isPast ? 0.6 : 1,
                position: 'relative',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'transform 0.2s ease, opacity 0.2s ease',
                cursor: event.ticket_url && !isPast ? 'pointer' : 'default',
              }}
              onMouseEnter={e => {
                if (!isPast) e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {/* Cover Image */}
              <div style={{
                width: '100%',
                aspectRatio: '4 / 5',
                borderRadius: '16px',
                overflow: 'hidden',
                position: 'relative',
                background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(139,92,246,0.1) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {event.image_url ? (
                  /* Render as a real <img> (not a CSS background) so the browser
                     decodes it once and never re-fetches on repaint — the infinite
                     crown animation keeps the paint pipeline ticking, which caused
                     non-cacheable background images to flicker. */
                  <img
                    src={event.image_url}
                    alt={event.name || ''}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      display: 'block',
                    }}
                  />
                ) : (
                  <Crown size={48} style={{ color: 'rgba(212,175,55,0.4)' }} />
                )}

                {/* Bottom gradient fade */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '50%',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)',
                  pointerEvents: 'none',
                }} />

                {/* Date/time pill badge */}
                <div style={{
                  position: 'absolute',
                  bottom: spacing.md,
                  left: spacing.md,
                  background: 'rgba(0,0,0,0.75)',
                  backdropFilter: 'blur(12px)',
                  borderRadius: '20px',
                  padding: `5px ${spacing.md}`,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  color: colors.text.primary,
                  letterSpacing: '0.3px',
                }}>
                  {formatDateBadge(event.date, event.time)}
                </div>

                {isPast && (
                  <div style={{
                    position: 'absolute',
                    top: spacing.md,
                    left: spacing.md,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: '20px',
                    padding: `4px ${spacing.sm}`,
                    fontSize: typography.fontSize.xs,
                    color: colors.text.tertiary,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                  }}>
                    Past Event
                  </div>
                )}
              </div>

              {/* Event Info */}
              <div style={{ padding: `${spacing.sm} 2px 0` }}>
                <h3 style={{
                  fontSize: typography.fontSize.md,
                  fontWeight: typography.fontWeight.bold,
                  color: colors.text.primary,
                  marginBottom: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {event.name}
                </h3>

                <p style={{
                  fontSize: typography.fontSize.sm,
                  color: colors.text.tertiary,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {[event.location, event.cityName && event.cityName !== 'Unknown' ? event.cityName : null].filter(Boolean).join(' \u2022 ') || event.competitionName || ''}
                </p>
              </div>
            </CardWrapper>
          );
        };

        return (
          <div style={{ padding: contentPadding, paddingBottom: isMobile ? '100px' : contentPadding, maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: spacing.xxxl }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: spacing.lg,
              }}>
                <div style={{
                  animation: 'crownFloat 3s ease-in-out infinite, crownGlow 2s ease-in-out infinite',
                }}>
                  <EliteRankCrown size={isMobile ? 64 : 80} />
                </div>
              </div>
              <h2 style={{ fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.bold, color: colors.text.primary, marginBottom: spacing.sm }}>Events</h2>
              <p style={{ color: colors.text.secondary }}>Exclusive events across all competitions</p>
            </div>

            {upcomingEvents.length > 0 && (
              <div style={{ marginBottom: spacing.xxxl }}>
                <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, marginBottom: spacing.lg }}>
                  Upcoming
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: spacing.lg }}>
                  {upcomingEvents.map(event => renderEventCard(event))}
                </div>
              </div>
            )}

            {pastEvents.length > 0 && (
              <div>
                <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.secondary, marginBottom: spacing.lg }}>Past Events</h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: spacing.lg }}>
                  {pastEvents.slice(0, 6).map(event => renderEventCard(event, true))}
                </div>
              </div>
            )}

            {events.length === 0 && (
              <div style={{ ...styleHelpers.flexCenter, flexDirection: 'column', padding: spacing.xxxl, textAlign: 'center' }}>
                <div style={{ marginBottom: spacing.lg, opacity: 0.5 }}>
                  <EliteRankCrown size={48} />
                </div>
                <p style={{ color: colors.text.secondary }}>No events scheduled yet</p>
              </div>
            )}
          </div>
        );

      case 'announcements':
        return (
          <div style={{ padding: contentPadding, paddingBottom: isMobile ? '100px' : contentPadding, maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: spacing.xxxl }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: spacing.lg,
              }}>
                <div style={{
                  animation: 'crownFloat 3s ease-in-out infinite, crownGlow 2s ease-in-out infinite',
                }}>
                  <EliteRankCrown size={isMobile ? 64 : 80} />
                </div>
              </div>
              <h2 style={{ fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.bold, color: colors.text.primary, marginBottom: spacing.sm }}>News</h2>
              <p style={{ color: colors.text.secondary }}>Latest updates from Elite Rank</p>
            </div>

            {announcements.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
                {announcements.map(a => (
                  <article key={a.id} style={{
                    background: colors.background.card,
                    border: a.pinned ? `2px solid ${colors.gold.primary}` : `1px solid ${colors.border.primary}`,
                    borderRadius: borderRadius.xl,
                    padding: spacing.xl,
                  }}>
                    {/* Org logo + name */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
                      <OrganizationLogo
                        logo={getOrgLogo(a.organization)}
                        size={28}
                        style={{ borderRadius: borderRadius.sm }}
                      />
                      <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold, color: colors.text.secondary }}>
                        {a.organization?.name || 'Elite Rank'}
                      </span>
                    </div>
                    <div style={{ ...styleHelpers.flexBetween, marginBottom: spacing.md }}>
                      <Badge variant="info" size="xs">{a.cityName}</Badge>
                      <span style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>
                        {new Date(a.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, marginBottom: spacing.sm }}>{a.title}</h3>
                    <p style={{ fontSize: typography.fontSize.md, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>{a.content}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div style={{ ...styleHelpers.flexCenter, flexDirection: 'column', padding: spacing.xxxl, textAlign: 'center' }}>
                <Megaphone size={48} style={{ color: colors.text.muted, marginBottom: spacing.lg }} />
                <p style={{ color: colors.text.secondary }}>No announcements yet</p>
              </div>
            )}
          </div>
        );

      case 'opportunities':
        const joinOptions = [
          {
            id: 'compete',
            icon: Trophy,
            title: 'Compete',
            desc: "You've got what it takes. Enter a competition, rally your network, and let the crowd decide who rises to the top. Winners take home cash prizes, the title, and bragging rights.",
            color: colors.gold.primary,
            hoverBg: `${colors.gold.primary}08`,
            cta: 'Apply to compete',
            action: () => setActiveTab('competitions'),
          },
          {
            id: 'vote',
            icon: Heart,
            title: 'Vote',
            desc: "Know someone who deserves the spotlight? Back them with your vote. Follow their journey. Be part of their rise.",
            color: colors.accent.pink,
            hoverBg: `${colors.accent.pink}08`,
            cta: 'Browse competitions',
            action: () => setActiveTab('competitions'),
          },
          {
            id: 'partner',
            icon: Building,
            title: 'Partner',
            desc: "Host a competition as a category expert, sponsor a competition by contributing prizes for the winners, or bring EliteRank to your organization and launch a competition for your community. Let's build something together.",
            color: '#10b981',
            hoverBg: 'rgba(16, 185, 129, 0.08)',
            cta: 'Start a conversation',
            action: () => window.location.href = 'mailto:info@eliterank.co?subject=Partnership%20Inquiry',
          },
        ];

        return (
          <div style={{ padding: contentPadding, paddingBottom: isMobile ? '100px' : contentPadding, maxWidth: '1000px', margin: '0 auto' }}>
            {/* Hero Section */}
            <div style={{ textAlign: 'center', marginBottom: spacing.xxxl, padding: isMobile ? `${spacing.xl} 0` : `${spacing.xxl} 0` }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: spacing.lg,
              }}>
                <div style={{
                  animation: 'crownFloat 3s ease-in-out infinite, crownGlow 2s ease-in-out infinite',
                }}>
                  <EliteRankCrown size={isMobile ? 64 : 80} />
                </div>
              </div>
              <h2 style={{
                fontSize: isMobile ? typography.fontSize['3xl'] : typography.fontSize['4xl'],
                fontWeight: typography.fontWeight.bold,
                color: colors.text.primary,
                marginBottom: spacing.md,
                lineHeight: typography.lineHeight.tight,
              }}>
                Rank Is <span style={{ color: colors.gold.primary }}>Earned</span>
              </h2>
              <p style={{
                fontSize: isMobile ? typography.fontSize.md : typography.fontSize.lg,
                color: colors.text.secondary,
                lineHeight: typography.lineHeight.relaxed,
                maxWidth: '600px',
                margin: '0 auto',
              }}>
                Competitors enter the ranks. Voters decide who rises. Partners make the elite shine.
              </p>
            </div>

            {/* Three Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
              gap: spacing.lg,
              marginBottom: spacing.xxxl,
            }}>
              {joinOptions.map(option => (
                <div
                  key={option.id}
                  style={{
                    background: colors.background.card,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: borderRadius.xl,
                    padding: spacing.xl,
                    transition: `all ${transitions.normal}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = option.color;
                    e.currentTarget.style.background = option.hoverBg;
                    e.currentTarget.style.transform = 'translateY(-4px)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = colors.border.primary;
                    e.currentTarget.style.background = colors.background.card;
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  onClick={option.action}
                >
                  {/* Icon */}
                  <div style={{
                    width: '48px',
                    height: '48px',
                    background: `${option.color}15`,
                    borderRadius: borderRadius.lg,
                    ...styleHelpers.flexCenter,
                    marginBottom: spacing.lg,
                  }}>
                    <option.icon size={24} style={{ color: option.color }} />
                  </div>

                  {/* Title */}
                  <h3 style={{
                    fontSize: typography.fontSize.xl,
                    fontWeight: typography.fontWeight.bold,
                    color: colors.text.primary,
                    marginBottom: spacing.sm,
                  }}>
                    {option.title}
                  </h3>

                  {/* Description */}
                  <p style={{
                    fontSize: typography.fontSize.sm,
                    color: colors.text.secondary,
                    lineHeight: typography.lineHeight.relaxed,
                    marginBottom: spacing.lg,
                  }}>
                    {option.desc}
                  </p>

                  {/* Spacer */}
                  <div style={{ flex: 1 }} />

                  {/* Arrow CTA */}
                  <div style={{
                    ...styleHelpers.flexStart,
                    gap: spacing.sm,
                    color: option.color,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.medium,
                    marginTop: 'auto',
                  }}>
                    {option.cta}
                    <ArrowRight size={16} style={{ transition: 'transform 0.2s' }} />
                  </div>
                </div>
              ))}
            </div>

          </div>
        );

      case 'about':
        return (
          <div style={{ padding: contentPadding, paddingBottom: isMobile ? '100px' : contentPadding, maxWidth: '900px', margin: '0 auto' }}>
            {/* Hero Section */}
            <div style={{ textAlign: 'center', marginBottom: spacing.xxxl }}>
              <div style={{
                display: 'flex',
                justifyContent: 'center',
                marginBottom: spacing.lg,
              }}>
                <div style={{
                  animation: 'crownFloat 3s ease-in-out infinite, crownGlow 2s ease-in-out infinite',
                }}>
                  <EliteRankCrown size={isMobile ? 64 : 80} />
                </div>
              </div>
              <h2 style={{ fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.bold, color: colors.text.primary, marginBottom: spacing.lg }}>About EliteRank</h2>
              <p style={{ color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed, fontSize: typography.fontSize.md, marginBottom: spacing.lg }}>
                EliteRank is a social competition platform where public voting determines who ranks at the top across categories that matter — from dating to creators and more. Elites are nominated, accepted by the host then begin rally support, campaign for a chance to win while building their fan base.
              </p>
              <p style={{ color: colors.text.tertiary, lineHeight: typography.lineHeight.relaxed, fontSize: typography.fontSize.sm, fontStyle: 'italic' }}>
                Think American Idol meets GoFundMe — competitions where your network becomes your campaign team and the crowd decides who rises the ranks to win.
              </p>
            </div>

            {/* Mission Section */}
            <div style={{
              background: colors.background.card,
              border: `1px solid ${colors.gold.primary}40`,
              borderRadius: borderRadius.xl,
              padding: spacing.xl,
              textAlign: 'center',
              marginBottom: spacing.xxxl,
            }}>
              <h3 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.semibold, color: colors.gold.primary, marginBottom: spacing.md }}>Our Mission</h3>
              <p style={{ color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed, fontSize: typography.fontSize.lg }}>
                To spotlight and reward exceptional people backed by public opinion.
              </p>
            </div>

            {/* How It Works */}
            <div style={{ marginBottom: spacing.xxxl }}>
              <h3 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, marginBottom: spacing.xl, textAlign: 'center' }}>How It Works</h3>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
                gap: spacing.lg,
              }}>
                {[
                  { step: '1', title: 'Enter', desc: 'Apply directly or accept a nomination to compete' },
                  { step: '2', title: 'Compete', desc: 'Rally your network, promote your profile, and gather votes each round' },
                  { step: '3', title: 'Win', desc: 'Winners take home a piece of the cash prize pool, the title, sponsored prizes, exposure and more' },
                ].map(item => (
                  <div key={item.step} style={{
                    background: colors.background.card,
                    border: `1px solid ${colors.border.primary}`,
                    borderRadius: borderRadius.xl,
                    padding: spacing.xl,
                    textAlign: 'center',
                  }}>
                    <div style={{
                      width: '48px',
                      height: '48px',
                      background: colors.gold.primary,
                      borderRadius: borderRadius.full,
                      ...styleHelpers.flexCenter,
                      margin: '0 auto',
                      marginBottom: spacing.md,
                      fontSize: typography.fontSize.xl,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.text.inverse,
                    }}>{item.step}</div>
                    <h4 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, marginBottom: spacing.sm }}>{item.title}</h4>
                    <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>{item.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Why Compete & Who Competes */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
              gap: spacing.lg,
              marginBottom: spacing.xxxl,
            }}>
              <div style={{
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: borderRadius.xl,
                padding: spacing.xl,
              }}>
                <h4 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.gold.primary, marginBottom: spacing.md }}>Why Compete?</h4>
                <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>
                  This isn't about a trophy. It's about proving publicly that people believe in you — and getting paid to do it. Every vote is someone putting money behind your name. Win or lose, you build your brand and walk away with earnings.
                </p>
              </div>
              <div style={{
                background: colors.background.card,
                border: `1px solid ${colors.border.primary}`,
                borderRadius: borderRadius.xl,
                padding: spacing.xl,
              }}>
                <h4 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.gold.primary, marginBottom: spacing.md }}>Who Competes?</h4>
                <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed }}>
                  Anyone confident enough to put themselves forward and ambitious enough to rally support. If you've ever been told you're exceptional, EliteRank is where you prove it and profit from it.
                </p>
              </div>
            </div>

            {/* CTA Section */}
            <div style={{
              background: `linear-gradient(135deg, ${colors.gold.primary}20, ${colors.gold.primary}05)`,
              border: `1px solid ${colors.gold.primary}60`,
              borderRadius: borderRadius.xl,
              padding: spacing.xxl,
              textAlign: 'center',
              marginBottom: spacing.xxxl,
            }}>
              <h3 style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.text.primary, marginBottom: spacing.lg }}>Ready to Compete?</h3>
              <div style={{ ...styleHelpers.flexCenter, flexWrap: 'wrap', gap: spacing.md }}>
                <Button variant="primary" size="md" onClick={() => setActiveTab('competitions')}>Enter a Competition</Button>
                <Button variant="outline" size="md" onClick={() => setActiveTab('competitions')}>Nominate Someone</Button>
              </div>
              <button
                onClick={() => setActiveTab('competitions')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: colors.text.secondary,
                  fontSize: typography.fontSize.sm,
                  marginTop: spacing.lg,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                See Current Competitions
              </button>
            </div>

            {/* For Partners */}
            <div style={{
              background: colors.background.card,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: borderRadius.xl,
              padding: spacing.xl,
              textAlign: 'center',
            }}>
              <Building size={32} style={{ color: colors.gold.primary, marginBottom: spacing.md }} />
              <h4 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, marginBottom: spacing.sm }}>For Partners & Brands</h4>
              <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: typography.lineHeight.relaxed, marginBottom: spacing.lg }}>
                Host a competition on EliteRank. Bring your audience, we bring the infrastructure. Sponsors, media partners, and organizations can co-create categories or power competitions around cultural moments.
              </p>
              <Button variant="outline" size="sm" onClick={() => window.location.href = 'mailto:info@eliterank.co'}>Contact Us</Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  // ============================================
  // MAIN LAYOUT
  // ============================================
  return (
    <div style={{
      position: isFullPage ? 'relative' : 'fixed',
      inset: isFullPage ? undefined : 0,
      minHeight: isFullPage ? '100vh' : undefined,
      background: colors.background.primary,
      zIndex: isFullPage ? undefined : 1000,
      overflow: 'auto',
      fontFamily: typography.fontFamily.sans,
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(10, 10, 12, 0.9)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: `1px solid ${colors.border.secondary}`,
      }}>
        <div style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: `${spacing.md} ${isMobile ? spacing.lg : spacing.xxl}`,
          ...styleHelpers.flexBetween,
        }}>
          {/* Logo */}
          <div
            onClick={() => { setActiveTab('competitions'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            style={{ ...styleHelpers.flexStart, gap: spacing.sm, cursor: 'pointer' }}
          >
            <EliteRankCrown size={isMobile ? 28 : 36} />
            <span style={{
              fontSize: isMobile ? typography.fontSize.lg : typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
            }}>
              <span style={{ color: '#ffffff' }}>Elite</span>
              <span style={{
                background: 'linear-gradient(90deg, #d4af37, #c9a227)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>Rank</span>
            </span>
          </div>

          {/* Desktop Navigation */}
          {!isMobile && (
            <nav style={{ ...styleHelpers.flexStart, gap: spacing.xs }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    ...styleHelpers.flexCenter,
                    gap: spacing.xs,
                    padding: `${spacing.sm} ${spacing.lg}`,
                    background: activeTab === tab.id ? colors.gold.muted : 'transparent',
                    border: 'none',
                    borderRadius: borderRadius.lg,
                    color: activeTab === tab.id ? colors.gold.primary : colors.text.secondary,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.medium,
                    cursor: 'pointer',
                    transition: `all ${transitions.fast}`,
                  }}
                >
                  <tab.icon size={16} />
                  {tab.label}
                </button>
              ))}
              {onHostInfo && (
                <button
                  onClick={onHostInfo}
                  style={{
                    ...styleHelpers.flexCenter,
                    gap: spacing.xs,
                    padding: `${spacing.sm} ${spacing.lg}`,
                    background: 'transparent',
                    border: 'none',
                    borderRadius: borderRadius.lg,
                    color: colors.text.secondary,
                    fontSize: typography.fontSize.sm,
                    fontWeight: typography.fontWeight.medium,
                    cursor: 'pointer',
                    transition: `all ${transitions.fast}`,
                  }}
                >
                  <Building size={16} />
                  Host
                </button>
              )}
            </nav>
          )}

          {/* Auth Actions */}
          <div style={{ ...styleHelpers.flexStart, gap: spacing.sm }}>
            {isAuthenticated && (
              <NotificationBell size={isMobile ? 36 : 40} />
            )}
            <ProfileIcon
              isAuthenticated={isAuthenticated}
              user={user}
              profile={profile}
              onLogin={onLogin}
              onLogout={onLogout}
              onProfile={onProfile}
              onRewards={onRewards}
              onAchievements={onAchievements}
              onAccountSettings={onAccountSettings}
              onHowToCompete={onHowToCompete}
              onDashboard={hasDashboardAccess ? onDashboard : null}
              onLaunchCompetition={onLaunchCompetition}
              hasDashboardAccess={hasDashboardAccess}
              size={isMobile ? 36 : 40}
            />

            {!isFullPage && (
              <button onClick={onClose} style={{
                background: 'none',
                border: 'none',
                color: colors.text.secondary,
                cursor: 'pointer',
                padding: spacing.sm,
                ...styleHelpers.flexCenter,
              }}>
                <X size={24} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main>{renderContent()}</main>

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
          {TABS.slice(0, 5).map(tab => {
            const Icon = tab.mobileIcon || tab.icon;
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
                <Icon size={22} />
                <span style={{ fontSize: '10px', fontWeight: isActive ? typography.fontWeight.semibold : typography.fontWeight.normal }}>
                  {tab.label}
                </span>
              </button>
            );
          })}
          {onHostInfo && (
            <button
              onClick={onHostInfo}
              style={{
                ...styleHelpers.flexColumn,
                ...styleHelpers.flexCenter,
                gap: '2px',
                padding: spacing.sm,
                background: 'none',
                border: 'none',
                color: colors.text.muted,
                cursor: 'pointer',
                transition: `all ${transitions.fast}`,
                flex: 1,
              }}
            >
              <Building size={22} />
              <span style={{ fontSize: '10px', fontWeight: typography.fontWeight.normal }}>
                Host
              </span>
            </button>
          )}
        </nav>
      )}

      {/* Global Styles */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px ${colors.status.success}; }
          50% { opacity: 0.6; box-shadow: 0 0 12px ${colors.status.success}; }
        }
        @keyframes shine {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes crownDrop {
          0% {
            opacity: 0;
            transform: translateY(-100px) scale(0.3) rotate(-20deg);
          }
          50% {
            opacity: 1;
            transform: translateY(10px) scale(1.2) rotate(5deg);
          }
          70% {
            transform: translateY(-5px) scale(1.1) rotate(-3deg);
          }
          85% {
            transform: translateY(3px) scale(1.05) rotate(1deg);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1) rotate(0deg);
          }
        }
        @keyframes crownGlow {
          0%, 100% {
            filter: drop-shadow(0 0 8px rgba(212, 175, 55, 0.4)) drop-shadow(0 0 20px rgba(212, 175, 55, 0.2));
          }
          50% {
            filter: drop-shadow(0 0 20px rgba(212, 175, 55, 0.8)) drop-shadow(0 0 40px rgba(212, 175, 55, 0.4)) drop-shadow(0 0 60px rgba(212, 175, 55, 0.2));
          }
        }
        @keyframes crownFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: ${colors.border.primary};
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: ${colors.border.focus};
        }
      `}</style>
    </div>
  );
}
