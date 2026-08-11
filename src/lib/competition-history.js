import { supabase } from './supabase';

/**
 * Get nominations for a user (by user_id or email)
 * Returns nominations that haven't been converted to contestant yet
 */
export async function getNominationsForUser(userId, userEmail) {
  if (!supabase || (!userId && !userEmail)) return [];

  try {
    const selectStr = `
      id,
      name,
      email,
      status,
      claimed_at,
      user_id,
      converted_to_contestant,
      nominator_name,
      nominator_anonymous,
      nomination_reason,
      invite_token,
      competition:competitions(
        id,
        name,
        slug,
        season,
        status,
        city:cities(name),
        organization:organizations(name, slug, logo_url, header_logo_url, default_currency),
        demographic:demographics(*),
        category:categories(*)
      )
    `;

    // Run separate queries by user_id and email to avoid PostgREST .or()
    // parsing issues with email addresses containing dots.
    // Include converted nominees so we can show them when the contestant
    // record is missing user_id (data fix for earlier mapping bug).
    const queries = [];
    if (userId) {
      queries.push(
        supabase.from('nominees').select(selectStr)
          .eq('user_id', userId)
          .not('status', 'in', '("rejected","declined","expired")')
          .order('created_at', { ascending: false })
      );
    }
    if (userEmail) {
      queries.push(
        supabase.from('nominees').select(selectStr)
          .eq('email', userEmail)
          .not('status', 'in', '("rejected","declined","expired")')
          .order('created_at', { ascending: false })
      );
    }

    const results = await Promise.all(queries);

    // Merge and deduplicate by id
    const seen = new Map();
    for (const result of results) {
      if (result.error) {
        console.error('Error fetching nominations:', result.error);
        continue;
      }
      for (const row of result.data || []) {
        if (!seen.has(row.id)) seen.set(row.id, row);
      }
    }

    return [...seen.values()];
  } catch (err) {
    console.error('Error in getNominationsForUser:', err);
    return [];
  }
}

/**
 * Get competitions hosted by a user — includes both primary host (host_id)
 * and co-hosts (competition_co_hosts).
 */
export async function getHostedCompetitions(userId) {
  if (!supabase || !userId) return [];

  // Include timeline rounds/periods so callers can compute the live phase
  // (voting / nominations / between) — not just the stored status.
  const COMPETITION_SELECT =
    '*, city:cities(name), organization:organizations(name, slug, logo_url, header_logo_url, default_currency), ' +
    'voting_rounds(id, start_date, end_date, round_order, round_type), ' +
    'nomination_periods(id, start_date, end_date, period_order)';

  try {
    const [primaryResult, coHostIdsResult] = await Promise.all([
      supabase
        .from('competitions')
        .select(COMPETITION_SELECT)
        .eq('host_id', userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('competition_co_hosts')
        .select('competition_id')
        .eq('user_id', userId),
    ]);

    if (primaryResult.error) {
      console.error('Error fetching hosted competitions:', primaryResult.error);
    }
    if (coHostIdsResult.error) {
      console.error('Error fetching co-hosted competition ids:', coHostIdsResult.error);
    }

    const byId = new Map();
    for (const row of primaryResult.data || []) {
      if (row?.id) byId.set(row.id, row);
    }

    const coHostIds = (coHostIdsResult.data || [])
      .map(row => row?.competition_id)
      .filter(id => id && !byId.has(id));

    if (coHostIds.length) {
      const { data: coHostComps, error: coHostCompsError } = await supabase
        .from('competitions')
        .select(COMPETITION_SELECT)
        .in('id', coHostIds);

      if (coHostCompsError) {
        console.error('Error fetching co-hosted competitions:', coHostCompsError);
      }
      for (const row of coHostComps || []) {
        if (row?.id) byId.set(row.id, row);
      }
    }

    return [...byId.values()].sort((a, b) => {
      const aTime = a?.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b?.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  } catch (err) {
    console.error('Error in getHostedCompetitions:', err);
    return [];
  }
}

/**
 * Get competitions where user was a contestant
 */
export async function getContestantCompetitions(userId) {
  if (!supabase || !userId) return [];

  try {
    // Get contestant entries. Pull the linked profile's avatar_url too so
    // we can fall back to it when the contestant row doesn't have its own
    // uploaded photo — matches the pattern in useLeaderboard.
    const { data: contestants, error: contestantsError } = await supabase
      .from('contestants')
      .select('*, profile:profiles!user_id(avatar_url)')
      .eq('user_id', userId)
      .neq('status', 'removed')
      .order('created_at', { ascending: false });

    if (contestantsError || !contestants?.length) {
      if (contestantsError) console.error('Error fetching contestants:', contestantsError);
      return [];
    }

    // Get competition details
    const competitionIds = [...new Set(contestants.map(c => c.competition_id).filter(Boolean))];
    if (!competitionIds.length) return [];

    const { data: competitions, error: competitionsError } = await supabase
      .from('competitions')
      .select('*, city:cities(name), organization:organizations(name, slug, logo_url, header_logo_url, default_currency), voting_rounds(id, start_date, end_date, round_order, round_type, title, tier_label, contestants_advance)')
      .in('id', competitionIds);

    if (competitionsError) {
      console.error('Error fetching competitions:', competitionsError);
      return [];
    }

    // Merge contestant data with competition data
    const competitionMap = new Map((competitions || []).map(c => [c.id, c]));

    return contestants.map(contestant => ({
      ...contestant,
      avatar_url: contestant.avatar_url || contestant.profile?.avatar_url || null,
      competition: competitionMap.get(contestant.competition_id) || null,
    }));
  } catch (err) {
    console.error('Error in getContestantCompetitions:', err);
    return [];
  }
}

/**
 * Get aggregated stats for a user (reads from profile)
 */
export async function getCompetitionStats(userId) {
  const defaultStats = { totalCompetitions: 0, totalVotes: 0, wins: 0, bestPlacement: null };

  if (!supabase || !userId) return defaultStats;

  try {
    const [profileResult, contestantsResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('total_votes_received, total_competitions, wins, best_placement')
        .eq('id', userId)
        .single(),
      supabase
        .from('contestants')
        .select('votes, lifetime_votes, rank, status')
        .eq('user_id', userId)
        .neq('status', 'removed'),
    ]);

    const profile = profileResult.data;
    const contestants = contestantsResult.data || [];

    // Calculate from contestants as source of truth for votes. Use
    // lifetime_votes (the never-reset per-competition total: paid + free +
    // bonus + manual) rather than `votes`, which is only the current round's
    // running total and gets reset when each round starts (migration 053).
    // Without this, a finished competition's winner would show just their
    // final-round count instead of everything they earned across the comp.
    // Fall back to `votes` per row in case lifetime_votes is unset on an
    // older row (it equals `votes` for a competition still in round one).
    const contestantVotes = contestants.reduce(
      (sum, c) => sum + Math.max(c.lifetime_votes || 0, c.votes || 0),
      0
    );
    const contestantWins = contestants.filter(c => c.status === 'winner').length;
    const bestRank = contestants.reduce((best, c) => {
      if (c.rank && (best === null || c.rank < best)) return c.rank;
      return best;
    }, null);

    const profileVotes = profile?.total_votes_received || 0;
    const profileComps = profile?.total_competitions || 0;
    const profileWins = profile?.wins || 0;

    return {
      totalCompetitions: Math.max(profileComps, contestants.length),
      totalVotes: contestantVotes || profileVotes,
      wins: Math.max(profileWins, contestantWins),
      bestPlacement: profile?.best_placement || bestRank,
    };
  } catch (err) {
    console.error('Error in getCompetitionStats:', err);
    return defaultStats;
  }
}
