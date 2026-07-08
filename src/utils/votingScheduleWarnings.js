/**
 * Detect a voting schedule that ignores the host's nomination window.
 *
 * Voting can't meaningfully open until nominations close — otherwise you're
 * voting on a field that's still being nominated. Voting rounds are pre-filled
 * from a planned-launch estimate when the competition is created, and they do
 * NOT recompute when the host later sets (or edits) their real nomination
 * window. So the rounds can end up sitting before — sometimes months before —
 * nominations even open. This detects that mismatch so the schedule editor can
 * nudge the host to re-run "Auto-fill recommended", which rebuilds the rounds
 * from the current nomination close date.
 *
 * @param {Array} votingRounds - rounds ({ round_type, start_date }).
 * @param {string|Date|null} nominationCloseIso - when nominations close.
 * @returns {{ earliestStartIso: string, nominationCloseIso: string } | null}
 *   the offending earliest voting start + the close it precedes, or null when
 *   there is no issue (or not enough data to tell).
 */
export function getVotingBeforeNominationsWarning(votingRounds, nominationCloseIso) {
  if (!nominationCloseIso) return null;
  const close = new Date(nominationCloseIso);
  if (Number.isNaN(close.getTime())) return null;

  const starts = (votingRounds || [])
    .filter((r) => r && (r.round_type || 'voting') === 'voting' && r.start_date)
    .map((r) => new Date(r.start_date))
    .filter((d) => !Number.isNaN(d.getTime()));
  if (!starts.length) return null;

  const earliestMs = Math.min(...starts.map((d) => d.getTime()));
  if (earliestMs >= close.getTime()) return null;

  return {
    earliestStartIso: new Date(earliestMs).toISOString(),
    nominationCloseIso: close.toISOString(),
  };
}

export default getVotingBeforeNominationsWarning;
