import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { sortContestantsByStanding } from '../utils/contestantRanking';
import { buildRoundLabels } from '../utils/roundLabels';

/**
 * usePerformanceDashboard
 *
 * Builds the contestant-facing "performance" view: for every competition the
 * user entered (any status except removed), it returns their lifetime vote
 * total broken down into free / paid / bonus, how far they advanced (named
 * rounds, e.g. "Entry Round" / "Top 50" / "Finale"), and the roster of
 * contestants they competed against.
 *
 * Vote breakdown comes straight from the never-reset lifetime_* counters on
 * `contestants` (migration 054), so the numbers reflect the whole competition
 * rather than just the current round.
 *
 * Returns an array, one entry per competition, shaped:
 *   {
 *     competitionId, competitionName, citySeason, orgName, orgLogo,
 *     orgSlug, competitionSlug, competitionStatus,
 *     myContestantId, myStatus, placement, fieldSize,
 *     roundsReached, totalRounds, rounds: [{ order, label }],
 *     totalVotes, freeVotes, paidVotes, bonusVotes,
 *     competitors: [
 *       { id, name, avatarUrl, city, status, votes }
 *     ]
 *   }
 */

export function usePerformanceDashboard(userId) {
  const [competitions, setCompetitions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!userId || !isSupabaseConfigured()) {
      setCompetitions([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // 1. The user's own contestant rows, with the lifetime vote breakdown
      //    and enough competition metadata to render a header per card.
      const { data: myRows, error: myErr } = await supabase
        .from('contestants')
        .select(`
          id,
          competition_id,
          status,
          eliminated_in_round,
          current_round,
          lifetime_votes,
          lifetime_free_votes,
          lifetime_paid_votes,
          lifetime_bonus_votes,
          gender,
          competition:competitions(
            id,
            name,
            slug,
            season,
            status,
            winners_split_by_gender,
            city:cities(name),
            organization:organizations(name, slug, logo_url, header_logo_url)
          )
        `)
        .eq('user_id', userId)
        .neq('status', 'removed');

      if (myErr) throw myErr;

      const entries = (myRows || []).filter((r) => r.competition);
      if (entries.length === 0) {
        setCompetitions([]);
        return;
      }

      const competitionIds = entries.map((r) => r.competition_id);

      // 2. Every contestant in those competitions (the user included). One
      //    round trip covers all the cards. Mirrors useLeaderboard's name /
      //    avatar fallbacks so the roster matches the public leaderboard.
      const { data: allContestants, error: rosterErr } = await supabase
        .from('contestants')
        .select(`
          id,
          user_id,
          competition_id,
          name,
          avatar_url,
          city,
          status,
          votes,
          lifetime_votes,
          eliminated_in_round,
          gender,
          profile:profiles!user_id(avatar_url, first_name, last_name)
        `)
        .in('competition_id', competitionIds)
        .neq('status', 'removed');

      if (rosterErr) throw rosterErr;

      const roster = allContestants || [];

      // 3. The competition's rounds, so we can show how far the contestant
      //    advanced by name ("Entry Round" → "Top 50" → "Finale"). All
      //    voting_rounds rows are real rounds (the finale included); nomination
      //    periods live in a separate table and aren't pulled here.
      const { data: rounds } = await supabase
        .from('voting_rounds')
        .select('competition_id, round_order, round_type, title, tier_label, contestants_advance')
        .in('competition_id', competitionIds);

      const roundLabelsByCompetition = new Map();
      const groupedRounds = new Map();
      (rounds || []).forEach((r) => {
        const list = groupedRounds.get(r.competition_id) || [];
        list.push(r);
        groupedRounds.set(r.competition_id, list);
      });
      groupedRounds.forEach((list, compId) => {
        const ordered = [...list].sort((a, b) => (a.round_order || 0) - (b.round_order || 0));
        roundLabelsByCompetition.set(compId, buildRoundLabels(ordered));
      });

      // Group the roster by competition for quick lookup.
      const rosterByCompetition = new Map();
      roster.forEach((c) => {
        const list = rosterByCompetition.get(c.competition_id) || [];
        list.push(c);
        rosterByCompetition.set(c.competition_id, list);
      });

      const resolveName = (c) => {
        const profileName = `${c.profile?.first_name || ''} ${c.profile?.last_name || ''}`.trim();
        return profileName || c.name || 'Contestant';
      };

      const shaped = entries.map((mine) => {
        const comp = mine.competition;
        const field = rosterByCompetition.get(mine.competition_id) || [];

        // Placement uses the same standing order as the leaderboards: still-in
        // contestants rank above eliminated ones (who keep their old round's
        // votes), eliminated are ordered by how far they got, and ties break on
        // current-round votes. So a finished competition's winner lands at #1,
        // not an earlier-eliminated contestant with more lifetime votes.
        const myVotes = mine.lifetime_votes ?? 0;
        // When the competition splits winners by gender, placement and the
        // competitor list are scoped to the contestant's own gender — the
        // pool they actually advance and win within (see finalize_voting_round
        // and the public leaderboard).
        const splitByGender = !!comp.winners_split_by_gender;
        const genderField = splitByGender
          ? field.filter((c) => c.gender === mine.gender)
          : field;
        const orderedField = sortContestantsByStanding(genderField);
        const placementIdx = orderedField.findIndex((c) => c.id === mine.id);
        const placement = placementIdx >= 0 ? placementIdx + 1 : 1;

        const competitors = genderField
          .filter((c) => c.id !== mine.id)
          .map((c) => ({
            id: c.id,
            userId: c.user_id || null,
            name: resolveName(c),
            avatarUrl: c.avatar_url || c.profile?.avatar_url || null,
            city: c.city || null,
            status: c.status,
            votes: c.lifetime_votes ?? 0,
          }))
          .sort((a, b) => b.votes - a.votes);

        const city = comp.city?.name || '';
        const citySeason = [city, comp.season].filter(Boolean).join(' · ');

        // How far they advanced. Winners ran the whole gauntlet; eliminated
        // contestants reached the round they went out in; everyone still in
        // is measured by their current round. Falls back to round 1.
        const roundLabels = roundLabelsByCompetition.get(mine.competition_id) || [];
        const totalRounds = roundLabels.length;
        const lastOrder = roundLabels.length
          ? roundLabels[roundLabels.length - 1].order
          : 1;
        const roundsReached = mine.status === 'winner'
          ? lastOrder
          : (mine.eliminated_in_round || mine.current_round || roundLabels[0]?.order || 1);

        return {
          competitionId: mine.competition_id,
          competitionName: comp.name || 'Competition',
          citySeason,
          orgName: comp.organization?.name || null,
          orgLogo: comp.organization?.logo_url || null,
          orgSlug: comp.organization?.slug || null,
          competitionSlug: comp.slug || null,
          competitionStatus: comp.status,
          myContestantId: mine.id,
          myStatus: mine.status,
          placement,
          fieldSize: field.length,
          roundsReached,
          totalRounds,
          rounds: roundLabels,
          totalVotes: myVotes,
          freeVotes: mine.lifetime_free_votes ?? 0,
          paidVotes: mine.lifetime_paid_votes ?? 0,
          bonusVotes: mine.lifetime_bonus_votes ?? 0,
          competitors,
        };
      });

      // Highest-vote competitions first so the most active entry leads.
      shaped.sort((a, b) => b.totalVotes - a.totalVotes);
      setCompetitions(shaped);
    } catch (err) {
      console.error('usePerformanceDashboard fetch failed:', err);
      setCompetitions([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { competitions, loading, refetch: fetchData };
}

export default usePerformanceDashboard;
