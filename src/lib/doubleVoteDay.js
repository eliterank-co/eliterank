import { supabase } from './supabase';

export async function getVoteMultiplierForCompetition(competitionId) {
  if (!supabase || !competitionId) return { multiplier: 1, error: 'Database not configured' };

  // Single source of truth: the is_double_vote_day Postgres function uses
  // the competition's stored timezone, so a host in LA picking April 28
  // gets activation across the LA calendar day, not UTC's. See
  // supabase/migrations/051_competition_timezone_and_helpers.sql.
  const { data, error } = await supabase.rpc('effective_vote_multiplier', {
    p_competition_id: competitionId,
  });

  if (error) {
    console.warn('Error resolving vote multiplier:', error.message);
    return { multiplier: null, error: 'Vote boost status is temporarily unavailable' };
  }
  return { multiplier: Number.isInteger(data) && data >= 1 ? data : null, error: null };
}

export async function isDoubleVoteDayForCompetition(competitionId) {
  if (!supabase || !competitionId) return false;

  const { data, error } = await supabase.rpc('is_double_vote_day', {
    p_competition_id: competitionId,
  });
  if (error) {
    console.warn('Error checking double vote day:', error.message);
    return false;
  }
  return data === true;
}

export async function listDoubleVoteDays(competitionId) {
  if (!supabase || !competitionId) return [];

  const { data, error } = await supabase
    .from('competition_double_days')
    .select('id, date')
    .eq('competition_id', competitionId)
    .order('date', { ascending: true });

  if (error) {
    console.warn('Error loading double vote days:', error.message);
    return [];
  }
  return data || [];
}
