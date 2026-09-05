import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

// -----------------------------------------------------------------------------
// Database Test Environment Configuration & Safety Invariants
// -----------------------------------------------------------------------------
const rawPort = Deno.env.get('TEST_PGPORT') || Deno.env.get('PGPORT');
if (!rawPort) {
  throw new Error(
    'Database test harness requires TEST_PGPORT or PGPORT environment variable to be explicitly set (e.g. PGPORT=65322).'
  );
}

const port = parseInt(rawPort, 10);
if (isNaN(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid port specified in PGPORT/TEST_PGPORT: "${rawPort}"`);
}

const rawDb = Deno.env.get('TEST_PGDATABASE') || Deno.env.get('PGDATABASE') || 'test_mws_judging';
if (!/^[a-z0-9_]+$/.test(rawDb) || !rawDb.includes('test')) {
  throw new Error(
    `Database safety invariant violation: database name "${rawDb}" must match ^[a-z0-9_]+$ and contain "test" to ensure safety.`
  );
}

const DB_CONFIG = {
  hostname: Deno.env.get('TEST_PGHOST') || Deno.env.get('PGHOST') || 'localhost',
  port,
  user: Deno.env.get('TEST_PGUSER') || Deno.env.get('PGUSER') || 'postgres',
  password: Deno.env.get('TEST_PGPASSWORD') || Deno.env.get('PGPASSWORD') || 'postgres',
  database: rawDb,
};

let dbInitialized = false;

async function ensureDatabaseInitialized() {
  if (dbInitialized) return;

  const adminClient = new Client({
    hostname: DB_CONFIG.hostname,
    port: DB_CONFIG.port,
    user: DB_CONFIG.user,
    password: DB_CONFIG.password,
    database: 'postgres',
  });
  await adminClient.connect();
  try {
    const res = await adminClient.queryObject<{ exists: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) as exists;
    `, [DB_CONFIG.database]);

    if (!res.rows[0].exists) {
      const safeDbName = DB_CONFIG.database.replace(/"/g, '""');
      await adminClient.queryArray(`CREATE DATABASE "${safeDbName}";`);
    }
  } finally {
    await adminClient.end();
  }

  const targetClient = new Client(DB_CONFIG);
  await targetClient.connect();
  try {
    const fixtureSql = await Deno.readTextFile('tests/setup_judging_fixture.sql');
    await targetClient.queryArray(fixtureSql);

    const mig120 = await Deno.readTextFile('supabase/migrations/20260811000000_120_finalize_last_round_crowning_and_gender_normalization.sql');
    await targetClient.queryArray(mig120);

    const migMws = await Deno.readTextFile('supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql');
    await targetClient.queryArray(migMws);

    dbInitialized = true;
  } finally {
    await targetClient.end();
  }
}

async function createClient(): Promise<Client> {
  await ensureDatabaseInitialized();
  const client = new Client(DB_CONFIG);
  await client.connect();
  return client;
}

interface FixtureContext {
  orgId: string;
  compId: string;
  roundId: string;
  contestantIds: string[];
}

async function resetAndSetupBaseFixtures(client: Client): Promise<FixtureContext> {
  await ensureDatabaseInitialized();

  // Reload authoritative migration to ensure latest function and trigger definitions
  const migMws = await Deno.readTextFile('supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql');
  await client.queryArray(migMws);

  // Clean data tables
  await client.queryArray('DELETE FROM public.judge_scores;');
  await client.queryArray('DELETE FROM public.judging_criteria;');
  await client.queryArray('DELETE FROM public.judges;');
  await client.queryArray('DELETE FROM public.voting_rounds;');
  await client.queryArray('DELETE FROM public.contestants;');
  await client.queryArray('DELETE FROM public.competitions;');
  await client.queryArray('DELETE FROM public.organizations;');

  // Organization & Competition
  const orgRes = await client.queryObject<{ id: string }>(`
    INSERT INTO public.organizations (name, slug)
    VALUES ('MWS Test Org', 'mws-test-org')
    RETURNING id;
  `);
  const orgId = orgRes.rows[0].id;

  const compRes = await client.queryObject<{ id: string }>(`
    INSERT INTO public.competitions (name, slug, organization_id, status, number_of_winners, winners_split_by_gender)
    VALUES ('Miss Woman Summer Test', 'mws-test', $1, 'voting', 3, false)
    RETURNING id;
  `, [orgId]);
  const compId = compRes.rows[0].id;

  // Active contestants (2 contestants)
  const c1Res = await client.queryObject<{ id: string }>(`
    INSERT INTO public.contestants (competition_id, name, status, votes)
    VALUES ($1, 'Contestant 1', 'active', 100)
    RETURNING id;
  `, [compId]);

  const c2Res = await client.queryObject<{ id: string }>(`
    INSERT INTO public.contestants (competition_id, name, status, votes)
    VALUES ($1, 'Contestant 2', 'active', 80)
    RETURNING id;
  `, [compId]);

  // Judging round (100% judging, unfinalized)
  const roundRes = await client.queryObject<{ id: string }>(`
    INSERT INTO public.voting_rounds (
      competition_id, title, round_order, round_type,
      start_date, end_date, contestants_advance, judge_weight
    )
    VALUES (
      $1, 'Final Judging Round', 1, 'judging',
      NOW() - INTERVAL '2 hours',
      NOW() - INTERVAL '1 minute',
      2, 100
    )
    RETURNING id;
  `, [compId]);

  return {
    orgId,
    compId,
    roundId: roundRes.rows[0].id,
    contestantIds: [c1Res.rows[0].id, c2Res.rows[0].id],
  };
}

function getErrorSummary(err: any): string {
  const parts = [err?.message, err?.hint, err?.details, String(err)];
  return parts.filter(Boolean).join(' ');
}

// -----------------------------------------------------------------------------
// Test 1: validate_placement_labels constraint & function
// -----------------------------------------------------------------------------
Deno.test('Placement Labels: validate_placement_labels enforces non-empty, unique strings and cardinality <= max', async () => {
  const client = await createClient();
  try {
    const testCases = [
      { labels: null, max: 3, expected: true, desc: 'NULL array is allowed (fallback to ordinals)' },
      { labels: ['Reina', 'Virreina', 'Princesa'], max: 3, expected: true, desc: '3 valid non-empty unique labels with max=3' },
      { labels: ['Reina', 'Virreina'], max: 3, expected: true, desc: '2 labels with max=3 is valid (cardinality <= max)' },
      { labels: ['Reina', 'Virreina', 'Princesa', 'Dama'], max: 3, expected: false, desc: '4 labels with max=3 is rejected (cardinality > max)' },
      { labels: ['Reina', '', 'Princesa'], max: 3, expected: false, desc: 'Empty string label is rejected' },
      { labels: ['Reina', '   ', 'Princesa'], max: 3, expected: false, desc: 'Whitespace-only string is rejected' },
      { labels: ['Reina', null, 'Princesa'], max: 3, expected: false, desc: 'Null element is rejected' },
      { labels: ['Reina', 'Virreina', 'Reina'], max: 3, expected: false, desc: 'Duplicate label is rejected' },
      { labels: ['Reina', 'Virreina', '  Reina  '], max: 3, expected: false, desc: 'Trimmed duplicate label is rejected' },
      { labels: [], max: 3, expected: false, desc: 'Empty array is rejected' },
    ];

    for (const tc of testCases) {
      const res = await client.queryObject<{ valid: boolean }>(`
        SELECT public.validate_placement_labels($1::text[], $2) AS valid;
      `, [tc.labels, tc.max]);
      if (res.rows[0].valid !== tc.expected) {
        throw new Error(`Test failed for "${tc.desc}": expected ${tc.expected}, got ${res.rows[0].valid}`);
      }
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 2: Barrier blocks when judging criteria are missing
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 1: Blocks finalization when judging criteria are missing', async () => {
  const client = await createClient();
  try {
    const { roundId } = await resetAndSetupBaseFixtures(client);

    let errSummary = '';
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errSummary = getErrorSummary(err);
    }

    if (!errSummary.includes('no judging criteria') && !errSummary.includes('judging_criteria_missing')) {
      throw new Error(`Expected missing criteria error, got: ${errSummary}`);
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 3: Barrier blocks when judges are missing
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 2: Blocks finalization when active judges are missing', async () => {
  const client = await createClient();
  try {
    const { compId, roundId } = await resetAndSetupBaseFixtures(client);

    await client.queryArray(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1);
    `, [compId]);

    let errSummary = '';
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errSummary = getErrorSummary(err);
    }

    if (!errSummary.includes('no active (non-hidden) judges') && !errSummary.includes('judges_missing')) {
      throw new Error(`Expected judges missing error, got: ${errSummary}`);
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 4: Barrier blocks when active judges are unclaimed
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 3: Blocks finalization when active judges are unclaimed', async () => {
  const client = await createClient();
  try {
    const { compId, roundId } = await resetAndSetupBaseFixtures(client);

    await client.queryArray(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1);
    `, [compId]);

    // Insert unclaimed judge (claimed_at and user_id are NULL)
    await client.queryArray(`
      INSERT INTO public.judges (competition_id, name, email, hidden)
      VALUES ($1, 'Unclaimed Judge', 'judge@example.com', false);
    `, [compId]);

    let errSummary = '';
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errSummary = getErrorSummary(err);
    }

    if (!errSummary.includes('unclaimed active judge') && !errSummary.includes('unclaimed_judges')) {
      throw new Error(`Expected unclaimed judge error, got: ${errSummary}`);
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 5: Barrier blocks when required scores are missing
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 4: Blocks finalization when scores are missing from matrix', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestantIds } = await resetAndSetupBaseFixtures(client);

    const critRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1)
      RETURNING id;
    `, [compId]);
    const critId = critRes.rows[0].id;

    const judgeRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, hidden, claimed_at, user_id)
      VALUES ($1, 'Claimed Judge 1', 'judge1@example.com', false, NOW(), gen_random_uuid())
      RETURNING id;
    `, [compId]);
    const judgeId = judgeRes.rows[0].id;

    // Only score contestant 1, leaving contestant 2 missing
    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES ($1, $2, $3, $4, $5, 9, NOW());
    `, [compId, roundId, judgeId, contestantIds[0], critId]);

    let errSummary = '';
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errSummary = getErrorSummary(err);
    }

    if (!errSummary.includes('missing') && !errSummary.includes('incomplete_score_matrix')) {
      throw new Error(`Expected missing scores error, got: ${errSummary}`);
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 6: Barrier blocks when scores are unsubmitted drafts
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 5: Blocks finalization when scores are unsubmitted drafts', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestantIds } = await resetAndSetupBaseFixtures(client);

    const critRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1)
      RETURNING id;
    `, [compId]);
    const critId = critRes.rows[0].id;

    const judgeRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, hidden, claimed_at, user_id)
      VALUES ($1, 'Claimed Judge 1', 'judge1@example.com', false, NOW(), gen_random_uuid())
      RETURNING id;
    `, [compId]);
    const judgeId = judgeRes.rows[0].id;

    // Contestant 1 submitted, Contestant 2 draft (submitted_at IS NULL)
    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES ($1, $2, $3, $4, $5, 9, NOW());
    `, [compId, roundId, judgeId, contestantIds[0], critId]);

    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES ($1, $2, $3, $4, $5, 8, NULL);
    `, [compId, roundId, judgeId, contestantIds[1], critId]);

    let errSummary = '';
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errSummary = getErrorSummary(err);
    }

    if (!errSummary.includes('unsubmitted draft score') && !errSummary.includes('unsubmitted_draft_scores')) {
      throw new Error(`Expected unsubmitted draft score error, got: ${errSummary}`);
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 7: Multi-judge matrix completeness blocking
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier: Two visible claimed judges where Judge A submitted all scores but Judge B is missing one score blocks finalization', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestantIds } = await resetAndSetupBaseFixtures(client);

    const critRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1)
      RETURNING id;
    `, [compId]);
    const critId = critRes.rows[0].id;

    // Two claimed visible judges
    const j1 = (await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, hidden, claimed_at, user_id)
      VALUES ($1, 'Judge Alpha', 'alpha@example.com', false, NOW(), gen_random_uuid())
      RETURNING id;
    `, [compId])).rows[0].id;

    const j2 = (await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, hidden, claimed_at, user_id)
      VALUES ($1, 'Judge Beta', 'beta@example.com', false, NOW(), gen_random_uuid())
      RETURNING id;
    `, [compId])).rows[0].id;

    // Judge Alpha submitted scores for BOTH contestants
    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES
        ($1, $2, $3, $4, $5, 9, NOW()),
        ($1, $2, $3, $6, $5, 8, NOW());
    `, [compId, roundId, j1, contestantIds[0], critId, contestantIds[1]]);

    // Judge Beta submitted score for contestant 1, but is MISSING contestant 2
    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES ($1, $2, $3, $4, $5, 7, NOW());
    `, [compId, roundId, j2, contestantIds[0], critId]);

    let errSummary = '';
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errSummary = getErrorSummary(err);
    }

    if (!errSummary.includes('missing 1 required score') && !errSummary.includes('incomplete_score_matrix')) {
      throw new Error(`Expected Judge Beta missing 1 score error, got: ${errSummary}`);
    }

    // Verify transaction rolled back: round remains unfinalized
    const roundCheck = await client.queryObject<{ finalized_at: string | null }>(`
      SELECT finalized_at FROM public.voting_rounds WHERE id = $1;
    `, [roundId]);
    if (roundCheck.rows[0].finalized_at !== null) {
      throw new Error('Round finalized_at was mutated despite incomplete matrix error!');
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 8: Allows finalization when all scores submitted
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 6: Allows finalization when matrix is complete and all scores submitted', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestantIds } = await resetAndSetupBaseFixtures(client);

    const critRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1)
      RETURNING id;
    `, [compId]);
    const critId = critRes.rows[0].id;

    const judgeRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, hidden, claimed_at, user_id)
      VALUES ($1, 'Claimed Judge 1', 'judge1@example.com', false, NOW(), gen_random_uuid())
      RETURNING id;
    `, [compId]);
    const judgeId = judgeRes.rows[0].id;

    // Both contestants scored and submitted
    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES
        ($1, $2, $3, $4, $5, 10, NOW()),
        ($1, $2, $3, $6, $5, 7, NOW());
    `, [compId, roundId, judgeId, contestantIds[0], critId, contestantIds[1]]);

    const res = await client.queryObject<{ finalize_voting_round: any }>(`
      SELECT finalize_voting_round($1);
    `, [roundId]);

    if (!res.rows[0].finalize_voting_round?.finalized) {
      throw new Error('Expected round to finalize successfully');
    }

    const roundCheck = await client.queryObject<{ finalized_at: string }>(`
      SELECT finalized_at FROM public.voting_rounds WHERE id = $1;
    `, [roundId]);
    if (!roundCheck.rows[0].finalized_at) {
      throw new Error('Expected round finalized_at to be populated');
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 9: Hidden judge is ignored in readiness checks
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 7: Hidden preview judge excluded from readiness checks', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestantIds } = await resetAndSetupBaseFixtures(client);

    const critRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1)
      RETURNING id;
    `, [compId]);
    const critId = critRes.rows[0].id;

    // Non-hidden claimed judge with all scores submitted
    const activeJudge = (await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, hidden, claimed_at, user_id)
      VALUES ($1, 'Active Judge', 'active@example.com', false, NOW(), gen_random_uuid())
      RETURNING id;
    `, [compId])).rows[0].id;

    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES
        ($1, $2, $3, $4, $5, 9, NOW()),
        ($1, $2, $3, $6, $5, 8, NOW());
    `, [compId, roundId, activeJudge, contestantIds[0], critId, contestantIds[1]]);

    // Hidden preview judge (unclaimed, zero scores)
    await client.queryArray(`
      INSERT INTO public.judges (competition_id, name, email, hidden, claimed_at, user_id)
      VALUES ($1, 'Hidden Preview Judge', 'preview@example.com', true, NULL, NULL);
    `, [compId]);

    const res = await client.queryObject<{ finalize_voting_round: any }>(`
      SELECT finalize_voting_round($1);
    `, [roundId]);

    if (!res.rows[0].finalize_voting_round?.finalized) {
      throw new Error('Expected finalization to succeed despite hidden preview judge');
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 10: Pure-vote rounds are completely untouched
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 8: Pure-vote rounds (judge_weight = 0) are completely unaffected', async () => {
  const client = await createClient();
  try {
    const { compId } = await resetAndSetupBaseFixtures(client);

    const pureRoundRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.voting_rounds (
        competition_id, title, round_order, round_type,
        start_date, end_date, contestants_advance, judge_weight
      )
      VALUES (
        $1, 'Pure Vote Round', 1, 'voting',
        NOW() - INTERVAL '2 hours',
        NOW() - INTERVAL '1 minute',
        2, 0
      )
      RETURNING id;
    `, [compId]);
    const pureRoundId = pureRoundRes.rows[0].id;

    const res = await client.queryObject<{ finalize_voting_round: any }>(`
      SELECT finalize_voting_round($1);
    `, [pureRoundId]);

    if (!res.rows[0].finalize_voting_round?.finalized) {
      throw new Error('Expected pure-vote round to finalize cleanly');
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 11: Transaction rollback on barrier failure guarantees 0 partial mutations
// -----------------------------------------------------------------------------
Deno.test('Readiness Barrier 9: Transaction rollback guarantees zero partial mutations on failure', async () => {
  const client = await createClient();
  try {
    const { compId, roundId } = await resetAndSetupBaseFixtures(client);

    await client.queryArray(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1);
    `, [compId]);

    const initialComp = await client.queryObject<{ status: string; winners: any }>(`
      SELECT status, winners FROM public.competitions WHERE id = $1;
    `, [compId]);
    const initialRound = await client.queryObject<{ finalized_at: any }>(`
      SELECT finalized_at FROM public.voting_rounds WHERE id = $1;
    `, [roundId]);
    const initialContestants = await client.queryObject<{ id: string; status: string }>(`
      SELECT id, status FROM public.contestants WHERE competition_id = $1;
    `, [compId]);

    let threw = false;
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected finalize_voting_round to fail');

    const postComp = await client.queryObject<{ status: string; winners: any }>(`
      SELECT status, winners FROM public.competitions WHERE id = $1;
    `, [compId]);
    if (postComp.rows[0].status !== initialComp.rows[0].status) {
      throw new Error(`Competition status was mutated to ${postComp.rows[0].status}!`);
    }
    if (postComp.rows[0].winners !== initialComp.rows[0].winners) {
      throw new Error('Competition winners array was mutated!');
    }

    const postRound = await client.queryObject<{ finalized_at: any }>(`
      SELECT finalized_at FROM public.voting_rounds WHERE id = $1;
    `, [roundId]);
    if (postRound.rows[0].finalized_at !== null) {
      throw new Error('Round finalized_at was mutated!');
    }

    const postContestants = await client.queryObject<{ id: string; status: string }>(`
      SELECT id, status FROM public.contestants WHERE competition_id = $1;
    `, [compId]);
    for (const c of postContestants.rows) {
      if (c.status !== 'active') {
        throw new Error(`Contestant ${c.id} status was mutated to ${c.status}!`);
      }
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 12: MWS baseline drift rollback — completed competition or existing winners
// -----------------------------------------------------------------------------
Deno.test('Miss Woman Summer Baseline Drift: Migration rolls back if competition is completed or winners exist', async () => {
  const client = await createClient();
  try {
    await ensureDatabaseInitialized();
    const mwsCompId = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
    const mwsRoundId = '85373939-f51b-48df-86ca-cbdaeca51663';
    const migSql = await Deno.readTextFile('supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql');

    // Case A: Competition status = 'completed'
    await client.queryArray('DELETE FROM public.judging_criteria WHERE competition_id = $1;', [mwsCompId]);
    await client.queryArray('DELETE FROM public.voting_rounds WHERE id = $1;', [mwsRoundId]);
    await client.queryArray('DELETE FROM public.competitions WHERE id = $1;', [mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.competitions (id, name, slug, number_of_winners, status)
      VALUES ($1, 'Miss Woman Summer Chicago 2026', 'miss-woman-summer-chi-26', 1, 'completed');
    `, [mwsCompId]);
    await client.queryArray(`
      INSERT INTO public.voting_rounds (id, competition_id, title, round_order, round_type, start_date, end_date, contestants_advance, judge_weight)
      VALUES ($1, $2, 'Final Round', 1, 'judging', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 1, 100);
    `, [mwsRoundId, mwsCompId]);

    let threw = false;
    let errSummary = '';
    try {
      await client.queryArray(migSql);
    } catch (err: any) {
      threw = true;
      errSummary = getErrorSummary(err);
    }
    if (!threw || (!errSummary.includes('mws_already_completed') && !errSummary.includes('already completed'))) {
      throw new Error(`Expected mws_already_completed drift exception, got: ${errSummary}`);
    }

    // Case B: Winners array already populated
    await client.queryArray('DELETE FROM public.voting_rounds WHERE id = $1;', [mwsRoundId]);
    await client.queryArray('DELETE FROM public.competitions WHERE id = $1;', [mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.competitions (id, name, slug, number_of_winners, status, winners)
      VALUES ($1, 'Miss Woman Summer Chicago 2026', 'miss-woman-summer-chi-26', 1, 'voting', ARRAY[gen_random_uuid()]);
    `, [mwsCompId]);
    await client.queryArray(`
      INSERT INTO public.voting_rounds (id, competition_id, title, round_order, round_type, start_date, end_date, contestants_advance, judge_weight)
      VALUES ($1, $2, 'Final Round', 1, 'judging', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 1, 100);
    `, [mwsRoundId, mwsCompId]);

    threw = false;
    errSummary = '';
    try {
      await client.queryArray(migSql);
    } catch (err: any) {
      threw = true;
      errSummary = getErrorSummary(err);
    }
    if (!threw || (!errSummary.includes('mws_winners_already_crowned') && !errSummary.includes('already has crowned winners'))) {
      throw new Error(`Expected mws_winners_already_crowned drift exception, got: ${errSummary}`);
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 13: MWS baseline drift rollback — missing round, mismatched comp, or finalized
// -----------------------------------------------------------------------------
Deno.test('Miss Woman Summer Baseline Drift: Migration rolls back on missing, mismatched, or already finalized round', async () => {
  const client = await createClient();
  try {
    await ensureDatabaseInitialized();
    const mwsCompId = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
    const mwsRoundId = '85373939-f51b-48df-86ca-cbdaeca51663';
    const migSql = await Deno.readTextFile('supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql');

    // Case A: Round missing
    await client.queryArray('DELETE FROM public.judging_criteria WHERE competition_id = $1;', [mwsCompId]);
    await client.queryArray('DELETE FROM public.voting_rounds WHERE id = $1;', [mwsRoundId]);
    await client.queryArray('DELETE FROM public.competitions WHERE id = $1;', [mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.competitions (id, name, slug, number_of_winners, status)
      VALUES ($1, 'Miss Woman Summer Chicago 2026', 'miss-woman-summer-chi-26', 1, 'voting');
    `, [mwsCompId]);

    let threw = false;
    let errSummary = '';
    try {
      await client.queryArray(migSql);
    } catch (err: any) {
      threw = true;
      errSummary = getErrorSummary(err);
    }
    if (!threw || (!errSummary.includes('mws_round_missing') && !errSummary.includes('expected final round'))) {
      throw new Error(`Expected mws_round_missing drift exception, got: ${errSummary}`);
    }

    // Case B: Round already finalized
    await client.queryArray(`
      INSERT INTO public.voting_rounds (id, competition_id, title, round_order, round_type, start_date, end_date, contestants_advance, judge_weight, finalized_at)
      VALUES ($1, $2, 'Final Round', 1, 'judging', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 1, 100, NOW());
    `, [mwsRoundId, mwsCompId]);

    threw = false;
    errSummary = '';
    try {
      await client.queryArray(migSql);
    } catch (err: any) {
      threw = true;
      errSummary = getErrorSummary(err);
    }
    if (!threw || (!errSummary.includes('mws_round_already_finalized') && !errSummary.includes('already finalized'))) {
      throw new Error(`Expected mws_round_already_finalized drift exception, got: ${errSummary}`);
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 14: MWS baseline drift rollback — partial or unexpected criteria present
// -----------------------------------------------------------------------------
Deno.test('Miss Woman Summer Baseline Drift: Migration rolls back on partial or drifted criteria', async () => {
  const client = await createClient();
  try {
    await ensureDatabaseInitialized();
    const mwsCompId = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
    const mwsRoundId = '85373939-f51b-48df-86ca-cbdaeca51663';
    const migSql = await Deno.readTextFile('supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql');

    // Case A: 1 unexpected criterion present in unconfigured competition
    await client.queryArray('DELETE FROM public.judging_criteria WHERE competition_id = $1;', [mwsCompId]);
    await client.queryArray('DELETE FROM public.voting_rounds WHERE id = $1;', [mwsRoundId]);
    await client.queryArray('DELETE FROM public.competitions WHERE id = $1;', [mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.competitions (id, name, slug, number_of_winners, status)
      VALUES ($1, 'Miss Woman Summer Chicago 2026', 'miss-woman-summer-chi-26', 1, 'voting');
    `, [mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.voting_rounds (id, competition_id, title, round_order, round_type, start_date, end_date, contestants_advance, judge_weight)
      VALUES ($1, $2, 'Final Round', 1, 'judging', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 1, 100);
    `, [mwsRoundId, mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Some Stray Criterion', 1.0, 1);
    `, [mwsCompId]);

    let threw = false;
    let errSummary = '';
    try {
      await client.queryArray(migSql);
    } catch (err: any) {
      threw = true;
      errSummary = getErrorSummary(err);
    }
    if (!threw || (!errSummary.includes('mws_criteria_drift') && !errSummary.includes('unexpected judging criteria'))) {
      throw new Error(`Expected mws_criteria_drift exception for partial criteria, got: ${errSummary}`);
    }
  } finally {
    await client.end();
  }
});

// -----------------------------------------------------------------------------
// Test 15: Clean 1st run & exact rerun idempotency
// -----------------------------------------------------------------------------
Deno.test('Miss Woman Summer: Clean 1st run configures exact state and rerun is a clean no-op', async () => {
  const client = await createClient();
  try {
    await ensureDatabaseInitialized();
    const mwsCompId = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
    const mwsRoundId = '85373939-f51b-48df-86ca-cbdaeca51663';
    const migSql = await Deno.readTextFile('supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql');

    // Clean baseline setup: unconfigured MWS
    await client.queryArray('DELETE FROM public.judging_criteria WHERE competition_id = $1;', [mwsCompId]);
    await client.queryArray('DELETE FROM public.voting_rounds WHERE id = $1;', [mwsRoundId]);
    await client.queryArray('DELETE FROM public.competitions WHERE id = $1;', [mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.competitions (id, name, slug, number_of_winners, status)
      VALUES ($1, 'Miss Woman Summer Chicago 2026', 'miss-woman-summer-chi-26', 1, 'voting');
    `, [mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.voting_rounds (id, competition_id, title, round_order, round_type, start_date, end_date, contestants_advance, judge_weight)
      VALUES ($1, $2, 'Final Round', 1, 'judging', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 1, 100);
    `, [mwsRoundId, mwsCompId]);

    // Apply migration (1st run)
    await client.queryArray(migSql);

    // Verify 1st run output
    const compCheck = await client.queryObject<{ number_of_winners: number; winner_placement_labels: string[] }>(`
      SELECT number_of_winners, winner_placement_labels FROM public.competitions WHERE id = $1;
    `, [mwsCompId]);
    if (compCheck.rows[0].number_of_winners !== 3) {
      throw new Error(`Expected number_of_winners = 3, got: ${compCheck.rows[0].number_of_winners}`);
    }
    const expectedLabels = ['Reina', 'Virreina', 'Princesa'];
    if (JSON.stringify(compCheck.rows[0].winner_placement_labels) !== JSON.stringify(expectedLabels)) {
      throw new Error(`Expected placement labels ${JSON.stringify(expectedLabels)}, got: ${JSON.stringify(compCheck.rows[0].winner_placement_labels)}`);
    }

    const roundCheck = await client.queryObject<{ contestants_advance: number }>(`
      SELECT contestants_advance FROM public.voting_rounds WHERE id = $1;
    `, [mwsRoundId]);
    if (roundCheck.rows[0].contestants_advance !== 3) {
      throw new Error(`Expected contestants_advance = 3, got: ${roundCheck.rows[0].contestants_advance}`);
    }

    const critCheck = await client.queryObject<{ count: bigint; total_weight: number }>(`
      SELECT COUNT(*) as count, SUM(weight) as total_weight
      FROM public.judging_criteria
      WHERE competition_id = $1;
    `, [mwsCompId]);
    if (Number(critCheck.rows[0].count) !== 10) {
      throw new Error(`Expected 10 criteria, got: ${critCheck.rows[0].count}`);
    }
    if (Number(critCheck.rows[0].total_weight) !== 10) {
      throw new Error(`Expected total weight 10.00, got: ${critCheck.rows[0].total_weight}`);
    }

    // Apply migration (2nd run: exact rerun idempotency)
    await client.queryArray(migSql);

    // Criteria count must remain exactly 10 with zero error
    const critCheck2 = await client.queryObject<{ count: bigint }>(`
      SELECT COUNT(*) as count FROM public.judging_criteria WHERE competition_id = $1;
    `, [mwsCompId]);
    if (Number(critCheck2.rows[0].count) !== 10) {
      throw new Error(`Idempotency rerun failed: expected 10 criteria, got ${critCheck2.rows[0].count}`);
    }
  } finally {
    await client.end();
  }
});
