/**
 * Auto-numbering for voting-round *titles* in the host schedule editor.
 *
 * The Voting Rounds editor stores a per-round `title` ("Voting Round 1",
 * "Voting Round 2", …). When a host inserts a round out of sequence (the
 * "Add Voting" button drops a new round *before* a judged final round),
 * removes one, or the judging round gets shuffled, those numbers drift out of
 * order — e.g. "Voting Round 4" landing ahead of "Voting Round 3". This
 * renumbers the placeholder titles so they always read 1, 2, 3… in schedule
 * order.
 *
 * Only *generic* placeholder titles are renumbered — "Voting Round 2",
 * "Round 3", or a blank. A host-typed name ("Opening Round", "Semifinals") is
 * preserved. Non-voting rounds (judging / finale / resurrection) are left
 * untouched and don't consume a number, so the voting rounds still count
 * 1, 2, 3 regardless of any special round sitting among them.
 */

// "Voting Round 2", "Round 3", "Voting Round", "Round" — positional placeholders,
// not a host-chosen name.
const GENERIC_VOTING_TITLE = /^(voting\s+)?round(\s+\d+)?$/i;

/**
 * Renumber generic voting-round titles to match schedule (array) order.
 *
 * @param {Array} rounds - voting_rounds in schedule order.
 * @returns {Array} the same rounds; rows whose title changes are shallow-cloned,
 *   untouched rows are returned by identity so React memoisation still holds.
 */
export function renumberVotingTitles(rounds) {
  let n = 0;
  return (rounds || []).map((round) => {
    if (!round || (round.round_type || 'voting') !== 'voting') return round;
    n += 1;
    const current = (round.title || '').trim();
    const isGeneric = current === '' || GENERIC_VOTING_TITLE.test(current);
    if (!isGeneric) return round;
    const nextTitle = `Voting Round ${n}`;
    return round.title === nextTitle ? round : { ...round, title: nextTitle };
  });
}

export default renumberVotingTitles;
