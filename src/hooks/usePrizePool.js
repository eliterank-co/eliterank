import { useState, useEffect, useMemo } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  calculatePrizePool,
  calculateVoteRevenue,
  getPrizePosition,
} from '../utils/calculatePrizePool';

/**
 * Hook for prize pool calculations with real-time updates
 *
 * @param {string} competitionId - Competition UUID
 * @param {number} prizePoolMinimum - Host's minimum contribution
 * @param {boolean} isVotingPhase - Whether to enable real-time updates
 * @returns {object} Prize pool data and helpers
 */
export function usePrizePool(
  competitionId,
  prizePoolMinimum = 1000,
  isVotingPhase = false
) {
  const [voteRevenue, setVoteRevenue] = useState(0);
  const [loading, setLoading] = useState(true);

  const isDemoMode = !isSupabaseConfigured();

  // Fetch initial vote revenue
  useEffect(() => {
    if (!competitionId || isDemoMode) {
      setLoading(false);
      return;
    }

    const fetchVoteRevenue = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('votes')
        .select('amount_paid, tax_amount')
        .eq('competition_id', competitionId);

      if (!error && data) {
        const revenue = calculateVoteRevenue(data);
        setVoteRevenue(revenue);
      }

      setLoading(false);
    };

    fetchVoteRevenue();
  }, [competitionId, isDemoMode]);

  // Real-time subscription during voting
  useEffect(() => {
    if (!competitionId || !isVotingPhase || isDemoMode) return;

    const subscription = supabase
      .channel(`prize-pool-${competitionId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'votes',
          filter: `competition_id=eq.${competitionId}`,
        },
        (payload) => {
          // Exclude collected tax (e.g. HST) from the prize base — it's a
          // pass-through remittance, not vote revenue.
          const paid = Number(payload.new.amount_paid) || 0;
          const tax = Number(payload.new.tax_amount) || 0;
          const newAmount = (paid - tax) * 0.5;
          setVoteRevenue((prev) => prev + newAmount);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [competitionId, isVotingPhase, isDemoMode]);

  // Calculate prize pool
  const prizePool = useMemo(() => {
    return calculatePrizePool(prizePoolMinimum, voteRevenue);
  }, [prizePoolMinimum, voteRevenue]);

  // Helper to get prize for specific rank
  const getPrize = (rank) => {
    return getPrizePosition(rank, prizePool);
  };

  // Prize tiers for display (winner takes all)
  const prizeTiers = useMemo(() => {
    return [
      {
        rank: 1,
        label: '1st Place',
        amount: prizePool.firstPrize,
        formatted: prizePool.formatted.firstPrize,
        colorClass: 'prize-gold',
        iconName: 'crown',
      },
    ];
  }, [prizePool]);

  return {
    ...prizePool,
    prizeTiers,
    getPrize,
    loading,
  };
}

export default usePrizePool;
