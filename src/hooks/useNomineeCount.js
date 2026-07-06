import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Count of nominations submitted for a competition.
 *
 * Counts rows in the `nominees` table — every nomination submitted,
 * regardless of status (pending, approved, declined, expired). This is the
 * raw nomination volume, which is DISTINCT from the `contestants` roster:
 * a nominee only becomes a contestant once they accept and complete their
 * entry, so `contestants.length` undercounts nominees who haven't converted.
 *
 * Uses a head-only exact count so no nominee PII (name/email/phone) is ever
 * pulled to the client — only the number crosses the wire.
 *
 * @param {string} competitionId - Competition UUID
 * @returns {{ count: number, loading: boolean }}
 */
export function useNomineeCount(competitionId) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!competitionId || !isSupabaseConfigured()) {
      setCount(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const { count: n, error } = await supabase
        .from('nominees')
        .select('id', { count: 'exact', head: true })
        .eq('competition_id', competitionId);

      if (cancelled) return;

      if (error) {
        console.error('Error counting nominees:', error);
        setCount(0);
      } else {
        setCount(n || 0);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [competitionId]);

  return { count, loading };
}

export default useNomineeCount;
