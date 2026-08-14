/**
 * Auto-generated competition rules.
 *
 * Rules used to be free-text sections a host typed in by hand. They're now
 * derived automatically from the competition's own configuration, so the public
 * page always states the *actual* mechanics (selection process, eligibility,
 * entry, voting, charity) and can never drift from how the competition is set
 * up. Pure function — used by both the host dashboard preview (Site tab) and
 * the public competition page, so the two always match.
 *
 * Tolerant of both the dashboard's camelCase competition object and the public
 * page's raw snake_case row, so a single generator serves both.
 *
 * Returns an array of `{ title, content }` sections. Sections with nothing
 * meaningful to say are omitted.
 */

const GENDER = {
  all: 'all genders',
  female: 'women',
  male: 'men',
  'LGBTQ+': 'LGBTQ+ individuals',
};

// Read a field that may be camelCase (dashboard) or snake_case (public row).
const pick = (c, camel, snake, fallback = undefined) => {
  if (c[camel] !== undefined && c[camel] !== null) return c[camel];
  if (c[snake] !== undefined && c[snake] !== null) return c[snake];
  return fallback;
};

export function buildAutoRules(competition) {
  const c = competition;
  if (!c) return [];
  const sections = [];

  const selectionCriteria = pick(c, 'selectionCriteria', 'selection_criteria', 'votes');
  const numberOfWinners = pick(c, 'numberOfWinners', 'number_of_winners', 1) || 1;
  const splitByGender = !!pick(c, 'winnersSplitByGender', 'winners_split_by_gender', false);
  const eligibilityGender = pick(c, 'eligibilityGender', 'eligibility_gender', 'all');
  const territoryScope = pick(c, 'territoryScope', 'territory_scope', 'city');
  const territoryState = pick(c, 'territoryState', 'territory_state', null);
  const radiusMiles = pick(c, 'eligibilityRadiusMiles', 'eligibility_radius_miles', null);
  const ageMin = pick(c, 'eligibilityAgeMin', 'eligibility_age_min', 18) || 18;
  const ageMax = pick(c, 'eligibilityAgeMax', 'eligibility_age_max', null);
  const entryType = pick(c, 'entryType', 'entry_type', 'nominations');
  const charityPct = pick(c, 'charityPercentage', 'charity_percentage', null);
  const charityName = pick(c, 'charityName', 'charity_name', null);
  const cityVal = c.city;
  const cityName = typeof cityVal === 'object' ? cityVal?.name : cityVal;
  const cityObj = cityVal && typeof cityVal === 'object' ? cityVal : pick(c, 'cityData', 'city_data', null);
  const isCanadianCompetition = (cityObj && typeof cityObj === 'object' ? cityObj.state : null) === 'ON';
  const rounds = pick(c, 'voting_rounds', 'votingRounds', []) || [];
  const criteria = pick(c, 'judging_criteria', 'judgingCriteria', []) || [];

  // ── How winners are chosen ──────────────────────────────────────────────
  const judgingRound = [...rounds]
    .filter((r) => (r.judge_weight || 0) > 0)
    .sort((a, b) => (a.round_order || 0) - (b.round_order || 0))[0];

  // A competition can be configured selection_criteria='votes' yet still run a
  // judged round (judge_weight > 0). Detect judging from the actual round data
  // so the summary never omits it just because the enum says "votes".
  let selection;
  if (selectionCriteria === 'judges') {
    selection = 'Winners are selected by a panel of judges, who score each contestant against the published judging criteria.';
  } else if (selectionCriteria === 'hybrid' || judgingRound) {
    selection = "Winners are determined through a combination of public votes and judges' scores.";
    if (judgingRound) {
      const w = judgingRound.judge_weight || 0;
      const label = (judgingRound.title && judgingRound.title.trim())
        || (judgingRound.round_order ? `round ${judgingRound.round_order}` : 'the judging round');
      selection += ` Judging takes place in ${label}, where judges' scores count for ${w}% and public votes for ${100 - w}% of that round's result.`;
      const catTxt = criteria.length
        ? `${criteria.length} categor${criteria.length === 1 ? 'y' : 'ies'}`
        : 'several categories';
      selection += ` Judges score each finalist from 1 to 10 across ${catTxt}; those totals and public votes are ${splitByGender ? 'compared within each gender' : 'compared across the field'} to decide the winners.`;
    }
  } else {
    selection = 'Winners are determined by public vote — the contestants with the most votes advance through each round and ultimately win.';
  }

  let winnersLine = ` This competition crowns ${numberOfWinners === 1 ? 'one winner' : `${numberOfWinners} winners`}.`;
  if (splitByGender) winnersLine += ' Winners are chosen separately for men and women.';
  sections.push({ title: 'How winners are chosen', content: selection + winnersLine });

  // ── Who can enter ───────────────────────────────────────────────────────
  const genderTxt = GENDER[eligibilityGender] || 'all genders';
  let where;
  if (territoryScope === 'us') {
    where = 'across the United States';
  } else if (territoryScope === 'state') {
    where = `in ${territoryState || 'the host state'}`;
  } else {
    where = `in and around ${cityName || 'the host city'}${radiusMiles ? ` (within ${radiusMiles} miles)` : ''}`;
  }
  const effectiveAgeMin = isCanadianCompetition ? Math.max(ageMin, 19) : ageMin;
  let eligibility = `Entry is open to ${genderTxt} ${where}. Entrants and voters must be at least ${effectiveAgeMin} (or the age of majority in their province/state, whichever is greater) and legal residents of ${isCanadianCompetition ? 'the United States or the province of Ontario, Canada' : 'the United States'}`;
  eligibility += ageMax ? `, and no older than ${ageMax}.` : '.';
  eligibility += ' Void where prohibited.';
  sections.push({ title: 'Who can enter', content: eligibility });

  // ── How to enter ────────────────────────────────────────────────────────
  let entry;
  if (entryType === 'host_upload') {
    entry = 'Contestants are selected by the Host: the Host assembles the field directly, and there is no public nomination or application period.';
  } else if (entryType === 'applications') {
    entry = 'Entry is by application: eligible people apply directly to take part.';
  } else {
    entry = 'Entry is by nomination: anyone can nominate an eligible person, and prospective contestants can also nominate themselves. Nominees confirm and complete a profile to join the competition.';
  }
  // NOTE: hard-coded free entry. Pure-judge competitions will charge a
  // contestant entry fee (paid on acceptance) once that ships — make this
  // conditional then. See the FUTURE COMPETITION STYLES note in
  // `src/lib/officialRules.js` and issue #531 (lottery analysis must be redone).
  entry += ' There is no cost to enter.';
  sections.push({ title: 'How to enter', content: entry });

  // ── Voting (only when the public actually votes) ────────────────────────
  if (selectionCriteria !== 'judges') {
    sections.push({
      title: 'Voting',
      content: `Anyone eligible can vote on the public competition page. No purchase is necessary — every registered voter gets a free vote each day, renewing on a rolling basis (your next free vote becomes available no later than 24 hours after your previous one, not at local midnight); additional votes may be purchased to show extra support, but buying votes wins the purchaser nothing. Voting opens and closes on the dates shown on the competition timeline.${
        rounds.some((r) => r && (r.votes_reset_at_start ?? r.votesResetAtStart))
          ? ' This Competition is run in rounds. When a round starts fresh, the contestants who advance begin it with zero votes — the free and paid votes from earlier rounds do not carry over. Only bonus-task votes and votes added by the Host carry forward. Each vote counts toward the round it was cast in, and vote purchases are final and non-refundable even when the count resets for the next round.'
          : ''
      }${
        isCanadianCompetition ? ' Canadian winners must correctly answer a skill-testing question before receiving a prize.' : ''
      }`,
    });
  }

  // ── Charity (when the competition has a charity partner) ─────────────────
  if (charityName || charityPct) {
    const toWhom = charityName || 'the designated charity partner';
    const share = charityPct
      ? `${charityPct}% of the host's net proceeds from purchased votes (after EliteRank's fees)`
      : "a portion of the host's net proceeds from purchased votes (after EliteRank's fees)";
    sections.push({
      title: 'Charity',
      content: `The host will donate ${share} to ${toWhom}. Vote purchases are not tax-deductible for voters.`,
    });
  }

  sections.push({
    title: 'Full Official Rules',
    content: 'This is a summary. The complete Official Rules — including prizes and approximate retail value, eligibility, judging, governing law, taxes, and how to request the winners list — are published on the competition’s Official Rules page.',
  });

  return sections;
}
