/**
 * Auto-generated, per-competition Official Rules.
 *
 * Where `competitionRules.buildAutoRules` produces the short at-a-glance
 * accordion (a handful of blurbs), this builds the *complete* Official Rules
 * document for a single competition — the long-form page a host can point
 * entrants, voters, and sponsors at (cf. a magazine cover competition's
 * `/rules` page).
 *
 * Everything here is derived from the competition's own configuration, so the
 * document always states the *actual* operator, eligibility, schedule, scoring,
 * judging, prizes, and charity for that competition and can never drift from
 * how it is set up. Boilerplate that is identical across every competition
 * references the platform-wide Contest Terms, Terms of Use, and Privacy Policy
 * rather than being duplicated here.
 *
 * Framing note: EliteRank competitions are structured as a **contest of skill**,
 * not a sweepstakes. This generator deliberately avoids sweepstakes / AMOE
 * language and instead emphasizes that entry is free and that paid votes only
 * add voting capacity — the load-bearing facts for that posture. If a
 * voter-drawing feature is ever added, this framing must be revisited.
 *
 * Tolerant of both the dashboard's camelCase competition object and the public
 * page's raw snake_case row, so a single generator serves both.
 *
 * Returns `{ sections: [{ id, title, blocks }] }`, where each block is one of:
 *   { kind: 'p', text }            — a paragraph
 *   { kind: 'callout', text }      — an emphasized callout box
 *   { kind: 'ul', items: [] }      — a bullet list
 *   { kind: 'policyLinks' }        — renders the standard related-policy links
 *   { kind: 'contact' }            — renders the operator contact box
 *
 * Section numbers are assigned from array order at the end, so inserting or
 * omitting a conditional section (judging, voting, charity) can never desync
 * the numbering.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * FUTURE COMPETITION STYLES — rules work pending (noted, not yet built):
 *
 * 1. PURE-JUDGE competitions with a CONTESTANT ENTRY FEE (paid on acceptance).
 *    Decided product direction: purely judge-based competitions will charge an
 *    entry fee, paid by the contestant when their entry is accepted. NOT built
 *    yet (no entry_fee field; `create-payment-intent` is vote-only). When it
 *    ships, the "no cost to enter" assertions in THIS file (see the "How to
 *    Enter" and "Free to Enter; Paid Votes Optional" sections below) become FALSE for those
 *    competitions and must be made conditional on the fee — the rules must
 *    state the entry fee, when it is charged (on acceptance), and that it is
 *    non-refundable / refundable per policy. The same hard-coded "no cost to
 *    enter" line lives in `competitionRules.buildAutoRules`.
 *      ⚠️ Lottery analysis (issue #531) MUST be redone first: a contestant
 *      entry fee introduces "consideration." Pure-judge = judges' weight 100%,
 *      which lands in the SAFE "skill-dominant contest of skill" quadrant of
 *      #531's matrix (paid entry + judges ≥ 50%), but it must be gated so a
 *      paid-entry competition can never launch with judges' weight < 50%, and
 *      the contest-of-skill framing in ContestTermsPage must be reconciled.
 *
 * 2. PURE VOTE-BASED competitions (selection_criteria === 'votes', no judging).
 *    A first-class, supported style: winners decided entirely by public vote —
 *    the model magazine "cover" competitions use (e.g. Inked). The `else`
 *    branch of "How Winners Are Chosen" plus the Voting section ARE the rules
 *    for this style; keep them accurate so the document is correct for every
 *    pure-vote competition.
 * ───────────────────────────────────────────────────────────────────────────
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

// Format a timestamp as "February 12, 2026". Returns null for missing/invalid.
function formatDate(value) {
  if (!value) return null;
  // Bare YYYY-MM-DD (e.g. a DATE column like double-vote days): parse as local
  // midnight so the calendar day doesn't shift in negative-offset timezones.
  const v = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// "February 1 – February 12, 2026", collapsing where only one bound exists.
function formatDateRange(start, end) {
  const s = formatDate(start);
  const e = formatDate(end);
  if (s && e) return `${s} – ${e}`;
  if (s) return `Opens ${s}`;
  if (e) return `Closes ${e}`;
  return null;
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// Vote prices are often sub-dollar, so they need cents — formatMoney would
// round $0.40 to "$0". Keep two decimals.
function formatVotePrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `$${n.toFixed(2)}`;
}

function roundLabel(r, fallbackIndex) {
  return (
    (r.title && r.title.trim()) ||
    (r.round_order ? `Round ${r.round_order}` : `Round ${fallbackIndex + 1}`)
  );
}

export function buildOfficialRules(competition, context = {}) {
  const c = competition;
  if (!c) return { sections: [] };

  const {
    organization = null,
    host = null,
    prizes = [],
    prizePool = null,
    judges = [],
    judgingCriteria = [],
    bonusTasks = [],
    doubleVoteDays = [],
    votingRounds: ctxRounds = null,
    nominationPeriods = null,
  } = context;

  // ── Pull config (tolerant of camelCase / snake_case) ─────────────────────
  const name = pick(c, 'name', 'name', 'This Competition');
  // Prefer the registered legal entity name ("Acme Events LLC") for the Host
  // attribution in this legal document; fall back to the display/brand name.
  const orgLegal =
    organization?.legal_entity_name ||
    c.organization?.legal_entity_name ||
    pick(c, 'legalEntityName', 'legal_entity_name', null);
  const orgDisplay =
    organization?.name ||
    c.organization?.name ||
    pick(c, 'organizationName', 'organization_name', null);
  const orgName = orgLegal || orgDisplay;
  // Host contact details for the Contact section — the organizer's own email and
  // registered address, so the rules point to a real contact rather than a
  // non-existent on-platform message channel.
  const orgEmail =
    organization?.contact_email ||
    c.organization?.contact_email ||
    pick(c, 'contactEmail', 'contact_email', null);
  const orgAddress =
    organization?.legal_address ||
    c.organization?.legal_address ||
    pick(c, 'legalAddress', 'legal_address', null);
  const hostFirst = host?.first_name || c.host?.first_name || null;
  const hostLast = host?.last_name || c.host?.last_name || null;
  const hostPersonName = [hostFirst, hostLast].filter(Boolean).join(' ') || null;
  const hostName = orgName || hostPersonName || 'the Host';

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
  const pricePerVote = pick(c, 'pricePerVote', 'price_per_vote', null);
  const cityVal = c.city;
  const cityName = typeof cityVal === 'object' ? cityVal?.name : cityVal;
  // Geography-driven country detection. The competition's anchor city carries a
  // province/state code; Ontario ('ON') is the only Canadian geography currently
  // supported (Toronto). A Canadian competition must open eligibility to Ontario
  // residents and carry the mandatory Canadian skill-testing question, so the
  // rules follow the geography rather than assuming US-only. (The dashboard
  // passes the city as a name string plus a `cityData` object; the public row
  // passes the joined city object directly — handle both.)
  const cityObj =
    cityVal && typeof cityVal === 'object' ? cityVal : pick(c, 'cityData', 'city_data', null);
  const cityProvince = cityObj && typeof cityObj === 'object' ? cityObj.state || null : null;
  const isCanadianCompetition = cityProvince === 'ON';

  const rounds =
    (ctxRounds && ctxRounds.length ? ctxRounds : pick(c, 'voting_rounds', 'votingRounds', [])) || [];
  const periods =
    (nominationPeriods && nominationPeriods.length
      ? nominationPeriods
      : pick(c, 'nomination_periods', 'nominationPeriods', [])) || [];
  const criteria =
    (judgingCriteria && judgingCriteria.length
      ? judgingCriteria
      : pick(c, 'judging_criteria', 'judgingCriteria', [])) || [];
  const nominationStart = pick(c, 'nominationStart', 'nomination_start', null);
  const nominationEnd = pick(c, 'nominationEnd', 'nomination_end', null);
  const finalsDate = pick(c, 'finalsDate', 'finals_date', null);

  // ── Judging detection (drive off the ACTUAL data, not just the enum) ─────
  // A competition can be configured selection_criteria='votes' yet still run a
  // judged round (judge_weight > 0) with criteria and a judge panel. Detect
  // judging from the rounds/criteria so the document never silently omits it.
  const sortedRounds = [...rounds].sort((a, b) => (a.round_order || 0) - (b.round_order || 0));
  const judgingRounds = sortedRounds.filter((r) => (r.judge_weight || 0) > 0);
  const isJudgesOnly = selectionCriteria === 'judges';
  const hasJudging = isJudgesOnly || judgingRounds.length > 0 || criteria.length > 0;
  const isBlended = !isJudgesOnly && judgingRounds.length > 0;
  // Public votes count somewhere unless the competition is pure judging.
  const publicVotes = !isJudgesOnly;

  // ── Entry-method phrasing ────────────────────────────────────────────────
  // Every reference to how someone becomes a contestant must match how the Host
  // configured the Competition (same three cases as "How to Enter" below):
  //   • host_upload  — the Host assembles the field directly; there is NO public
  //                    nomination or application step, so never say "nominate".
  //   • applications — people apply directly; say "apply" instead of "nominate".
  //   • nominations  — (default) people are nominated / self-nominate.
  const isHostUpload = entryType === 'host_upload';
  const isApplications = entryType === 'applications';
  // Gerund for the pre-contestant step, used only when a public one exists.
  const entryStepGerund = isApplications ? 'applying' : 'nominating';
  // "By {…}, entering, voting, or otherwise participating …" (Overview).
  const participationClause = [
    ...(isHostUpload ? [] : [entryStepGerund]),
    'entering',
    'voting',
    'or otherwise participating',
  ].join(', ');
  // "…before {…}, entering, or voting." (Eligibility).
  const confirmEligibilityClause = isHostUpload
    ? 'entering or voting'
    : `${entryStepGerund}, entering, or voting`;
  // "There is no cost to {…}." (Free to Enter).
  const noCostToEnter = isHostUpload
    ? 'There is no cost to enter as a contestant in the Competition.'
    : isApplications
      ? 'There is no cost to apply or to enter as a contestant in the Competition.'
      : 'There is no cost to be nominated or to enter as a contestant in the Competition.';
  // Entry-window kinds listed in the schedule fallback paragraph.
  const scheduleFallbackDates = isHostUpload
    ? 'voting and finals dates'
    : `${isApplications ? 'application' : 'nomination'}, voting, and finals dates`;

  const sections = [];

  // ── Overview ─────────────────────────────────────────────────────────────
  sections.push({
    id: 'overview',
    title: 'Overview',
    blocks: [
      {
        kind: 'p',
        text: `These are the Official Rules for ${name} (the "Competition"), presented by ${hostName} (the "Host") and administered on the EliteRank platform, operated by Most Eligible LLC ("EliteRank," "we," "us"). By ${participationClause} in the Competition, you agree to these Official Rules and to the platform-wide Contest Terms & Conditions, Terms of Use, and Privacy Policy.`,
      },
      {
        kind: 'p',
        text: `${hostName} is the organizer responsible for the Competition — including selecting winners and awarding prizes. EliteRank provides the competition platform and facilitates vote payments to the Host through Stripe; the Host is the seller and merchant of record for vote purchases. EliteRank is not the organizer of the Competition, and is not the seller or merchant of record, unless it is also named as the Host above.`,
      },
      {
        kind: 'callout',
        text: 'The Competition is a contest of skill. Winners are determined by the published criteria below — not by random drawing or chance.',
      },
      {
        kind: 'p',
        text: 'These Official Rules are generated from the Competition’s current configuration and reflect its actual format, eligibility, schedule, and prizes. Where they differ from the general platform terms, these Official Rules control for this Competition. The Host may update the Competition’s configuration; the version shown here always reflects the current setup.',
      },
    ],
  });

  // ── No Purchase Necessary ────────────────────────────────────────────────
  // NOTE: the "no cost to enter as a contestant" line below assumes free entry.
  // When the pure-judge entry fee ships (see header note + #531), this section
  // must reflect that contestants pay a fee on acceptance — while voters still
  // never pay to participate or win.
  sections.push({
    id: 'no-purchase',
    title: 'Free to Enter; Paid Votes Optional',
    blocks: [
      {
        kind: 'p',
        text: noCostToEnter,
      },
      publicVotes
        ? {
            kind: 'p',
            text: 'Where the Competition includes public voting, everyone receives free votes: every registered voter may cast at least one free vote each day, renewed every 24 hours — no purchase is ever necessary. Purchasing additional votes is entirely optional and is never required to enter, participate, or win. Purchasing votes increases voting capacity only — it is not an entry into any drawing and gives the purchaser no prize, reward, or chance of winning.',
          }
        : {
            kind: 'p',
            text: 'Winners of this Competition are selected by a panel of judges against the published criteria. No purchase of any kind affects the outcome.',
          },
    ],
  });

  // ── Eligibility ──────────────────────────────────────────────────────────
  const genderTxt = GENDER[eligibilityGender] || 'all genders';
  let where;
  if (territoryScope === 'us') {
    where = 'across the United States';
  } else if (territoryScope === 'state') {
    where = `in ${territoryState || 'the host state'}`;
  } else {
    where = `in and around ${cityName || 'the host city'}${radiusMiles ? ` (within ${radiusMiles} miles)` : ''}`;
  }
  // Floor the minimum age to the age of majority for a Canadian competition
  // (19 in Ontario) so the rules never publish a below-majority minimum, and
  // state the majority uplift explicitly.
  const effectiveAgeMin = isCanadianCompetition ? Math.max(ageMin, 19) : ageMin;
  let eligibilityIntro = `Entry is open to ${genderTxt} ${where}. All entrants and voters must be at least ${effectiveAgeMin} years old, or the age of majority in their province or state of residence (19 in Ontario), whichever is greater`;
  eligibilityIntro += ageMax ? `, and no older than ${ageMax}.` : ', at the time of entry.';
  sections.push({
    id: 'eligibility',
    title: 'Eligibility',
    blocks: [
      { kind: 'p', text: eligibilityIntro },
      {
        kind: 'ul',
        items: [
          isCanadianCompetition
            ? 'Entrants and voters must be legal residents of the United States or of the province of Ontario, Canada, and not residents of any jurisdiction where the Competition is prohibited by law.'
            : 'Entrants and voters must be legal residents of the United States and not residents of any jurisdiction where the Competition is prohibited by law.',
          'Employees, officers, directors, and contractors of the Host and the other Promotion Entities, and their immediate family and household members, are not eligible to win prizes.',
          `It is your responsibility to confirm your eligibility before ${confirmEligibilityClause}.`,
        ],
      },
    ],
  });

  // ── Skill-Testing Question (Canadian residents) ──────────────────────────
  // Required by Canadian law (Criminal Code + Competition Act) for prize
  // contests open to Canadian residents, so it appears only for a Canadian
  // competition. Mirrors the wording on ContestTermsPage. The administered
  // question must be a genuine multi-step (four-operation) math problem, timed
  // and unaided — the enforcement mechanism is tracked separately in #639.
  if (isCanadianCompetition) {
    sections.push({
      id: 'skill-testing',
      title: 'Skill-Testing Question (Canadian Residents)',
      blocks: [
        {
          kind: 'p',
          text: 'To comply with Canadian law, any potential winner who is a resident of Canada must, before any prize is awarded, correctly answer — unaided, in a single attempt, and within the time allowed — a time-limited mathematical skill-testing question requiring at least three arithmetic operations, administered by the Host. Failure to correctly answer the skill-testing question within the time allowed will result in disqualification, and an alternate winner may be selected.',
        },
      ],
    });
  }

  // ── How to Enter ─────────────────────────────────────────────────────────
  let entry;
  if (entryType === 'host_upload') {
    entry = 'Contestants are selected by the Host: the Host assembles the field of contestants directly, and there is no public nomination or application period. By being entered into the Competition, each contestant agrees to these Official Rules.';
  } else if (entryType === 'applications') {
    entry = 'Entry is by application: eligible people apply directly to take part. Applicants complete the required profile information and agree to these Official Rules to become a contestant.';
  } else {
    entry = 'Entry is by nomination: anyone can nominate an eligible person, and prospective contestants can also nominate themselves. A nominee confirms the nomination, completes the required profile information, and agrees to these Official Rules to become a contestant.';
  }
  // NOTE: "There is no cost to enter" is hard-coded true today. Pure-judge
  // competitions will charge a contestant entry fee (paid on acceptance) once
  // that ships — at which point this must become conditional and state the fee.
  // See the FUTURE COMPETITION STYLES note in this file's header + issue #531.
  sections.push({
    id: 'how-to-enter',
    title: 'How to Enter',
    blocks: [{ kind: 'p', text: `${entry} There is no cost to enter.` }],
  });

  // ── Competition Schedule ─────────────────────────────────────────────────
  const scheduleItems = [];
  // Host-upload competitions have no public nomination/application window — the
  // Host assembles the field of contestants directly — so any nomination dates
  // left in the config must NOT surface here (it would contradict "How to Enter",
  // which already states there is no nomination period). Only nomination/
  // application entry types have an entry window, and it's labeled to match.
  if (!isHostUpload) {
    const entryWindowLabel = isApplications ? 'Applications' : 'Nominations';
    const nominationRange =
      formatDateRange(periods?.[0]?.start_date, periods?.[0]?.end_date) ||
      formatDateRange(nominationStart, nominationEnd);
    if (nominationRange) scheduleItems.push(`${entryWindowLabel}: ${nominationRange}`);
  }

  sortedRounds.forEach((r, i) => {
    const range = formatDateRange(r.start_date, r.end_date);
    const judged = (r.judge_weight || 0) > 0 ? ' — judged round' : '';
    if (range) scheduleItems.push(`${roundLabel(r, i)}: ${range}${judged}`);
  });

  const finals = formatDate(finalsDate);
  if (finals) scheduleItems.push(`Winners announced: ${finals}`);

  sections.push({
    id: 'schedule',
    title: 'Competition Schedule',
    blocks: scheduleItems.length
      ? [
          {
            kind: 'p',
            text: 'The key dates for the Competition are below. All dates and times are subject to adjustment by the Host; the competition page always shows the current schedule.',
          },
          { kind: 'ul', items: scheduleItems },
        ]
      : [
          {
            kind: 'p',
            text: `The full schedule for the Competition — including ${scheduleFallbackDates} — is published on the competition page and may be adjusted by the Host.`,
          },
        ],
  });

  // ── How Winners Are Chosen ───────────────────────────────────────────────
  let selection;
  if (isJudgesOnly) {
    selection = 'Winners are selected by a panel of judges, who score each contestant against the published judging criteria. Judges’ scores and the Host’s final tally are final and binding, except where applicable law provides otherwise.';
  } else if (isBlended) {
    selection = 'Winners are determined through a combination of public votes and a panel of judges. In most rounds, the contestants with the most public votes advance; in the judged round(s), judges’ scores are blended with public votes as described in the Judging section below. The Host’s final tally is final and binding, except where applicable law provides otherwise.';
  } else {
    // Pure vote-based style — a supported style: winners decided entirely by
    // public vote, as magazine "cover" competitions (e.g. Inked) do. This
    // branch is its rules; keep it accurate.
    selection = 'Winners are determined by public vote — the contestants with the most votes advance through each round and ultimately win. The Host’s final tally is final and binding, except where applicable law provides otherwise.';
  }
  let winnersLine = ` This Competition crowns ${numberOfWinners === 1 ? 'one winner' : `${numberOfWinners} winners`}.`;
  if (splitByGender) winnersLine += ' Winners are determined separately for men and women.';
  sections.push({
    id: 'selection',
    title: 'How Winners Are Chosen',
    blocks: [{ kind: 'p', text: selection + winnersLine }],
  });

  // ── Judging (only when the Competition actually uses judges) ─────────────
  if (hasJudging) {
    const judgingBlocks = [];

    // The judge panel + where it sits in the process. The judge roster can
    // change after publish, so the competition page is the source of truth and
    // any count is framed as "currently" rather than a fixed promise.
    const panelCount = Array.isArray(judges) ? judges.length : 0;
    const panelText =
      panelCount > 0
        ? `Judging is performed by the panel shown on the competition page (currently ${panelCount} ${panelCount === 1 ? 'judge' : 'judges'})`
        : 'Judging is performed by the panel of qualified judges shown on the competition page';
    judgingBlocks.push({
      kind: 'p',
      text: `${panelText}, who evaluate contestants against the criteria below. The Host selects judges qualified to assess contestants and may update the panel; the competition page always shows the current judges. Judges’ decisions are final and binding, except where applicable law provides otherwise.`,
    });

    // When judging takes place and how it is weighted, per judged round.
    if (judgingRounds.length > 0) {
      const roundLines = judgingRounds.map((r, i) => {
        const w = r.judge_weight || 0;
        const label = roundLabel(r, i);
        const range = formatDateRange(r.start_date, r.end_date);
        const when = range ? ` (${range})` : '';
        if (w >= 100) {
          return `In the ${label} round${when}, judges’ scores alone determine the result.`;
        }
        return `In the ${label} round${when}, judges’ scores count for ${w}% and public votes for ${100 - w}% of that round’s result.`;
      });
      judgingBlocks.push({ kind: 'ul', items: roundLines });
    } else if (isJudgesOnly) {
      judgingBlocks.push({
        kind: 'p',
        text: 'Judges score contestants against the criteria below, and those scores determine who advances and wins.',
      });
    }

    // The criteria, how the 1–10 category scores are combined, and a worked
    // example. Scoring is stated in points (each category is scored 1–10), not
    // percentages, so the example's arithmetic closes on 100. When the winners
    // are split by gender, each component is normalized within the gender
    // division — matching finalize_voting_round().
    if (criteria.length > 0) {
      const weights = criteria.map((cr) => Number(cr.weight) || 0);
      const allEqual = weights.every((w) => w === weights[0]);
      // Each category is scored 1–10, multiplied by its weight; the raw maximum
      // is 10 × the sum of the weights (50 for five equally-weighted criteria).
      const rawMax = Math.round(weights.reduce((a, b) => a + b, 0) * 10) || criteria.length * 10;

      const criteriaItems = criteria.map((cr, i) => {
        const label = cr.label || `Criterion ${i + 1}`;
        const desc = cr.description ? ` — ${cr.description}` : '';
        return `${label}${desc}`;
      });

      judgingBlocks.push({
        kind: 'p',
        text: `Judges score each contestant from 1 to 10 on each of the following ${criteria.length} categor${criteria.length === 1 ? 'y' : 'ies'}:`,
      });
      judgingBlocks.push({ kind: 'ul', items: criteriaItems });

      // The last judged round is where winners are settled; its weight drives
      // the points split and the worked example.
      const deciderRound = judgingRounds[judgingRounds.length - 1] || null;
      const jw = isJudgesOnly ? 100 : deciderRound ? deciderRound.judge_weight || 0 : 0;
      const votePct = 100 - jw;
      const equalNote = allEqual && criteria.length > 1 ? ' Each category carries equal weight.' : '';
      const topSameField = splitByGender ? 'the highest-scoring finalist of the same gender' : 'the highest-scoring finalist';
      const topVotes = splitByGender ? 'the highest vote count of the same gender' : 'the highest vote count';

      if (jw >= 100) {
        judgingBlocks.push({
          kind: 'p',
          text: `Each contestant's category scores are combined into a total of up to ${rawMax} points.${equalNote} The contestant with the highest total${splitByGender ? ' in each gender division' : ''} wins.`,
        });
      } else if (jw > 0) {
        const ex = 0.9 * jw + 0.8 * votePct;
        const exStr = Number.isInteger(ex) ? String(ex) : ex.toFixed(1);
        judgingBlocks.push({
          kind: 'p',
          text: `In the judged round, each contestant's category scores are combined into a raw total of up to ${rawMax} points.${equalNote} That total is compared to the total of ${topSameField} and scaled to a ${jw}-point judges' score; public votes are compared to ${topVotes} and scaled to a ${votePct}-point vote score. The two are added for a final score out of 100.`,
        });
        judgingBlocks.push({
          kind: 'p',
          text: `For example, a finalist who earns 90% of the top judges' total${splitByGender ? ' among finalists of their gender' : ''} and 80% of the top vote count would score (0.90 × ${jw}) + (0.80 × ${votePct}) = ${exStr} out of 100. This is an illustration only; actual scores will vary.`,
        });
      } else if (allEqual && criteria.length > 1) {
        judgingBlocks.push({ kind: 'p', text: 'Each category carries equal weight.' });
      }
    } else {
      judgingBlocks.push({
        kind: 'p',
        text: 'The specific judging criteria are published on the competition page.',
      });
    }

    sections.push({ id: 'judging', title: 'Judging', blocks: judgingBlocks });
  }

  // ── Voting (only when the public actually votes) ─────────────────────────
  if (publicVotes) {
    const priceTxt = formatVotePrice(pricePerVote);

    // Presence-only detection: describe the mechanic when the competition uses
    // it, but don't list the specific tasks/dates (they change and live on the
    // competition timeline / contestant profiles, the source of truth).
    const hasBonusTasks = (bonusTasks || []).some((t) => t && t.enabled !== false);
    const hasDoubleDays = (doubleVoteDays || []).length > 0;

    const votingBlocks = [
      {
        kind: 'p',
        text: `Anyone eligible may vote on the public competition page. Free votes are available to everyone${
          priceTxt
            ? `, and additional votes may be purchased (starting at ${priceTxt} per vote, with lower per-vote pricing on larger vote packs) to show extra support`
            : ', and additional votes may be purchased to show extra support'
        }. Voting opens and closes on the dates shown on the competition timeline; votes recorded after a round closes do not count.`,
      },
    ];

    // Bonus votes — disclosed when the competition has enabled bonus tasks.
    if (hasBonusTasks) {
      votingBlocks.push({
        kind: 'p',
        text: 'Contestants can earn additional votes by completing bonus tasks (for example, completing their profile or sharing their page). Bonus votes are earned through these actions, not purchased, and are added to the contestant’s vote tally. The available tasks and their vote values are shown on each contestant’s profile.',
      });
    }

    // Double-vote days — disclosed when the competition has scheduled any.
    if (hasDoubleDays) {
      votingBlocks.push({
        kind: 'p',
        text: 'On scheduled double-vote days, every free and purchased vote counts twice (2×); votes earned from bonus tasks are not doubled. The scheduled double-vote days are shown on the competition timeline.',
      });
    }

    votingBlocks.push(
      {
        kind: 'p',
        text: 'To protect competitive integrity, the following are prohibited and may result in voided votes, disqualification, or account suspension:',
      },
      {
        kind: 'ul',
        items: [
          'votes generated by automated means (bots or scripts) or fraudulent payment instruments;',
          'votes followed by chargebacks, refunds, or payment reversals;',
          'votes cast through multiple accounts or false identities;',
          'a contestant purchasing votes for their own entry, directly or through anyone acting at their direction or with their funding;',
          'any vote-buying outside the platform’s official vote-purchase flow.',
        ],
      },
      {
        kind: 'p',
        text: 'Vote purchases are sold by the Host as merchant of record and processed through Stripe on the Host’s account; the Host — not EliteRank — is responsible for refunds and payment disputes relating to vote purchases. Purchased votes are final and non-refundable once recorded — regardless of whether the contestant you supported advances, places, or wins — except as required by law or as expressly stated on the competition page. See the Contest Terms & Conditions for the complete voting and anti-fraud terms.',
      },
    );

    sections.push({ id: 'voting', title: 'Voting', blocks: votingBlocks });
  }

  // ── Prizes ───────────────────────────────────────────────────────────────
  const prizeItems = (prizes || [])
    .map((p) => {
      const title = p.title || p.name;
      if (!title) return null;
      const value = formatMoney(p.value);
      const provider = p.sponsor_name ? `provided by ${p.sponsor_name}` : null;
      const detail = [value, provider].filter(Boolean).join(', ');
      return detail ? `${title} (${detail})` : title;
    })
    .filter(Boolean);

  const poolValue = prizePool ? formatMoney(prizePool.totalPrizePool ?? prizePool.hostMinimum) : null;
  const cashLine = poolValue
    ? `A cash prize pool (currently ${poolValue}), as shown on the competition’s Prizes page.`
    : null;

  const prizeListItems = [...(cashLine ? [cashLine] : []), ...prizeItems];
  // Approximate total retail value across all listed prizes + any cash pool —
  // a Competition Act §74.06 disclosure item.
  const prizeArvTotal =
    (prizes || []).reduce((sum, p) => {
      const n = Number(p.value);
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0) + (prizePool ? Number(prizePool.totalPrizePool ?? prizePool.hostMinimum) || 0 : 0);
  const arvTotalLine =
    prizeArvTotal > 0
      ? `The approximate total retail value of all prizes is ${formatMoney(prizeArvTotal)}. Individual values shown are approximate retail values (ARV) and may vary.`
      : null;
  const prizeBlocks = [
    {
      kind: 'p',
      text: prizeListItems.length
        ? 'The prizes currently set for the Competition are listed below, each with its approximate retail value (ARV). Prizes may change — the competition’s Prizes page always shows the current prizes:'
        : 'The prizes for the Competition are shown on the competition’s Prizes page and may be updated by the Host.',
    },
  ];
  if (prizeListItems.length) prizeBlocks.push({ kind: 'ul', items: prizeListItems });
  if (arvTotalLine) prizeBlocks.push({ kind: 'p', text: arvTotalLine });
  // Prize taxation follows the competition's jurisdiction: a Canadian
  // (skill-based) contest reports under the Income Tax Act via a T4A / SIN,
  // not the U.S. IRS 1099 / W-9 regime. Prizes in a Canadian skill contest can
  // be taxable income (unlike lottery windfalls), so the T4A reference is apt.
  const prizeTaxLine = isCanadianCompetition
    ? 'Taxes on prizes are the sole responsibility of the winner. Prizes awarded in this skill-based Competition may be taxable under the Income Tax Act (Canada); where required, the Host will issue a T4A slip and may require the winner’s Social Insurance Number (SIN) before the prize is released.'
    : 'Taxes on prizes are the sole responsibility of the winner. Where required (generally $600 or more in aggregate per calendar year for U.S. recipients), the Host will issue an IRS Form 1099 and require a completed Form W-9 before the prize is released.';
  prizeBlocks.push({
    kind: 'ul',
    items: [
      'Chances of winning depend on the skill and judging scores of the contestants and the number of eligible entrants and votes cast — winners are determined by the published criteria, not by random chance.',
      'Prizes may be added, removed, or updated by the Host; the competition’s Prizes page reflects the current prize lineup at any time.',
      'Prizes are not transferable or for resale and have no cash value and may not be exchanged or redeemed for cash unless expressly stated otherwise. The Host may substitute a prize of equal or greater value if the original becomes unavailable.',
      'Each prize provider is responsible only for the portion of the prize it supplies.',
      prizeTaxLine,
      'The Promotion Entities are not liable for any injury, loss, or damages arising from acceptance or use of a prize.',
    ],
  });
  sections.push({ id: 'prizes', title: 'Prizes', blocks: prizeBlocks });

  // ── Charity (only when the Competition has a charity partner) ────────────
  // Triggered by a partner OR a percentage so the section appears whenever
  // either is configured; the percentage is stated when set and generalized
  // when it isn't.
  if (charityName || charityPct) {
    const toWhom = charityName || 'the designated charity partner';
    // The donation comes from the Host's net — the vote revenue the Host
    // receives after EliteRank's fees — and the Host (not EliteRank) makes it.
    const baseDesc = 'the Host’s net proceeds from purchased votes (the vote revenue the Host receives after EliteRank’s platform and payment-processing fees)';
    const shareTxt = charityPct ? `${charityPct}% of ${baseDesc}` : `a portion of ${baseDesc}`;
    sections.push({
      id: 'charity',
      title: 'Charity',
      blocks: [
        {
          kind: 'p',
          text: `The Competition supports ${toWhom} as its charity partner. The Host will donate ${shareTxt} to ${toWhom}. The donation is made by the Host — EliteRank operates the competition platform and processes payments but does not collect or make the donation. If the designated charity is unable or unwilling to accept the donation, the Host may donate the charity portion to an alternate charity of similar mission.`,
        },
        {
          kind: 'p',
          text: 'Vote purchases are not tax-deductible charitable contributions for voters. No charitable tax receipt or written acknowledgement will be provided for any vote purchase.',
        },
      ],
    });
  }

  // ── Winner Verification & Notification ───────────────────────────────────
  sections.push({
    id: 'winners',
    title: 'Winner Verification & Notification',
    blocks: [
      {
        kind: 'p',
        text: 'All potential winners are subject to verification of eligibility and compliance with these Official Rules. A potential winner may be required to sign an Affidavit of Eligibility, Liability Release, and (where lawful) Publicity Release, and to provide tax forms before a prize is released. A potential winner who cannot be verified, does not respond to a winner notification within five (5) days, declines the prize, or is found to have violated these Official Rules may be disqualified and an alternate winner selected.',
      },
      {
        kind: 'p',
        text: 'Winner verification, prize fulfillment, and any tax reporting for the Competition are the Host’s responsibility. EliteRank operates the competition platform and does not perform these steps or guarantee the Host’s compliance.',
      },
    ],
  });

  // ── Publicity & Submitted Content ────────────────────────────────────────
  sections.push({
    id: 'publicity',
    title: 'Publicity & Submitted Content',
    blocks: [
      {
        kind: 'p',
        text: 'You retain ownership of the photos, videos, and other materials you submit, and grant the Promotion Entities a non-exclusive, worldwide, royalty-free license to use them to administer and promote the Competition and the platform. Except where prohibited by law, each winner consents to the use of their name, city, photograph, and likeness for promotional purposes related to the Competition without further notice or compensation. Full terms are in the Contest Terms & Conditions.',
      },
    ],
  });

  // ── Conduct & Disqualification ───────────────────────────────────────────
  sections.push({
    id: 'conduct',
    title: 'Conduct & Disqualification',
    blocks: [
      {
        kind: 'p',
        text: 'The Host and EliteRank may, at their sole discretion, void votes, adjust rankings, withhold prizes, suspend accounts, and disqualify any contestant or voter who violates these Official Rules, tampers with the Competition, or engages in fraudulent or unsportsmanlike conduct.',
      },
    ],
  });

  // ── Limitation of Liability ──────────────────────────────────────────────
  sections.push({
    id: 'liability',
    title: 'Limitation of Liability',
    blocks: [
      {
        kind: 'p',
        text: 'To the maximum extent permitted by law, all entrants, voters, and winners release the Host, EliteRank, and the other Promotion Entities from any liability arising out of or related to the Competition, including the use of submitted materials and the acceptance or use of prizes. The platform and the Competition are provided "as is." See the Contest Terms & Conditions for the full disclaimer and release.',
      },
    ],
  });

  // ── Changes & Termination ────────────────────────────────────────────────
  sections.push({
    id: 'termination',
    title: 'Changes & Termination',
    blocks: [
      {
        kind: 'p',
        text: 'The Host reserves the right to modify, suspend, or cancel the Competition, in whole or in part, at any time and for any reason — including fraud, technical failure, or events beyond its reasonable control. The Host will not be liable for any such change.',
      },
    ],
  });

  // ── Governing Law ────────────────────────────────────────────────────────
  // The Competition is the Host's, so a Canadian competition's Official Rules
  // are governed by the Host's province (Ontario). The platform-wide terms that
  // govern use of EliteRank itself remain governed by Illinois, where the
  // platform operator (Most Eligible LLC) sits — the two are distinct.
  sections.push({
    id: 'governing-law',
    title: 'Governing Law',
    blocks: [
      {
        kind: 'p',
        text: isCanadianCompetition
          ? 'These Official Rules and the Competition are governed by the laws of the Province of Ontario and the federal laws of Canada applicable therein, without regard to conflict-of-laws principles, and any dispute relating to the Competition is subject to the exclusive jurisdiction of the courts of the Province of Ontario. The platform-wide Contest Terms & Conditions, Terms of Use, and Privacy Policy that govern your use of the EliteRank platform remain governed by the laws of the State of Illinois, USA, as stated in those documents. Any claim arising out of or relating to the Competition must be brought within one (1) year after it arose, or be permanently barred. The Competition is void where prohibited or restricted by law.'
          : 'These Official Rules are governed by the laws of the State of Illinois, without regard to conflict-of-laws principles, and any dispute is subject to the jurisdiction of the state and federal courts located in Cook County, Illinois. Any claim arising out of or relating to the Competition must be brought within one (1) year after it arose, or be permanently barred. The Competition is void where prohibited or restricted by law.',
      },
    ],
  });

  // ── Privacy ──────────────────────────────────────────────────────────────
  sections.push({
    id: 'privacy',
    title: 'Privacy',
    blocks: [
      {
        kind: 'p',
        text: 'Information you provide in connection with the Competition is collected and used in accordance with the EliteRank Privacy Policy.',
      },
    ],
  });

  // ── Platform Non-Affiliation ─────────────────────────────────────────────
  sections.push({
    id: 'non-affiliation',
    title: 'Platform Non-Affiliation',
    blocks: [
      {
        kind: 'p',
        text: 'The Competition is not sponsored, endorsed, or administered by, or associated with, Instagram, Facebook, TikTok, X, YouTube, Apple, Google, or any other third-party platform.',
      },
    ],
  });

  // ── Complete Agreement & Related Policies ────────────────────────────────
  sections.push({
    id: 'agreement',
    title: 'Complete Agreement',
    blocks: [
      {
        kind: 'p',
        text: 'These Official Rules, together with the platform-wide Contest Terms & Conditions, Terms of Use, Privacy Policy, and Cookie Policy, are the complete agreement between you and the Promotion Entities concerning the Competition and supersede any prior understanding.',
      },
      {
        kind: 'p',
        text: 'If any provision of these Official Rules is held invalid or unenforceable, that provision will be limited or removed to the minimum extent necessary, and the remaining provisions will remain in full force and effect.',
      },
      { kind: 'policyLinks' },
    ],
  });

  // ── Winners List & Requesting the Rules ──────────────────────────────────
  // Standard prize-contest section (and part of adequate disclosure): a way to
  // obtain the winner names and a copy of the rules after the Competition ends.
  sections.push({
    id: 'winners-list',
    title: 'Winners List & Requesting These Rules',
    blocks: [
      {
        kind: 'p',
        text: `The name(s) of the winner(s) and a copy of these Official Rules are available on request after the Competition concludes. To request them, contact the Host, ${hostName}${orgEmail ? `, at ${orgEmail}` : ''}${orgAddress ? `, or by mail at ${orgAddress}` : ''}. Requests must be made within ninety (90) days after the winners are announced.`,
      },
    ],
  });

  // ── Contact ──────────────────────────────────────────────────────────────
  sections.push({
    id: 'contact',
    title: 'Contact',
    blocks: [
      {
        kind: 'p',
        text:
          `Questions about the Competition itself — entry, prizes, charity, judging, or results — are handled by the Host, ${hostName}, who is responsible for the Competition` +
          (orgEmail ? `, and can be contacted at ${orgEmail}` : '') +
          '.' +
          (orgAddress ? ` The Host’s registered address is ${orgAddress}.` : ''),
      },
      { kind: 'p', text: 'For questions about the EliteRank platform or these Official Rules, contact:' },
      { kind: 'contact' },
    ],
  });

  // Number sections from their final order so conditional sections never
  // desync the numbering.
  return {
    sections: sections.map((s, i) => ({ ...s, title: `${i + 1}. ${s.title}` })),
  };
}

export default buildOfficialRules;
