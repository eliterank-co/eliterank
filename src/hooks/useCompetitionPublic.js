import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getCompetitionPhase } from '../utils/getCompetitionPhase';
import {
  calculatePrizePool,
  calculateVoteRevenue,
} from '../utils/calculatePrizePool';
import { getCompetitionDefaults } from '../utils/competitionDefaults';
import { ORG_PUBLIC_COLS } from '../constants/safeColumns';

// Shared select query for competition data
const COMPETITION_SELECT = `
  *,
  organization:organizations(${ORG_PUBLIC_COLS}),
  city:cities(*),
  category:categories(*),
  demographic:demographics(*),
  host:profiles!competitions_host_id_fkey (
    id, first_name, last_name, bio, headline, avatar_url, city,
    instagram, twitter, linkedin
  ),
  competition_co_hosts (
    created_at,
    profile:profiles!user_id (
      id, first_name, last_name, bio, headline, avatar_url, city,
      instagram, twitter, linkedin
    )
  ),
  contestants (
    id, user_id, name, email, age, bio, avatar_url, instagram,
    status, votes, rank, trend, city, slug, profile_views,
    external_shares, eliminated_in_round, advancement_status,
    current_round, created_at, updated_at
  ),
  sponsors (id, name, tier, amount, logo_url, website_url, sort_order, reward_recipient, reward_top_x_count),
  events (*),
  competition_prizes (id, title, description, image_url, value, sponsor_name, external_url, sort_order, prize_type, sponsor_id, recipient_gender),
  competition_rules (id, section_title, section_content, sort_order),
  judging_criteria (id, label, description, weight, sort_order),
  bonus_vote_tasks (id, label, description, votes_awarded, enabled, sort_order),
  competition_double_days (id, date),
  voting_rounds (
    id, title, round_order, start_date, end_date,
    contestants_advance, votes_accumulate, round_type, judge_weight
  ),
  nomination_periods (id, title, period_order, start_date, end_date, max_submissions),
  announcements (id, type, title, content, pinned, published_at, is_ai_generated)
`;

/**
 * Fetch public competition data by org slug and competition slug OR ID
 *
 * @param {string} orgSlug - Organization slug (e.g., 'most-eligible')
 * @param {string} competitionSlug - Full competition slug (e.g., 'most-eligible-chicago-2026')
 * @param {string} competitionId - Optional competition ID for direct lookup
 * @returns {object} Competition data, phase info, loading state, and helpers
 */
export function useCompetitionPublic(orgSlug, competitionSlug, competitionId) {
  const [competition, setCompetition] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [contestants, setContestants] = useState([]);
  const [sponsors, setSponsors] = useState([]);
  const [judges, setJudges] = useState([]);
  const [events, setEvents] = useState([]);
  const [rules, setRules] = useState([]);
  const [judgingCriteria, setJudgingCriteria] = useState([]);
  const [bonusTasks, setBonusTasks] = useState([]);
  const [doubleVoteDays, setDoubleVoteDays] = useState([]);
  const [votingRounds, setVotingRounds] = useState([]);
  const [nominationPeriods, setNominationPeriods] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [prizes, setPrizes] = useState([]);
  const [votes, setVotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Track whether we've successfully loaded data at least once.
  // On re-fetches (e.g. after auth state changes mid-flow) we skip the
  // loading spinner so the user keeps seeing the page they're already on.
  const hasLoadedOnceRef = useRef(false);

  const isDemoMode = !isSupabaseConfigured();

  // Fetch competition data - simplified lookup (ID or slug only)
  const fetchCompetition = useCallback(async () => {
    // Must have orgSlug AND either competitionSlug or competitionId
    if (!orgSlug || (!competitionSlug && !competitionId)) {
      setError(new Error('Missing org slug or competition identifier'));
      setLoading(false);
      return;
    }

    if (isDemoMode) {
      setLoading(false);
      return;
    }

    // Only show loading spinner on initial load, not on background re-fetches
    if (!hasLoadedOnceRef.current) {
      setLoading(true);
    }
    setError(null);

    try {
      // Get organization by slug
      const { data: orgData, error: orgError } = await supabase
        .from('organizations')
        .select(ORG_PUBLIC_COLS)
        .eq('slug', orgSlug)
        .single();

      if (orgError) throw orgError;
      if (!orgData) throw new Error('Organization not found');

      let compData = null;
      let compError = null;

      // Lookup by ID (if provided)
      if (competitionId) {
        const result = await supabase
          .from('competitions')
          .select(COMPETITION_SELECT)
          .eq('id', competitionId)
          .single();

        compData = result.data;
        compError = result.error;
      }
      // Lookup by slug
      else if (competitionSlug) {
        const result = await supabase
          .from('competitions')
          .select(COMPETITION_SELECT)
          .eq('organization_id', orgData.id)
          .eq('slug', competitionSlug)
          .single();

        compData = result.data;
        compError = result.error;
      }

      // Lazily transition any rounds whose end_date has passed (eliminations,
      // advancements, optional vote reset). The follow-up re-fetch reads the
      // post-finalize state. Fire-and-forget keeps the initial render fast;
      // if the round just ended, the realtime contestants subscription will
      // surface the change within a couple of seconds.
      if (compData?.id) {
        supabase
          .rpc('ensure_round_state', { p_competition_id: compData.id })
          .then(({ error: ensureErr }) => {
            if (ensureErr) {
              console.warn('ensure_round_state failed:', ensureErr.message);
            }
          });
      }

      if (compError || !compData) {
        throw new Error('Competition not found');
      }

      // Branding (logo, theme, about defaults) always follows the
      // competition's own organization. On the /:orgSlug/id/:competitionId
      // route the URL slug can point at a different org, so trust the
      // organization joined onto the competition rather than the URL slug.
      setOrganization(compData.organization || orgData);

      // Normalize city to string for rendering, keep full object as cityData
      const cityObj = compData.city;
      const normalizedCompData = {
        ...compData,
        city: typeof cityObj === 'object' ? cityObj?.name : cityObj || 'Unknown City',
        cityData: typeof cityObj === 'object' ? cityObj : null,
      };

      // Set all state
      setCompetition(normalizedCompData);
      setContestants(compData.contestants || []);
      setSponsors(
        (compData.sponsors || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      );

      // Judges have no public RLS SELECT policy (migration 072 locked it down);
      // fetch via the SECURITY DEFINER RPC that returns display-safe fields only.
      const { data: judgesData, error: judgesError } = await supabase.rpc(
        'get_competition_judges',
        { p_competition_id: compData.id }
      );
      if (judgesError) {
        console.error('Failed to fetch judges:', judgesError);
        setJudges([]);
      } else {
        setJudges(judgesData || []);
      }
      setEvents(
        (compData.events || [])
          .filter((e) => e.public_visible !== false)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
      );
      // Attach each prize's recipient from its parent sponsor — recipient lives
      // on the sponsor row, not the prize — so public prize cards can label who
      // receives it ("Top 5 contestants", "All contestants", etc.).
      const sponsorRewardById = new Map(
        (compData.sponsors || []).map((s) => [
          s.id,
          { recipient: s.reward_recipient || null, count: s.reward_top_x_count ?? null },
        ])
      );
      setPrizes(
        (compData.competition_prizes || [])
          .map((p) => {
            const reward = sponsorRewardById.get(p.sponsor_id);
            return {
              ...p,
              recipient: reward?.recipient || null,
              recipient_top_x_count: reward?.count ?? null,
              // recipient_gender is a per-prize column (migration 114); default it
              // for older rows that predate the column.
              recipient_gender: p.recipient_gender || 'all',
            };
          })
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      );
      setRules(
        (compData.competition_rules || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      );
      setJudgingCriteria(
        (compData.judging_criteria || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      );
      setBonusTasks(
        (compData.bonus_vote_tasks || [])
          .filter((t) => t.enabled !== false)
          .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      );
      setDoubleVoteDays(
        (compData.competition_double_days || [])
          .map((d) => d.date)
          .filter(Boolean)
          .sort()
      );
      setVotingRounds(
        (compData.voting_rounds || []).sort((a, b) => (a.round_order || 0) - (b.round_order || 0))
      );
      setNominationPeriods(
        (compData.nomination_periods || []).sort((a, b) => (a.period_order || 0) - (b.period_order || 0))
      );
      setAnnouncements(
        (compData.announcements || [])
          .filter((a) => a.published_at)
          .sort((a, b) => {
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            return new Date(b.published_at) - new Date(a.published_at);
          })
      );

      // Fetch vote revenue separately (aggregate)
      const { data: voteData } = await supabase
        .from('votes')
        .select('amount_paid, tax_amount')
        .eq('competition_id', compData.id);

      setVotes(voteData || []);
    } catch (err) {
      console.error('Error fetching competition:', err);
      setError(err);
    } finally {
      hasLoadedOnceRef.current = true;
      setLoading(false);
    }
  }, [orgSlug, competitionSlug, competitionId, isDemoMode]);

  // Initial fetch
  useEffect(() => {
    fetchCompetition();
  }, [fetchCompetition]);

  // Compute phase
  const phase = useMemo(() => {
    return getCompetitionPhase(competition, votingRounds, nominationPeriods);
  }, [competition, votingRounds, nominationPeriods]);

  // Compute prize pool. Only surface a pool when a minimum is explicitly
  // configured on the competition or its organization — without a real
  // value, competitions would otherwise advertise a phantom default prize.
  const prizePool = useMemo(() => {
    // Self-serve competitions (created via the host wizard — they carry a
    // category_template) control the cash prize explicitly: no cash prize
    // selected means no prize pool, regardless of any legacy default. Older
    // admin-created competitions fall back to prize_pool_minimum.
    const isSelfServe = competition?.category_template != null;
    const minimum = isSelfServe
      ? (competition?.cash_prize_amount != null ? Number(competition.cash_prize_amount) : null)
      : (competition?.prize_pool_minimum ?? organization?.default_prize_minimum ?? null);
    if (minimum == null || Number(minimum) <= 0) return null;
    const voteRevenue =
      phase.isVoting || phase.phase === 'results'
        ? calculateVoteRevenue(votes)
        : 0;
    return calculatePrizePool(minimum, voteRevenue);
  }, [competition, organization, votes, phase]);

  // Merge organization defaults with competition overrides
  const about = useMemo(() => {
    if (!competition && !organization) return null;

    const defaults = getCompetitionDefaults(competition);
    const hasCategory = Boolean(competition?.category_id || competition?.category);

    return {
      description: competition?.about_description || organization?.default_about_description || defaults.description,
      traits: competition?.about_traits?.length
        ? competition.about_traits
        : hasCategory
          ? defaults.traits
          : (organization?.default_about_traits?.length ? organization.default_about_traits : defaults.traits),
      ageRange: competition?.about_age_range || (hasCategory ? defaults.ageRange : null) || organization?.default_age_range || defaults.ageRange,
      requirement: competition?.about_requirement || (hasCategory ? defaults.requirement : null) || organization?.default_requirement || defaults.requirement,
    };
  }, [competition, organization]);

  // Merge theme colors
  const theme = useMemo(() => {
    return {
      primary: competition?.theme_primary || organization?.default_theme_primary || '#d4af37',
      voting: competition?.theme_voting || organization?.default_theme_voting || '#f472b6',
      resurrection: competition?.theme_resurrection || organization?.default_theme_resurrection || '#8b5cf6',
    };
  }, [competition, organization]);

  // Get host info
  const host = useMemo(() => {
    if (!competition?.host_id) return null;
    return { id: competition.host_id };
  }, [competition]);

  // Real-time subscription for votes during voting phases
  useEffect(() => {
    if (!competition?.id || !phase.isVoting || isDemoMode) return;

    const subscription = supabase
      .channel(`competition-${competition.id}-votes`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'votes',
          filter: `competition_id=eq.${competition.id}`,
        },
        (payload) => {
          setVotes((prev) => [...prev, payload.new]);
          setContestants((prev) =>
            prev.map((c) => {
              if (c.id === payload.new.contestant_id) {
                return { ...c, votes: (c.votes || 0) + (payload.new.vote_count || 1) };
              }
              return c;
            })
          );
        }
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [competition?.id, phase.isVoting, isDemoMode]);

  // Real-time subscription for contestant updates
  useEffect(() => {
    if (!competition?.id || !phase.isVoting || isDemoMode) return;

    const subscription = supabase
      .channel(`competition-${competition.id}-contestants`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'contestants',
          filter: `competition_id=eq.${competition.id}`,
        },
        (payload) => {
          setContestants((prev) =>
            prev.map((c) => (c.id === payload.new.id ? { ...c, ...payload.new } : c))
          );
        }
      )
      .subscribe();

    return () => subscription.unsubscribe();
  }, [competition?.id, phase.isVoting, isDemoMode]);

  // Refetch function for manual refresh
  const refetch = useCallback(() => {
    fetchCompetition();
  }, [fetchCompetition]);

  return {
    competition,
    organization,
    contestants,
    sponsors,
    judges,
    events,
    prizes,
    rules,
    judgingCriteria,
    bonusTasks,
    doubleVoteDays,
    votingRounds,
    nominationPeriods,
    announcements,
    phase,
    prizePool,
    about,
    theme,
    host,
    loading,
    error,
    isDemoMode,
    refetch,
  };
}

export default useCompetitionPublic;
