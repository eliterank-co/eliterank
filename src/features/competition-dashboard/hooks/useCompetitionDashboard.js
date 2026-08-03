import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { getCached, setCache, dedupeRequest } from '../../../lib/queryCache';
import { checkAndAwardProfileBonuses, awardNomineeActionBonuses, setupDefaultBonusTasks } from '../../../lib/bonusVotes';

const REVENUE_CACHE_TABLE = 'competition_revenue';
const REVENUE_CACHE_TTL = 60000; // 60s — refreshes on dashboard remount past TTL

function fetchCompetitionRevenue(competitionId) {
  const cached = getCached(REVENUE_CACHE_TABLE, { competitionId });
  if (cached !== null) {
    return Promise.resolve({ data: cached, error: null });
  }
  return dedupeRequest(`${REVENUE_CACHE_TABLE}:${competitionId}`, async () => {
    const result = await supabase.rpc('get_competition_revenue', {
      p_competition_id: competitionId,
    });
    if (!result.error) {
      setCache(REVENUE_CACHE_TABLE, { competitionId }, result.data, REVENUE_CACHE_TTL);
    }
    return result;
  });
}

/**
 * Reverse of increment_profile_competitions: when a contestant is removed or
 * un-converted, drop the person's lifetime competition count back down (floored
 * at 0). Best-effort and non-critical — failures are logged, not thrown.
 */
async function decrementProfileCompetitions(userId) {
  if (!userId) return;
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('total_competitions')
      .eq('id', userId)
      .maybeSingle();
    if (profile) {
      await supabase
        .from('profiles')
        .update({ total_competitions: Math.max((profile.total_competitions || 0) - 1, 0) })
        .eq('id', userId);
    }
  } catch (err) {
    console.warn('Error decrementing profile competition count:', err);
  }
}

/**
 * Hook to fetch all dashboard data for a specific competition
 * Fetches contestants, nominees, judges, sponsors, events, announcements, rules, and host data
 * Provides CRUD operations for all entities
 */
export function useCompetitionDashboard(competitionId) {
  const [data, setData] = useState({
    contestants: [],
    nominees: [],
    judges: [],
    judgingCriteria: [],
    judgeScores: [],
    sponsors: [],
    events: [],
    announcements: [],
    rules: [],
    prizes: [],
    doubleDays: [],
    bonusTasks: [],
    host: null,
    coHosts: [],
    subscribers: [],
    competition: null,
    voteRevenue: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboardData = useCallback(async ({ silent = false } = {}) => {
    if (!competitionId) {
      setLoading(false);
      return;
    }

    // Silent refetches (e.g. after saving a setting) update data in place
    // without flipping the global loading flag — which would blank the whole
    // dashboard to a skeleton and read as a full-page reload.
    if (!silent) setLoading(true);
    setError(null);

    try {
      // Fetch competition-specific data in parallel (profiles come from cache)
      const [
        contestantsResult,
        nomineesResult,
        judgesResult,
        criteriaResult,
        scoresResult,
        sponsorsResult,
        eventsResult,
        announcementsResult,
        rulesResult,
        prizesResult,
        doubleDaysResult,
        competitionResult,
        paidVotesResult,
        coHostsResult,
        subscribersResult,
        bonusTasksResult,
      ] = await Promise.all([
        // Contestants ordered by votes (for leaderboard) - join with profiles for full data
        supabase
          .from('contestants')
          .select('*, profile:profiles!user_id(*)')
          .eq('competition_id', competitionId)
          .order('votes', { ascending: false }),

        // Nominees ordered by creation date
        supabase
          .from('nominees')
          .select('*')
          .eq('competition_id', competitionId)
          .order('created_at', { ascending: false }),

        // Judges ordered by sort_order - join with profiles for full data
        supabase
          .from('judges')
          .select('*, profile:profiles!user_id(*)')
          .eq('competition_id', competitionId)
          .order('sort_order'),

        // Judging criteria (host-defined qualities for this competition)
        supabase
          .from('judging_criteria')
          .select('*')
          .eq('competition_id', competitionId)
          .order('sort_order'),

        // All judge scores for this competition — used to render results.
        // RLS lets the host read every score; judges only see their own.
        supabase
          .from('judge_scores')
          .select('id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at')
          .eq('competition_id', competitionId),

        // Sponsors ordered by tier and sort_order
        supabase
          .from('sponsors')
          .select('*')
          .eq('competition_id', competitionId)
          .order('sort_order'),

        // Events ordered by date
        supabase
          .from('events')
          .select('*')
          .eq('competition_id', competitionId)
          .order('date'),

        // Announcements ordered by pinned and date
        supabase
          .from('announcements')
          .select('*')
          .eq('competition_id', competitionId)
          .order('pinned', { ascending: false })
          .order('published_at', { ascending: false }),

        // Rules ordered by sort_order
        supabase
          .from('competition_rules')
          .select('*')
          .eq('competition_id', competitionId)
          .order('sort_order'),

        // Prizes ordered by sort_order
        supabase
          .from('competition_prizes')
          .select('*')
          .eq('competition_id', competitionId)
          .order('sort_order'),

        // Double vote days ordered by date
        supabase
          .from('competition_double_days')
          .select('id, date')
          .eq('competition_id', competitionId)
          .order('date'),

        // Get competition info with category, demographic, city, organization, and host joins
        supabase
          .from('competitions')
          .select(`
            *,
            category:categories(id, name, slug),
            demographic:demographics(id, label, slug),
            city:cities(id, name, state, slug),
            organization:organizations(id, name, legal_entity_name, slug, logo_url, header_logo_url, website_url, instagram, tiktok, facebook, is_managed, master_agreement_version, master_agreement_accepted_at, organization_connect(stripe_connect_account_id, kyc_status, charges_enabled, payouts_enabled, connect_details_submitted)),
            host:profiles!competitions_host_id_fkey(id, email, first_name, last_name, avatar_url, bio, instagram, city, gallery),
            voting_rounds(id, start_date, end_date, round_order, round_type, title, contestants_advance, judge_weight, finalized_at, finalized_snapshot),
            nomination_periods(id, start_date, end_date, period_order, title)
          `)
          .eq('id', competitionId)
          .single(),

        // Paid-vote revenue — server-side SUM via RPC, cached for 60s
        fetchCompetitionRevenue(competitionId),

        // Co-hosts (additional hosts beyond the primary host_id)
        supabase
          .from('competition_co_hosts')
          .select('user_id, created_at, profile:profiles!user_id(id, email, first_name, last_name, avatar_url, bio, instagram, city, gallery)')
          .eq('competition_id', competitionId)
          .order('created_at', { ascending: true }),

        // Subscribers (users who opted in to "notify me when nominations open")
        supabase
          .from('competition_subscribers')
          .select('user_id, created_at, profile:profiles!user_id(id, email, first_name, last_name, avatar_url, city)')
          .eq('competition_id', competitionId)
          .order('created_at', { ascending: false }),

        // Bonus vote tasks (for the launch checklist's engagement step)
        supabase
          .from('bonus_vote_tasks')
          .select('id, enabled')
          .eq('competition_id', competitionId),
      ]);

      // Check for errors
      const errors = [
        contestantsResult.error,
        nomineesResult.error,
        judgesResult.error,
        criteriaResult.error,
        scoresResult.error,
        sponsorsResult.error,
        eventsResult.error,
        announcementsResult.error,
        rulesResult.error,
        prizesResult.error,
        doubleDaysResult.error,
        competitionResult.error,
        paidVotesResult.error,
        coHostsResult.error,
        subscribersResult.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        console.error('Errors fetching dashboard data:', errors);
        setError(errors[0]?.message || 'Error fetching data');
      }

      const competition = competitionResult.data;
      // Stripe Connect / KYC status now lives in the strict-RLS `organization_connect`
      // table (embedded above), not on `organizations`. PostgREST returns a 1:1
      // embed as an object, but normalize array-shaped results defensively.
      const ocRaw = competition?.organization?.organization_connect;
      const orgConnect = Array.isArray(ocRaw) ? (ocRaw[0] || null) : (ocRaw || null);
      let host = null;
      const hostProfile = competition?.host || null;
      if (hostProfile) {
        host = {
          id: hostProfile.id,
          name: `${hostProfile.first_name || ''} ${hostProfile.last_name || ''}`.trim() || hostProfile.email,
          firstName: hostProfile.first_name,
          lastName: hostProfile.last_name,
          email: hostProfile.email,
          bio: hostProfile.bio,
          avatar: hostProfile.avatar_url,
          instagram: hostProfile.instagram,
          city: hostProfile.city,
          gallery: hostProfile.gallery || [],
        };
      }

      const coHosts = (coHostsResult.data || [])
        .map((row) => {
          const p = row.profile;
          if (!p) return null;
          return {
            id: p.id,
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
            firstName: p.first_name,
            lastName: p.last_name,
            email: p.email,
            avatar: p.avatar_url,
            city: p.city,
            addedAt: row.created_at,
          };
        })
        .filter(Boolean);

      const subscribers = (subscribersResult.data || [])
        .map((row) => {
          const p = row.profile;
          if (!p) return null;
          return {
            id: p.id,
            name: `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
            email: p.email,
            avatar: p.avatar_url,
            city: p.city,
            subscribedAt: row.created_at,
          };
        })
        .filter(Boolean);

      // Custom-question answers live only on the nominee row. When a nominee is
      // converted to a contestant, the contestant row doesn't carry them, so
      // build a lookup to re-attach the originating nominee's answer blob to the
      // contestant (matched by user_id first, then email). The nominee row is
      // retained on conversion, so this stays valid after promotion.
      const nomineeAnswersByUserId = new Map();
      const nomineeAnswersByEmail = new Map();
      (nomineesResult.data || []).forEach((n) => {
        if (!n.eligibility_answers) return;
        if (n.user_id) nomineeAnswersByUserId.set(n.user_id, n.eligibility_answers);
        if (n.email) nomineeAnswersByEmail.set(n.email.toLowerCase(), n.eligibility_answers);
      });
      const findNomineeAnswers = (userId, email) => {
        if (userId && nomineeAnswersByUserId.has(userId)) return nomineeAnswersByUserId.get(userId);
        const e = email?.toLowerCase();
        if (e && nomineeAnswersByEmail.has(e)) return nomineeAnswersByEmail.get(e);
        return null;
      };

      // Transform contestants for leaderboard
      const contestants = (contestantsResult.data || []).map((c, index) => ({
        id: c.id,
        name: c.name,
        age: c.age,
        email: c.email || c.profile?.email || null,
        votes: c.votes || 0,
        lifetimeVotes: c.lifetime_votes || 0,
        status: c.status,
        trend: c.trend || 'same',
        rank: index + 1,
        avatarUrl: c.avatar_url || c.profile?.avatar_url,
        instagram: c.instagram || c.profile?.instagram,
        userId: c.user_id,
        gender: c.gender || null,
        eliminatedInRound: c.eliminated_in_round,
        currentRound: c.current_round,
        // Answers to host custom questions, carried over from their nominee row.
        eligibilityAnswers: findNomineeAnswers(c.user_id, c.email || c.profile?.email),
        // When the contestant row was created — powers the host's "date added"
        // sort on the People tab.
        createdAt: c.created_at,
      }));

      // Targeted profile lookup for nominee matching
      // This bypasses the cached profiles (which can be truncated by Supabase's
      // default 1000-row limit) by querying only the profiles we actually need.
      const nomineeEmails = (nomineesResult.data || [])
        .map(n => n.email?.toLowerCase()).filter(Boolean);
      const nomineeUserIds = (nomineesResult.data || [])
        .map(n => n.user_id).filter(Boolean);

      const nomineeProfilesById = new Map();
      const nomineeProfilesByEmail = new Map();

      const profileLookups = [];
      if (nomineeEmails.length > 0) {
        // Use ilike-based OR filter for case-insensitive email matching
        const emailFilter = nomineeEmails.map(e => `email.ilike.${e}`).join(',');
        profileLookups.push(
          supabase.from('profiles')
            .select('id, email, avatar_url, instagram, onboarded_at')
            .or(emailFilter)
        );
      }
      if (nomineeUserIds.length > 0) {
        profileLookups.push(
          supabase.from('profiles')
            .select('id, email, avatar_url, instagram, onboarded_at')
            .in('id', nomineeUserIds)
        );
      }
      if (profileLookups.length > 0) {
        const profileResults = await Promise.all(profileLookups);
        profileResults.forEach(r => {
          (r.data || []).forEach(p => {
            nomineeProfilesById.set(p.id, p);
            if (p.email) {
              nomineeProfilesByEmail.set(p.email.toLowerCase(), p);
            }
          });
        });
      }

      // Transform nominees - include all fields for categorization
      const nominees = (nomineesResult.data || []).map((n) => {
        let hasProfile = false;
        let matchedProfileId = null;
        let matchedProfile = null;

        // Match by user_id first (set when nominee claims their nomination)
        if (n.user_id) {
          matchedProfileId = n.user_id;
          matchedProfile = nomineeProfilesById.get(n.user_id) || null;
          // Count as "has profile" if the user has completed onboarding or
          // has a real profile (matched profile with onboarded_at, or avatar).
          // claimed_at alone is NOT sufficient — it can be set when the nominee
          // clicks "Accept" before finishing the flow.
          if (!!matchedProfile?.onboarded_at || (!!n.claimed_at && !!matchedProfile)) {
            hasProfile = true;
          } else if (n.nominated_by === 'self') {
            hasProfile = !!n.avatar_url || !!matchedProfile?.avatar_url;
          }
        }
        // Fall back to email matching
        else if (n.email) {
          const emailLower = n.email.toLowerCase();
          const directMatch = nomineeProfilesByEmail.get(emailLower);
          if (directMatch) {
            hasProfile = !!directMatch.onboarded_at;
            matchedProfileId = directMatch.id;
            matchedProfile = directMatch;
          }
        }

        // Self-nominees who completed the flow but whose user_id wasn't linked
        // (RLS blocked the client-side update). Only count them if they have a
        // matching profile with onboarding evidence (not just a pre-created shell).
        if (!hasProfile && n.nominated_by === 'self' && matchedProfile) {
          hasProfile = !!matchedProfile.onboarded_at || !!matchedProfile.avatar_url;
        }

        return {
          id: n.id,
          name: n.name,
          email: n.email,
          phone: n.phone,
          userId: n.user_id,
          nominatedBy: n.nominated_by,
          nominatorId: n.nominator_id,
          nominatorName: n.nominator_name,
          nominationReason: n.nomination_reason,
          nominatorAnonymous: n.nominator_anonymous,
          matchedProfileId,
          hasProfile,
          avatarUrl: matchedProfile?.avatar_url || n.avatar_url || null,
          instagram: n.instagram || matchedProfile?.instagram || null,
          status: n.status,
          gender: n.gender || null,
          inviteToken: n.invite_token,
          inviteSentAt: n.invite_sent_at,
          claimedAt: n.claimed_at,
          flowStage: n.flow_stage || null,
          convertedToContestant: n.converted_to_contestant,
          // Raw answer blob (eligibility + host custom questions, cq_-prefixed)
          // so the host can review the nominee's responses on the People tab.
          eligibilityAnswers: n.eligibility_answers || null,
          createdAt: n.created_at,
        };
      });

      // Transform judges
      const judges = (judgesResult.data || []).map((j) => ({
        id: j.id,
        userId: j.user_id,
        name: j.name,
        title: j.title || 'Judge',
        bio: j.bio,
        avatarUrl: j.avatar_url,
        instagram: j.instagram,
        sortOrder: j.sort_order,
        email: j.email || j.profile?.email || null,
        inviteToken: j.invite_token,
        inviteSentAt: j.invite_sent_at,
        claimedAt: j.claimed_at,
      }));

      // Transform judging criteria (host-defined qualities)
      const judgingCriteria = (criteriaResult.data || []).map((c) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        weight: parseFloat(c.weight) || 1,
        sortOrder: c.sort_order,
      }));

      // Transform judge scores (raw rows — aggregation happens in the UI
      // because the formula depends on per-round judge_weight and vote totals).
      const judgeScores = (scoresResult.data || []).map((s) => ({
        id: s.id,
        votingRoundId: s.voting_round_id,
        judgeId: s.judge_id,
        contestantId: s.contestant_id,
        criterionId: s.criterion_id,
        score: s.score,
        submittedAt: s.submitted_at,
      }));

      // Transform sponsors with their child prizes (linked via competition_prizes.sponsor_id)
      const prizesBySponsorId = new Map();
      (prizesResult.data || []).forEach((p) => {
        if (!p.sponsor_id) return;
        const list = prizesBySponsorId.get(p.sponsor_id) || [];
        list.push({
          id: p.id,
          title: p.title || '',
          description: p.description || '',
          value: p.value || '',
          imageUrl: p.image_url || '',
          prizeType: p.prize_type || 'contestant',
          recipientGender: p.recipient_gender || 'all',
          sortOrder: p.sort_order || 0,
        });
        prizesBySponsorId.set(p.sponsor_id, list);
      });
      const sponsors = (sponsorsResult.data || []).map((s) => ({
        id: s.id,
        name: s.name,
        tier: s.tier?.toLowerCase() || 'gold',
        amount: parseFloat(s.amount) || 0,
        logoUrl: s.logo_url,
        websiteUrl: s.website_url,
        sortOrder: s.sort_order,
        rewardRecipient: s.reward_recipient || '',
        rewardTopXCount: s.reward_top_x_count ?? null,
        prizes: (prizesBySponsorId.get(s.id) || []).sort((a, b) => a.sortOrder - b.sortOrder),
      }));

      // Transform events
      const events = (eventsResult.data || []).map((e) => ({
        id: e.id,
        name: e.name,
        date: e.date,
        endDate: e.end_date,
        time: e.time,
        location: e.location,
        description: e.description,
        imageUrl: e.image_url,
        ticketUrl: e.ticket_url,
        status: e.status,
        isDoubleVoteDay: e.is_double_vote_day,
        publicVisible: e.public_visible,
        sortOrder: e.sort_order,
      }));

      // Transform announcements
      const announcements = (announcementsResult.data || []).map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        pinned: a.pinned,
        type: a.type,
        publishedAt: a.published_at,
        createdAt: a.created_at,
      }));

      // Transform rules
      const rules = (rulesResult.data || []).map((r) => ({
        id: r.id,
        sectionTitle: r.section_title,
        sectionContent: r.section_content,
        sortOrder: r.sort_order,
      }));

      // Transform double vote days
      const doubleDays = (doubleDaysResult.data || []).map((d) => ({
        id: d.id,
        date: d.date,
      }));

      // Paid-vote revenue (Stripe) — scalar from get_competition_revenue RPC
      const voteRevenue = parseFloat(paidVotesResult.data) || 0;

      // Transform prizes
      const prizes = (prizesResult.data || []).map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        imageUrl: p.image_url,
        value: p.value,
        sponsorName: p.sponsor_name,
        externalUrl: p.external_url,
        sortOrder: p.sort_order,
        prizeType: p.prize_type || 'winner',
      }));

      setData({
        contestants,
        nominees,
        judges,
        judgingCriteria,
        judgeScores,
        sponsors,
        events,
        announcements,
        rules,
        prizes,
        doubleDays,
        bonusTasks: bonusTasksResult.data || [],
        host,
        coHosts,
        subscribers,
        voteRevenue,
        competition: competition ? {
          id: competition.id,
          name: competition.name,
          status: competition.status,
          season: competition.season,
          hostId: competition.host_id,
          organizationId: competition.organization_id,
          city: competition.city?.name || null,
          cityData: competition.city,
          cityId: competition.city_id,
          nominationStart: competition.nomination_start,
          nominationEnd: competition.nomination_end,
          votingStart: competition.voting_start
            || competition.voting_rounds
              ?.filter(r => r.round_type === 'voting')
              ?.map(r => r.start_date)
              ?.sort()[0]
            || null,
          votingEnd: competition.voting_end,
          finalsDate: competition.finals_date,
          hasEvents: competition.has_events,
          numberOfWinners: competition.number_of_winners,
          selectionCriteria: competition.selection_criteria,
          entryType: competition.entry_type,
          rulesDocUrl: competition.rules_doc_url,
          description: competition.description,
          winners: competition.winners || [],
          nominationFormConfig: competition.nomination_form_config,
          // About section (read by AboutSectionEditor in the Content tab,
          // which compares form state against these raw snake_case fields).
          about_description: competition.about_description ?? null,
          about_traits: competition.about_traits ?? null,
          about_age_range: competition.about_age_range ?? null,
          about_requirement: competition.about_requirement ?? null,
          // Category & Demographic (joined)
          categoryId: competition.category_id,
          categoryName: competition.category?.name || null,
          categorySlug: competition.category?.slug || null,
          demographicId: competition.demographic_id,
          demographicName: competition.demographic?.label || null,
          demographicSlug: competition.demographic?.slug || null,
          // Settings (admin-controlled)
          eligibilityRadiusMiles: competition.eligibility_radius_miles || 100,
          minContestants: competition.min_contestants || 40,
          maxContestants: competition.max_contestants || null,
          // Onboarding-set fields (the create wizard) — for the overview recap.
          cityId: competition.city_id || null,
          categoryTemplate: competition.category_template || null,
          territoryScope: competition.territory_scope || null,
          territoryState: competition.territory_state || null,
          eligibilityGender: competition.eligibility_gender || null,
          eligibilityAgeMin: competition.eligibility_age_min ?? null,
          eligibilityAgeMax: competition.eligibility_age_max ?? null,
          entryType: competition.entry_type || null,
          selectionCriteria: competition.selection_criteria || null,
          numberOfWinners: competition.number_of_winners ?? null,
          charityPercentage: competition.charity_percentage ?? null,
          plannedLaunchTimeframe: competition.planned_launch_timeframe || null,
          cashPrizeAmount: competition.cash_prize_amount ?? null,
          hasSponsoredPrizes: !!competition.has_sponsored_prizes,
          prizeReviewRequired: !!competition.prize_review_required,
          showPublicHost: competition.show_public_host !== false,
          // Additional fields for card generation and links
          slug: competition.slug || null,
          organizationName: competition.organization?.name || null,
          // Company-run ("house") org: Host Agreement is signed off-platform and
          // payouts settle to the company Stripe account, so the on-platform
          // agreement + Stripe-Connect/KYC launch gates don't apply.
          managed: !!competition.organization?.is_managed,
          organizationLegalEntityName: competition.organization?.legal_entity_name || null,
          organizationLogoUrl: competition.organization?.logo_url || null,
          organizationHeaderLogoUrl: competition.organization?.header_logo_url || null,
          organizationWebsiteUrl: competition.organization?.website_url || null,
          organizationInstagram: competition.organization?.instagram || null,
          organizationTiktok: competition.organization?.tiktok || null,
          organizationFacebook: competition.organization?.facebook || null,
          // Stripe Connect (payouts) status for the host org — read back from
          // Stripe, never self-attested (§5.1). Drives the Payouts card.
          connect: {
            hasAccount: !!orgConnect?.stripe_connect_account_id,
            kycStatus: orgConnect?.kyc_status || 'not_started',
            chargesEnabled: !!orgConnect?.charges_enabled,
            payoutsEnabled: !!orgConnect?.payouts_enabled,
            detailsSubmitted: !!orgConnect?.connect_details_submitted,
          },
          // Promoter/Master Agreement acceptance for the host org. Must be
          // accepted (current version) BEFORE connecting Stripe, and is a
          // requirement for publishing (migration 083).
          agreement: {
            version: competition.organization?.master_agreement_version || null,
            acceptedAt: competition.organization?.master_agreement_accepted_at || null,
          },
          themePrimary: competition.theme_primary || null,
          // Charity fields
          charityName: competition.charity_name || null,
          charityLogoUrl: competition.charity_logo_url || null,
          charityWebsiteUrl: competition.charity_website_url || null,
          // IANA timezone for double-vote-day scheduling. Default 'UTC'
          // matches the column default; hosts opt in via SetupTab.
          timezone: competition.timezone || 'UTC',
          // Super-admin gate: when true, the nomination form collects gender
          // and winner selection is split male/female.
          winnersSplitByGender: competition.winners_split_by_gender ?? false,
          // Setup-tab section ids the host has grayed out.
          hiddenSetupSections: competition.hidden_setup_sections || [],
          // Timeline arrays — pass through so computeCompetitionPhase can
          // detect between-rounds vs. nominations correctly.
          nomination_periods: competition.nomination_periods || [],
          voting_rounds: competition.voting_rounds || [],
        } : null,
      });
    } catch (err) {
      console.error('Error in useCompetitionDashboard:', err);
      setError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [competitionId]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Refresh function for manual refetch
  const refresh = useCallback(() => {
    fetchDashboardData({ silent: true });
  }, [fetchDashboardData]);

  // ============================================================================
  // NOMINEE OPERATIONS
  // ============================================================================

  const approveNominee = useCallback(async (nominee) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      // Find profile to link to contestant
      let linkedUserId = nominee.userId || nominee.matchedProfileId || null;

      if (!linkedUserId && nominee.email) {
        const { data: profileByEmail } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', nominee.email)
          .limit(1)
          .maybeSingle();

        if (profileByEmail?.id) {
          linkedUserId = profileByEmail.id;
        }
      }

      // Guard against duplicate contestants. The DB only enforces uniqueness on
      // (competition_id, user_id), which doesn't catch nominees with no linked
      // account (user_id NULL) or a fast double-click. Refuse to create a second
      // contestant for the same person in this competition.
      let dupQuery = supabase
        .from('contestants')
        .select('id')
        .eq('competition_id', competitionId);
      if (linkedUserId) {
        dupQuery = dupQuery.eq('user_id', linkedUserId);
      } else if (nominee.email) {
        dupQuery = dupQuery.ilike('email', nominee.email);
      } else {
        dupQuery = dupQuery.eq('id', '00000000-0000-0000-0000-000000000000'); // no match key → skip
      }
      const { data: existingContestant } = await dupQuery.limit(1).maybeSingle();
      if (existingContestant?.id) {
        return {
          success: false,
          error: `${nominee.name} is already a contestant in this competition.`,
        };
      }

      const contestantData = {
        competition_id: competitionId,
        name: nominee.name,
        email: nominee.email,
        phone: nominee.phone,
        gender: nominee.gender ?? null,
        status: 'active',
        votes: 0,
        user_id: linkedUserId,
      };

      // Insert contestant FIRST — if this fails, nominee stays pending
      const { data: insertedContestant, error: insertError } = await supabase
        .from('contestants')
        .insert(contestantData)
        .select('id')
        .single();

      if (insertError) throw insertError;

      // Only mark nominee as approved after contestant was created
      const { error: updateError } = await supabase
        .from('nominees')
        .update({ status: 'approved', converted_to_contestant: true })
        .eq('id', nominee.id);

      if (updateError) {
        console.error('Nominee status update failed after contestant insert:', updateError);
        throw updateError;
      }

      // Migrate reward assignments from nominee → contestant so claimed
      // status, discount codes, etc. carry over after promotion.
      if (insertedContestant?.id) {
        try {
          await supabase
            .from('reward_assignments')
            .update({ contestant_id: insertedContestant.id })
            .eq('nominee_id', nominee.id)
            .is('contestant_id', null);
        } catch (rewardErr) {
          console.warn('Error migrating reward assignments to contestant:', rewardErr);
        }
      }

      // Auto-award bonus votes earned during nominee phase
      if (linkedUserId && insertedContestant?.id) {
        try {
          await setupDefaultBonusTasks(competitionId);
          // Award profile-based tasks
          const { data: profile } = await supabase
            .from('profiles')
            .select('first_name, bio, city, avatar_url, instagram, twitter, tiktok, linkedin')
            .eq('id', linkedUserId)
            .maybeSingle();
          if (profile) {
            await checkAndAwardProfileBonuses(competitionId, insertedContestant.id, linkedUserId, profile);
          }
          // Award action-based tasks completed during nominee phase (view_how_to_win, share_profile)
          await awardNomineeActionBonuses(competitionId, insertedContestant.id, linkedUserId);
        } catch (bonusErr) {
          console.warn('Error auto-awarding bonus votes on conversion:', bonusErr);
        }
      }

      // Notify the nominee that they've been approved
      if (linkedUserId) {
        const cityName = data.competition?.city?.name || data.competition?.city || '';
        const season = data.competition?.season || '';
        try {
          await supabase.from('notifications').insert({
            user_id: linkedUserId,
            type: 'nomination_approved',
            title: "You're officially in!",
            body: `Your nomination for Most Eligible ${cityName} ${season} has been approved. You're now a contestant!`.trim(),
            competition_id: competitionId,
          });
        } catch (notifErr) {
          console.warn('Failed to create approval notification:', notifErr);
        }
      }

      // Email the newly-converted contestant that they're officially in,
      // branded with this specific competition (fire-and-forget). The edge
      // function reads the contestant's email/name from the row we just
      // inserted, so it also works for nominees with no linked account.
      if (insertedContestant?.id) {
        supabase.functions
          .invoke('notify-contestant-promoted', {
            body: { contestant_id: insertedContestant.id },
          })
          .catch((emailErr) =>
            console.warn('Failed to send contestant promotion email:', emailErr)
          );
      }

      // Update profile's competition count if linked
      if (linkedUserId) {
        try {
          const { error: rpcError } = await supabase.rpc('increment_profile_competitions', {
            p_user_id: linkedUserId,
          });

          if (rpcError) {
            // Fallback to manual update
            const { data: profile } = await supabase
              .from('profiles')
              .select('total_competitions')
              .eq('id', linkedUserId)
              .maybeSingle();

            if (profile) {
              await supabase
                .from('profiles')
                .update({
                  total_competitions: (profile.total_competitions || 0) + 1,
                })
                .eq('id', linkedUserId);
            }
          }
        } catch (profileErr) {
          console.warn('Error updating profile competition count:', profileErr);
          // Non-critical, don't fail the approval
        }
      }

      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error approving nominee:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, data.competition, fetchDashboardData]);

  const rejectNominee = useCallback(async (nomineeId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error: updateError } = await supabase
        .from('nominees')
        .update({ status: 'rejected' })
        .eq('id', nomineeId);

      if (updateError) throw updateError;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error rejecting nominee:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const restoreNominee = useCallback(async (nomineeId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      // Restore to 'pending' — the only valid "active nominee" status
      // (nominees_status_check allows pending/approved/rejected/expired/declined).
      // The nominee's funnel position is preserved by `flow_stage`, which
      // reject/restore never touch, so the dashboard re-derives their bucket
      // (Awaiting Response / Ready to Approve) from flow_stage + profile.
      const { error: updateError } = await supabase
        .from('nominees')
        .update({ status: 'pending' })
        .eq('id', nomineeId);

      if (updateError) throw updateError;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error restoring nominee:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const removeContestant = useCallback(async (contestantId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { data: contestant } = await supabase
        .from('contestants')
        .select('email, user_id')
        .eq('id', contestantId)
        .single();

      const { error: deleteError } = await supabase
        .from('contestants')
        .delete()
        .eq('id', contestantId);

      if (deleteError) throw deleteError;

      if (contestant?.email) {
        await supabase
          .from('nominees')
          .update({ status: 'rejected', converted_to_contestant: false })
          .eq('competition_id', competitionId)
          .ilike('email', contestant.email)
          .eq('status', 'approved');
      }

      // Conversion bumped the person's lifetime competition count; undo it.
      await decrementProfileCompetitions(contestant?.user_id);

      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error removing contestant:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  /**
   * Undo an accidental nominee→contestant conversion.
   *
   * Unlike removeContestant (which rejects the person), this returns them to
   * the nominee pool as "pending" so they can be re-approved on purpose. It
   * refuses to run if the contestant has accrued real fan votes — those would
   * be lost. Bonus votes auto-awarded by the conversion itself cascade away
   * with the contestant row and are expected to be discarded.
   */
  const unconvertContestant = useCallback(async (contestantId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { data: contestant } = await supabase
        .from('contestants')
        .select('email, name, user_id')
        .eq('id', contestantId)
        .single();

      // Guard: never silently drop real fan votes. Bonus-vote rows live in a
      // separate table and cascade with the contestant, so only the `votes`
      // table counts as "real" here.
      const { count: realVotes } = await supabase
        .from('votes')
        .select('id', { count: 'exact', head: true })
        .eq('contestant_id', contestantId);

      if (realVotes && realVotes > 0) {
        return {
          success: false,
          error: `${contestant?.name || 'This contestant'} already has ${realVotes} fan vote${realVotes === 1 ? '' : 's'}. Use Remove instead — moving them back to nominees would erase those votes.`,
        };
      }

      // Deleting the contestant cascades bonus votes / aggregates / cards etc.
      const { error: deleteError } = await supabase
        .from('contestants')
        .delete()
        .eq('id', contestantId);

      if (deleteError) throw deleteError;

      // Return the matching nominee to the approve queue (not "rejected").
      if (contestant?.email) {
        await supabase
          .from('nominees')
          .update({ status: 'pending', converted_to_contestant: false })
          .eq('competition_id', competitionId)
          .ilike('email', contestant.email)
          .eq('status', 'approved');
      }

      // Conversion bumped the person's lifetime competition count; undo it.
      await decrementProfileCompetitions(contestant?.user_id);

      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error un-converting contestant:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  /**
   * Resend invitation email to a nominee
   * Uses force_resend to bypass the already-sent check
   */
  const resendInvite = useCallback(async (nomineeId) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      // Refresh session before calling edge function to avoid 401
      await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('send-nomination-invite', {
        body: { nominee_id: nomineeId, force_resend: true },
      });

      if (error) {
        // Check for auth errors
        if (error.message?.includes('401') || error.message?.includes('unauthorized') || error.message?.includes('JWT')) {
          return { success: false, error: 'Your session has expired. Please refresh the page and try again.' };
        }
        throw error;
      }

      // Update invite_sent_at locally instead of refetching all dashboard data
      setData(prev => ({
        ...prev,
        nominees: prev.nominees.map(n =>
          n.id === nomineeId ? { ...n, inviteSentAt: new Date().toISOString() } : n
        ),
      }));
      return { success: true, data };
    } catch (err) {
      console.error('Error resending invite:', err);
      return { success: false, error: err.message || 'Failed to send reminder' };
    }
  }, []);

  /**
   * Check whether the host may broadcast this week. Reads the host_messages
   * ledger (RLS-scoped to hosts) for a send within the last 7 days.
   * @returns {{ canSend: boolean, nextAllowedAt: string|null }}
   */
  const getHostBroadcastStatus = useCallback(async () => {
    if (!supabase || !competitionId) return { canSend: true, nextAllowedAt: null };
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const cutoff = new Date(Date.now() - WEEK_MS).toISOString();
    try {
      const { data, error } = await supabase
        .from('host_messages')
        .select('created_at')
        .eq('competition_id', competitionId)
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data) return { canSend: true, nextAllowedAt: null };
      const nextAllowedAt = new Date(new Date(data.created_at).getTime() + WEEK_MS).toISOString();
      return { canSend: false, nextAllowedAt };
    } catch {
      return { canSend: true, nextAllowedAt: null };
    }
  }, [competitionId]);

  /**
   * Broadcast one message to a whole audience (contestants, nominees, or
   * everyone). Delivers in-app notifications (recipients with an account) and
   * email previews (recipients with an email) via the send-host-broadcast edge
   * function, which authorizes the caller as host and enforces the weekly limit.
   *
   * @param {'contestants'|'nominees'|'everyone'} audience
   * @param {string} subject
   * @param {string} message
   */
  const sendHostBroadcast = useCallback(async (audience, subject, message) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      // Refresh session before calling edge function to avoid 401
      await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke('send-host-broadcast', {
        body: { competition_id: competitionId, audience, subject, message },
      });

      if (error) {
        if (error.message?.includes('401') || error.message?.includes('unauthorized') || error.message?.includes('JWT')) {
          return { success: false, error: 'Your session has expired. Please refresh the page and try again.' };
        }
        throw error;
      }

      // The edge function reports the weekly-limit case as a 200 with
      // success:false so the client can show a clean message.
      if (data && data.success === false) {
        return { success: false, error: data.error || 'Failed to send message', data };
      }

      return { success: true, data };
    } catch (err) {
      console.error('Error sending host broadcast:', err);
      return { success: false, error: err.message || 'Failed to send message' };
    }
  }, [competitionId]);

  /**
   * Manually add a nominee (by admin/host)
   * Can be linked to an existing profile or created with manual data
   */
  const addNominee = useCallback(async (nomineeData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const baseRecord = {
        competition_id: competitionId,
        user_id: nomineeData.userId || null,
        name: nomineeData.name,
        email: nomineeData.email ? nomineeData.email.replace(/^.*<([^>]+)>$/, '$1').trim() : null,
        phone: nomineeData.phone || null,
        instagram: nomineeData.instagram || null,
        city: nomineeData.city || null,
        gender: nomineeData.gender || null,
        avatar_url: nomineeData.avatarUrl || null,
        nominated_by: 'admin',
        invite_token: crypto.randomUUID(),
        status: 'pending',
      };

      let { data: inserted, error: insertError } = await supabase
        .from('nominees')
        .insert(baseRecord)
        .select('id')
        .single();

      // Schema-cache fallback: if 077 (nominees.gender) hasn't propagated
      // yet, retry without the gender column so host-add keeps working.
      if (insertError && (insertError.code === 'PGRST204' || insertError.message?.includes('schema cache') || insertError.message?.includes('column "gender"'))) {
        // eslint-disable-next-line no-unused-vars
        const { gender, ...withoutGender } = baseRecord;
        ({ data: inserted, error: insertError } = await supabase
          .from('nominees')
          .insert(withoutGender)
          .select('id')
          .single());
      }

      if (insertError) throw insertError;

      // Auto-send invite email after adding nominee
      if (inserted?.id) {
        supabase.functions.invoke('send-nomination-invite', {
          body: { nominee_id: inserted.id },
        }).catch((inviteErr) => {
          console.warn('Failed to auto-send nomination invite:', inviteErr);
        });
      }

      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding nominee:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  /**
   * Manually add a contestant directly (skip nomination process)
   * Can be linked to an existing profile or created with manual data
   */
  const addContestant = useCallback(async (contestantData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const linkedUserId = contestantData.userId || null;

      const baseRecord = {
        competition_id: competitionId,
        name: contestantData.name,
        email: contestantData.email,
        instagram: contestantData.instagram,
        age: contestantData.age,
        bio: contestantData.bio,
        gender: contestantData.gender || null,
        avatar_url: contestantData.avatarUrl || null,
        status: 'active',
        votes: 0,
        user_id: linkedUserId,
      };

      let { error: insertError } = await supabase
        .from('contestants')
        .insert(baseRecord);

      // Schema-cache fallback for the contestants.gender column from 077.
      if (insertError && (insertError.code === 'PGRST204' || insertError.message?.includes('schema cache') || insertError.message?.includes('column "gender"'))) {
        // eslint-disable-next-line no-unused-vars
        const { gender, ...withoutGender } = baseRecord;
        ({ error: insertError } = await supabase
          .from('contestants')
          .insert(withoutGender));
      }

      if (insertError) throw insertError;

      // Update profile's competition count if linked
      if (linkedUserId) {
        try {
          const { error: rpcError } = await supabase.rpc('increment_profile_competitions', {
            p_user_id: linkedUserId,
          });

          if (rpcError) {
            // Fallback to manual update
            const { data: profile } = await supabase
              .from('profiles')
              .select('total_competitions')
              .eq('id', linkedUserId)
              .maybeSingle();

            if (profile) {
              await supabase
                .from('profiles')
                .update({
                  total_competitions: (profile.total_competitions || 0) + 1,
                })
                .eq('id', linkedUserId);
            }
          }
        } catch (profileErr) {
          console.warn('Error updating profile competition count:', profileErr);
        }
      }

      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding contestant:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  // ============================================================================
  // JUDGE OPERATIONS
  // ============================================================================

  const addJudge = useCallback(async (judgeData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const maxSort = data.judges.length > 0 ? Math.max(...data.judges.map(j => j.sortOrder || 0)) : 0;
      const { data: inserted, error } = await supabase
        .from('judges')
        .insert({
          competition_id: competitionId,
          name: judgeData.name,
          title: judgeData.title,
          bio: judgeData.bio,
          avatar_url: judgeData.avatarUrl,
          user_id: judgeData.userId,
          instagram: judgeData.instagram || null,
          email: judgeData.email ? judgeData.email.trim() : null,
          sort_order: maxSort + 1,
        })
        .select('id')
        .single();

      if (error) throw error;
      await fetchDashboardData();
      return { success: true, judgeId: inserted?.id };
    } catch (err) {
      console.error('Error adding judge:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, data.judges, fetchDashboardData]);

  const updateJudge = useCallback(async (judgeId, judgeData) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('judges')
        .update({
          name: judgeData.name,
          title: judgeData.title,
          bio: judgeData.bio,
          avatar_url: judgeData.avatarUrl,
          instagram: judgeData.instagram || null,
          email: judgeData.email ? judgeData.email.trim() : null,
        })
        .eq('id', judgeId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating judge:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const deleteJudge = useCallback(async (judgeId) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('judges')
        .delete()
        .eq('id', judgeId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error deleting judge:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const sendJudgeInvite = useCallback(async (judgeId, { forceResend = false } = {}) => {
    try {
      const { data: result, error } = await supabase.functions.invoke('send-judge-invite', {
        body: { judge_id: judgeId, force_resend: forceResend },
      });
      if (error) throw error;
      await fetchDashboardData();
      return { success: true, data: result };
    } catch (err) {
      console.error('Error sending judge invite:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  // ============================================================================
  // JUDGING CRITERIA OPERATIONS
  // ============================================================================

  const addCriterion = useCallback(async (criterion) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };
    try {
      const maxSort = data.judgingCriteria.length > 0
        ? Math.max(...data.judgingCriteria.map(c => c.sortOrder || 0))
        : 0;
      const { error } = await supabase.from('judging_criteria').insert({
        competition_id: competitionId,
        label: criterion.label,
        description: criterion.description || null,
        weight: criterion.weight ?? 1,
        sort_order: maxSort + 1,
      });
      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding criterion:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, data.judgingCriteria, fetchDashboardData]);

  const updateCriterion = useCallback(async (criterionId, updates) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };
    try {
      const { error } = await supabase
        .from('judging_criteria')
        .update({
          label: updates.label,
          description: updates.description || null,
          weight: updates.weight ?? 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', criterionId);
      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating criterion:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const deleteCriterion = useCallback(async (criterionId) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };
    try {
      const { error } = await supabase
        .from('judging_criteria')
        .delete()
        .eq('id', criterionId);
      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error deleting criterion:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  // ============================================================================
  // CHARITY OPERATIONS
  // ============================================================================

  const updateCharity = useCallback(async (charityData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competitions')
        .update({
          charity_name: charityData.name || null,
          charity_logo_url: charityData.logoUrl || null,
          charity_website_url: charityData.websiteUrl || null,
        })
        .eq('id', competitionId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating charity:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const removeCharity = useCallback(async () => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competitions')
        .update({
          charity_name: null,
          charity_logo_url: null,
          charity_website_url: null,
        })
        .eq('id', competitionId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error removing charity:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  // ============================================================================
  // SPONSOR OPERATIONS
  // ============================================================================

  // Default prize_type for NEW prizes (no existing id): winners → 'winner', else 'contestant'.
  const defaultPrizeTypeFromRecipient = (recipient) =>
    recipient === 'winners' ? 'winner' : 'contestant';

  // competition_prizes.recipient_gender (migration 114) can 404 in PostgREST's
  // schema cache for a short window right after its migration, or if the frontend
  // ships ahead of it. Detect that so a prize write can retry without the column
  // rather than hard-failing — it falls back to the DB default ('all') until the
  // cache catches up. Mirrors the nominees/contestants gender fallback.
  const isMissingRecipientGender = (err) =>
    !!err && (
      err.code === 'PGRST204' ||
      err.message?.includes('schema cache') ||
      err.message?.includes('recipient_gender')
    );

  // eslint-disable-next-line no-unused-vars
  const stripGender = ({ recipient_gender, ...rest }) => rest;

  // Insert competition_prizes rows, retrying without recipient_gender on a
  // schema-cache miss so a stale cache can never block saving a prize.
  const insertPrizeRows = async (rows) => {
    let { error } = await supabase.from('competition_prizes').insert(rows);
    if (isMissingRecipientGender(error)) {
      ({ error } = await supabase.from('competition_prizes').insert(rows.map(stripGender)));
    }
    return { error };
  };

  // Update one competition_prizes row, with the same recipient_gender fallback.
  const updatePrizeRow = async (id, row) => {
    let { error } = await supabase.from('competition_prizes').update(row).eq('id', id);
    if (isMissingRecipientGender(error)) {
      ({ error } = await supabase.from('competition_prizes').update(stripGender(row)).eq('id', id));
    }
    return { error };
  };

  const addSponsor = useCallback(async (sponsorData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const maxSort = data.sponsors.length > 0 ? Math.max(...data.sponsors.map(s => s.sortOrder || 0)) : 0;
      const { data: inserted, error } = await supabase
        .from('sponsors')
        .insert({
          competition_id: competitionId,
          name: sponsorData.name,
          tier: sponsorData.tier,
          amount: sponsorData.amount || 0,
          logo_url: sponsorData.logoUrl || null,
          website_url: sponsorData.websiteUrl || null,
          reward_recipient: sponsorData.recipient || null,
          reward_top_x_count: sponsorData.topXCount ?? null,
          sort_order: maxSort + 1,
        })
        .select('id')
        .single();

      if (error) throw error;

      const prizes = (sponsorData.prizes || []).filter((p) => (p.title || '').trim().length > 0);
      if (prizes.length > 0) {
        const prizeType = defaultPrizeTypeFromRecipient(sponsorData.recipient);
        const prizeRows = prizes.map((p, idx) => ({
          competition_id: competitionId,
          sponsor_id: inserted.id,
          sponsor_name: sponsorData.name || null,
          title: p.title.trim(),
          description: p.description || null,
          value: p.value ? String(p.value) : null,
          image_url: p.imageUrl || null,
          prize_type: prizeType,
          recipient_gender: p.recipientGender || 'all',
          sort_order: idx,
        }));
        const { error: prizeError } = await insertPrizeRows(prizeRows);
        if (prizeError) throw prizeError;
      }

      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding sponsor:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, data.sponsors, fetchDashboardData]);

  const updateSponsor = useCallback(async (sponsorId, sponsorData) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('sponsors')
        .update({
          name: sponsorData.name,
          tier: sponsorData.tier,
          amount: sponsorData.amount || 0,
          logo_url: sponsorData.logoUrl || null,
          website_url: sponsorData.websiteUrl || null,
          reward_recipient: sponsorData.recipient || null,
          reward_top_x_count: sponsorData.topXCount ?? null,
        })
        .eq('id', sponsorId);

      if (error) throw error;

      // Diff-based prize sync. Preserves external_url and voting_round_id on
      // existing rows (the wizard doesn't model them, so we never write them).
      // prize_type IS re-synced from the sponsor's recipient on every save so it
      // can't drift — e.g. switching recipient from Winners to All moves existing
      // prizes from the winner package to contestant rewards.
      const { data: existing, error: readError } = await supabase
        .from('competition_prizes')
        .select('id')
        .eq('sponsor_id', sponsorId);
      if (readError) throw readError;

      const existingIds = new Set((existing || []).map((p) => p.id));
      const submitted = (sponsorData.prizes || []).filter((p) => (p.title || '').trim().length > 0);
      const submittedIds = new Set(submitted.filter((p) => p.id).map((p) => p.id));

      const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from('competition_prizes')
          .delete()
          .in('id', toDelete);
        if (delErr) throw delErr;
      }

      const newPrizeType = defaultPrizeTypeFromRecipient(sponsorData.recipient);
      for (let i = 0; i < submitted.length; i++) {
        const p = submitted[i];
        const sharedFields = {
          sponsor_name: sponsorData.name || null,
          title: p.title.trim(),
          description: p.description || null,
          value: p.value ? String(p.value) : null,
          image_url: p.imageUrl || null,
          prize_type: newPrizeType,
          recipient_gender: p.recipientGender || 'all',
          sort_order: i,
        };

        if (p.id && existingIds.has(p.id)) {
          const { error: updErr } = await updatePrizeRow(p.id, sharedFields);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await insertPrizeRows([{
            competition_id: competitionId,
            sponsor_id: sponsorId,
            ...sharedFields,
          }]);
          if (insErr) throw insErr;
        }
      }

      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating sponsor:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const deleteSponsor = useCallback(async (sponsorId) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('sponsors')
        .delete()
        .eq('id', sponsorId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error deleting sponsor:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  // ============================================================================
  // EVENT OPERATIONS
  // ============================================================================

  const addEvent = useCallback(async (eventData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    // date is required by the DB schema
    if (!eventData.date) return { success: false, error: 'Date is required' };

    try {
      const maxSort = data.events.length > 0 ? Math.max(...data.events.map(e => e.sortOrder || 0)) : 0;
      const { error } = await supabase
        .from('events')
        .insert({
          competition_id: competitionId,
          name: eventData.name,
          date: eventData.date,
          end_date: eventData.endDate || null,
          time: eventData.time || null,
          location: eventData.location || null,
          description: eventData.description || null,
          image_url: eventData.imageUrl || null,
          ticket_url: eventData.ticketUrl || null,
          status: eventData.status || 'upcoming',
          public_visible: eventData.publicVisible ?? true,
          is_double_vote_day: eventData.isDoubleVoteDay ?? false,
          sort_order: maxSort + 1,
        });

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding event:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, data.events, fetchDashboardData]);

  const updateEvent = useCallback(async (eventId, eventData) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('events')
        .update({
          name: eventData.name,
          date: eventData.date || null,
          end_date: eventData.endDate || null,
          time: eventData.time || null,
          location: eventData.location || null,
          description: eventData.description || null,
          image_url: eventData.imageUrl || null,
          ticket_url: eventData.ticketUrl || null,
          status: eventData.status,
          public_visible: eventData.publicVisible,
          is_double_vote_day: eventData.isDoubleVoteDay,
        })
        .eq('id', eventId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating event:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const deleteEvent = useCallback(async (eventId) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error deleting event:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  // ============================================================================
  // DOUBLE VOTE DAY OPERATIONS
  // ============================================================================

  const addDoubleDay = useCallback(async (date) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };
    if (!date) return { success: false, error: 'Date is required' };

    try {
      const { error } = await supabase
        .from('competition_double_days')
        .insert({ competition_id: competitionId, date });

      if (error) {
        if (error.code === '23505') {
          return { success: false, error: 'That date is already scheduled.' };
        }
        throw error;
      }
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding double vote day:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const deleteDoubleDay = useCallback(async (id) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competition_double_days')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error deleting double vote day:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const updateCompetitionTimezone = useCallback(async (timezone) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };
    if (!timezone) return { success: false, error: 'Timezone is required' };

    try {
      const { error } = await supabase
        .from('competitions')
        .update({ timezone })
        .eq('id', competitionId);

      // The validate_competition_timezone trigger surfaces invalid IANA
      // zones with ERRCODE check_violation — turn that into a friendly msg.
      if (error) {
        if (error.code === '23514' || /Invalid IANA timezone/.test(error.message || '')) {
          return { success: false, error: 'That timezone is not recognized.' };
        }
        throw error;
      }
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating timezone:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const updateHiddenSetupSections = useCallback(async (sections) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competitions')
        .update({ hidden_setup_sections: Array.isArray(sections) ? sections : [] })
        .eq('id', competitionId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating hidden setup sections:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  // ============================================================================
  // ANNOUNCEMENT OPERATIONS
  // ============================================================================

  const addAnnouncement = useCallback(async (announcementData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('announcements')
        .insert({
          competition_id: competitionId,
          title: announcementData.title,
          content: announcementData.content,
          type: announcementData.type || 'announcement',
          pinned: announcementData.pinned ?? false,
          is_ai_generated: announcementData.isAiGenerated ?? false,
          published_at: new Date().toISOString(),
        });

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding announcement:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const updateAnnouncement = useCallback(async (announcementId, announcementData) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('announcements')
        .update({
          title: announcementData.title,
          content: announcementData.content,
          type: announcementData.type,
          pinned: announcementData.pinned,
        })
        .eq('id', announcementId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating announcement:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const deleteAnnouncement = useCallback(async (announcementId) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', announcementId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error deleting announcement:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const toggleAnnouncementPin = useCallback(async (announcementId, pinned) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('announcements')
        .update({ pinned: !pinned })
        .eq('id', announcementId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error toggling announcement pin:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  // ============================================================================
  // RULE OPERATIONS
  // ============================================================================

  const addRule = useCallback(async (ruleData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const maxSort = data.rules.length > 0 ? Math.max(...data.rules.map(r => r.sortOrder || 0)) : 0;
      const { error } = await supabase
        .from('competition_rules')
        .insert({
          competition_id: competitionId,
          section_title: ruleData.sectionTitle,
          section_content: ruleData.sectionContent,
          sort_order: maxSort + 1,
        });

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding rule:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, data.rules, fetchDashboardData]);

  const updateRule = useCallback(async (ruleId, ruleData) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competition_rules')
        .update({
          section_title: ruleData.sectionTitle,
          section_content: ruleData.sectionContent,
        })
        .eq('id', ruleId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating rule:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const deleteRule = useCallback(async (ruleId) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competition_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error deleting rule:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  // ============================================================================
  // PRIZE OPERATIONS
  // ============================================================================

  const addPrize = useCallback(async (prizeData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const maxSort = data.prizes.length > 0 ? Math.max(...data.prizes.map(p => p.sortOrder || 0)) : 0;
      const { error } = await supabase
        .from('competition_prizes')
        .insert({
          competition_id: competitionId,
          title: prizeData.title,
          description: prizeData.description || null,
          image_url: prizeData.imageUrl || null,
          value: prizeData.value || null,
          sponsor_name: prizeData.sponsorName || null,
          external_url: prizeData.externalUrl || null,
          prize_type: prizeData.prizeType || 'winner',
          sort_order: maxSort + 1,
        });

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding prize:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, data.prizes, fetchDashboardData]);

  const updatePrize = useCallback(async (prizeId, prizeData) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competition_prizes')
        .update({
          title: prizeData.title,
          description: prizeData.description || null,
          image_url: prizeData.imageUrl || null,
          value: prizeData.value || null,
          sponsor_name: prizeData.sponsorName || null,
          external_url: prizeData.externalUrl || null,
          prize_type: prizeData.prizeType || 'winner',
          updated_at: new Date().toISOString(),
        })
        .eq('id', prizeId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating prize:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  const deletePrize = useCallback(async (prizeId) => {
    if (!supabase) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competition_prizes')
        .delete()
        .eq('id', prizeId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error deleting prize:', err);
      return { success: false, error: err.message };
    }
  }, [fetchDashboardData]);

  // ============================================================================
  // COMPETITION TIMELINE OPERATIONS
  // ============================================================================

  const updateTimeline = useCallback(async (timelineData) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competitions')
        .update({
          nomination_start: timelineData.nominationStart,
          nomination_end: timelineData.nominationEnd,
          voting_start: timelineData.votingStart,
          voting_end: timelineData.votingEnd,
          finals_date: timelineData.finalsDate,
        })
        .eq('id', competitionId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating timeline:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  // ============================================================================
  // WINNERS OPERATIONS
  // ============================================================================

  const updateWinners = useCallback(async (winnerIds) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competitions')
        .update({ winners: winnerIds })
        .eq('id', competitionId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error updating winners:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  // ============================================================================
  // HOST OPERATIONS
  // ============================================================================

  const assignHost = useCallback(async (userId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase.rpc('assign_competition_host', {
        p_competition_id: competitionId,
        p_user_id: userId,
      });

      if (error) throw error;

      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error assigning host:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const removeHost = useCallback(async () => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase.rpc('remove_competition_host', {
        p_competition_id: competitionId,
      });

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error removing host:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const addCoHost = useCallback(async (userId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase.rpc('add_competition_co_host', {
        p_competition_id: competitionId,
        p_user_id: userId,
      });

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error adding co-host:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const removeCoHost = useCallback(async (userId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase.rpc('remove_competition_co_host', {
        p_competition_id: competitionId,
        p_user_id: userId,
      });

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error removing co-host:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  const removeSubscriber = useCallback(async (userId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { error } = await supabase
        .from('competition_subscribers')
        .delete()
        .eq('competition_id', competitionId)
        .eq('user_id', userId);

      if (error) throw error;
      await fetchDashboardData();
      return { success: true };
    } catch (err) {
      console.error('Error removing subscriber:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  // ============================================================================
  // NOMINEE ACCOUNT REPAIR OPERATIONS
  // ============================================================================

  /**
   * Repair a single nominee's account (create auth user if missing, sync profile data)
   * Uses the repair-nominee-accounts edge function (admin API, bypasses RLS)
   */
  const repairNomineeAccount = useCallback(async (nomineeId) => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('repair-nominee-accounts', {
        body: { competition_id: competitionId, nominee_id: nomineeId },
      });

      if (fnError) throw fnError;

      await fetchDashboardData();
      return { success: true, data: result };
    } catch (err) {
      console.error('Error repairing nominee account:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  /**
   * Repair all nominee accounts for this competition
   */
  const repairAllNomineeAccounts = useCallback(async () => {
    if (!supabase || !competitionId) return { success: false, error: 'Missing configuration' };

    try {
      const { data: result, error: fnError } = await supabase.functions.invoke('repair-nominee-accounts', {
        body: { competition_id: competitionId },
      });

      if (fnError) throw fnError;

      await fetchDashboardData();
      return { success: true, data: result };
    } catch (err) {
      console.error('Error repairing all nominee accounts:', err);
      return { success: false, error: err.message };
    }
  }, [competitionId, fetchDashboardData]);

  return {
    data,
    loading,
    error,
    refresh,
    // Nominee operations
    addNominee,
    approveNominee,
    rejectNominee,
    removeContestant,
    unconvertContestant,
    restoreNominee,
    resendInvite,
    sendHostBroadcast,
    getHostBroadcastStatus,
    repairNomineeAccount,
    repairAllNomineeAccounts,
    // Contestant operations
    addContestant,
    // Judge operations
    addJudge,
    updateJudge,
    deleteJudge,
    sendJudgeInvite,
    // Judging criteria
    addCriterion,
    updateCriterion,
    deleteCriterion,
    // Charity operations
    updateCharity,
    removeCharity,
    // Sponsor operations
    addSponsor,
    updateSponsor,
    deleteSponsor,
    // Event operations
    addEvent,
    updateEvent,
    deleteEvent,
    // Double vote day operations
    addDoubleDay,
    deleteDoubleDay,
    updateCompetitionTimezone,
    updateHiddenSetupSections,
    // Announcement operations
    addAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    toggleAnnouncementPin,
    // Rule operations
    addRule,
    updateRule,
    deleteRule,
    // Prize operations
    addPrize,
    updatePrize,
    deletePrize,
    // Competition operations
    updateTimeline,
    updateWinners,
    assignHost,
    removeHost,
    addCoHost,
    removeCoHost,
    removeSubscriber,
  };
}

export default useCompetitionDashboard;
