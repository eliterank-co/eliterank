import { Client } from 'https://deno.land/x/postgres@v0.17.0/mod.ts';

// Configurable via environment variables with fallback to local test database
const DB_CONFIG = {
  hostname: Deno.env.get('PGHOST') || 'localhost',
  port: parseInt(Deno.env.get('PGPORT') || '65322', 10),
  user: Deno.env.get('PGUSER') || 'postgres',
  password: Deno.env.get('PGPASSWORD') || 'postgres',
  database: Deno.env.get('PGDATABASE') || 'test_mws_judging',
};

async function createClient(): Promise<Client> {
  await ensureDatabaseInitialized();
  const client = new Client(DB_CONFIG);
  await client.connect();
  return client;
}

// Self-bootstraps the test database and migrations if not yet present
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
      await adminClient.queryArray(`CREATE DATABASE ${DB_CONFIG.database};`);
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

async function resetAndSetupBaseFixtures(client: Client) {
  await ensureDatabaseInitialized();

  // Reload authoritative migration to pick up any function changes
  const migMws = await Deno.readTextFile('supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql');
  await client.queryArray(migMws);

  // Clear tables
  await client.queryArray('DELETE FROM public.judge_scores;');
  await client.queryArray('DELETE FROM public.judging_criteria;');
  await client.queryArray('DELETE FROM public.judges;');
  await client.queryArray('DELETE FROM public.voting_rounds;');
  await client.queryArray('DELETE FROM public.contestants;');
  await client.queryArray('DELETE FROM public.competitions;');
  await client.queryArray('DELETE FROM public.organizations;');

  // Org & Competition
  const orgRes = await client.queryObject<{ id: string }>(`
    INSERT INTO public.organizations (name, slug)
    VALUES ('MWS Org', 'mws-org')
    RETURNING id;
  `);
  const orgId = orgRes.rows[0].id;

  const compRes = await client.queryObject<{ id: string }>(`
    INSERT INTO public.competitions (name, slug, organization_id, status, number_of_winners, winners_split_by_gender)
    VALUES ('Miss Woman Summer Test', 'mws-test', $1, 'voting', 3, false)
    RETURNING id;
  `, [orgId]);
  const compId = compRes.rows[0].id;

  // Active contestants
  const c1Res = await client.queryObject<{ id: string }>(`
    INSERT INTO public.contestants (competition_id, name, status, votes)
    VALUES ($1, 'Contestant 1', 'active', 100)
    RETURNING id;
  `, [compId]);
  const c1Id = c1Res.rows[0].id;

  const c2Res = await client.queryObject<{ id: string }>(`
    INSERT INTO public.contestants (competition_id, name, status, votes)
    VALUES ($1, 'Contestant 2', 'active', 80)
    RETURNING id;
  `, [compId]);
  const c2Id = c2Res.rows[0].id;

  const c3Res = await client.queryObject<{ id: string }>(`
    INSERT INTO public.contestants (competition_id, name, status, votes)
    VALUES ($1, 'Contestant 3', 'active', 60)
    RETURNING id;
  `, [compId]);
  const c3Id = c3Res.rows[0].id;

  // Final round with judge_weight = 100, ended 1 minute ago
  const roundRes = await client.queryObject<{ id: string }>(`
    INSERT INTO public.voting_rounds (
      competition_id, title, round_order, round_type,
      start_date, end_date, contestants_advance, judge_weight
    )
    VALUES (
      $1, 'Final Judging Round', 1, 'judging',
      NOW() - INTERVAL '2 hours',
      NOW() - INTERVAL '1 minute',
      3, 100
    )
    RETURNING id;
  `, [compId]);
  const roundId = roundRes.rows[0].id;

  return { orgId, compId, roundId, contestants: [c1Id, c2Id, c3Id] };
}

Deno.test('Readiness Barrier 1: Zero criteria blocks finalization', async () => {
  const client = await createClient();
  try {
    const { roundId } = await resetAndSetupBaseFixtures(client);

    let errorThrown = false;
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errorThrown = true;
      const msg = err.message || '';
      if (!msg.includes('no judging criteria configured') && !msg.includes('judging_criteria_missing')) {
        throw new Error(`Unexpected error message: ${msg}`);
      }
    }
    if (!errorThrown) throw new Error('Expected finalize_voting_round to fail on zero criteria');
    console.log('  ✓ Readiness Barrier 1 passed: zero criteria blocked finalization.');
  } finally {
    await client.end();
  }
});

Deno.test('Readiness Barrier 2: Zero judges blocks finalization', async () => {
  const client = await createClient();
  try {
    const { compId, roundId } = await resetAndSetupBaseFixtures(client);

    // Add criterion
    await client.queryArray(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1);
    `, [compId]);

    let errorThrown = false;
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errorThrown = true;
      const msg = err.message || '';
      if (!msg.includes('no active (non-hidden) judges') && !msg.includes('judges_missing')) {
        throw new Error(`Unexpected error message: ${msg}`);
      }
    }
    if (!errorThrown) throw new Error('Expected finalize_voting_round to fail on zero judges');
    console.log('  ✓ Readiness Barrier 2 passed: zero judges blocked finalization.');
  } finally {
    await client.end();
  }
});

Deno.test('Readiness Barrier 3: Unclaimed judge blocks finalization', async () => {
  const client = await createClient();
  try {
    const { compId, roundId } = await resetAndSetupBaseFixtures(client);

    // Add criterion
    await client.queryArray(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1);
    `, [compId]);

    // Add unclaimed judge (claimed_at IS NULL, user_id IS NULL)
    await client.queryArray(`
      INSERT INTO public.judges (competition_id, name, email, claimed_at, user_id, hidden)
      VALUES ($1, 'Judge Unclaimed', 'judge@example.com', NULL, NULL, false);
    `, [compId]);

    let errorThrown = false;
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errorThrown = true;
      const msg = err.message || '';
      if (!msg.includes('unclaimed active judge') && !msg.includes('unclaimed_judges')) {
        throw new Error(`Unexpected error message: ${msg}`);
      }
    }
    if (!errorThrown) throw new Error('Expected finalize_voting_round to fail on unclaimed judge');
    console.log('  ✓ Readiness Barrier 3 passed: unclaimed judge blocked finalization.');
  } finally {
    await client.end();
  }
});

Deno.test('Readiness Barrier 4: Incomplete scoring matrix blocks finalization', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestants } = await resetAndSetupBaseFixtures(client);

    // Add 2 criteria
    const crit1 = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Criterion 1', 1.0, 1) RETURNING id;
    `, [compId]);
    const crit2 = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Criterion 2', 1.0, 2) RETURNING id;
    `, [compId]);

    // Add claimed judge
    const judgeRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, claimed_at, user_id, hidden)
      VALUES ($1, 'Judge Claimed', 'judge@example.com', NOW(), gen_random_uuid(), false)
      RETURNING id;
    `, [compId]);
    const judgeId = judgeRes.rows[0].id;

    // Only score contestant 1 on criterion 1 (leaving c2, c3, and criterion 2 un-scored)
    await client.queryArray(`
      INSERT INTO public.judge_scores (
        competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at
      )
      VALUES ($1, $2, $3, $4, $5, 9, NOW());
    `, [compId, roundId, judgeId, contestants[0], crit1.rows[0].id]);

    let errorThrown = false;
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errorThrown = true;
      const msg = err.message || '';
      if (!msg.includes('missing') && !msg.includes('incomplete_score_matrix')) {
        throw new Error(`Unexpected error message: ${msg}`);
      }
    }
    if (!errorThrown) throw new Error('Expected finalize_voting_round to fail on incomplete score matrix');
    console.log('  ✓ Readiness Barrier 4 passed: incomplete matrix blocked finalization.');
  } finally {
    await client.end();
  }
});

Deno.test('Readiness Barrier 5: Draft (unsubmitted) scores block finalization', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestants } = await resetAndSetupBaseFixtures(client);

    // Add 1 criterion
    const critRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Elegance', 1.0, 1) RETURNING id;
    `, [compId]);
    const critId = critRes.rows[0].id;

    // Add claimed judge
    const judgeRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, claimed_at, user_id, hidden)
      VALUES ($1, 'Judge Claimed', 'judge@example.com', NOW(), gen_random_uuid(), false)
      RETURNING id;
    `, [compId]);
    const judgeId = judgeRes.rows[0].id;

    // Insert scores for all 3 contestants, but leave one as draft (submitted_at IS NULL)
    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES ($1, $2, $3, $4, $5, 8, NOW());
    `, [compId, roundId, judgeId, contestants[0], critId]);

    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES ($1, $2, $3, $4, $5, 9, NOW());
    `, [compId, roundId, judgeId, contestants[1], critId]);

    await client.queryArray(`
      INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
      VALUES ($1, $2, $3, $4, $5, 7, NULL); -- DRAFT
    `, [compId, roundId, judgeId, contestants[2], critId]);

    let errorThrown = false;
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch (err: any) {
      errorThrown = true;
      const msg = err.message || '';
      if (!msg.includes('unsubmitted draft score') && !msg.includes('unsubmitted_draft_scores')) {
        throw new Error(`Unexpected error message: ${msg}`);
      }
    }
    if (!errorThrown) throw new Error('Expected finalize_voting_round to fail on draft scores');
    console.log('  ✓ Readiness Barrier 5 passed: draft score blocked finalization.');
  } finally {
    await client.end();
  }
});

Deno.test('Readiness Barrier 6: Complete submitted matrix allows finalization and crowns winners', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestants } = await resetAndSetupBaseFixtures(client);

    // Add criterion
    const critRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Elegance', 1.0, 1) RETURNING id;
    `, [compId]);
    const critId = critRes.rows[0].id;

    // Add claimed judge
    const judgeRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, claimed_at, user_id, hidden)
      VALUES ($1, 'Judge Claimed', 'judge@example.com', NOW(), gen_random_uuid(), false)
      RETURNING id;
    `, [compId]);
    const judgeId = judgeRes.rows[0].id;

    // Submit all scores
    for (let i = 0; i < contestants.length; i++) {
      await client.queryArray(`
        INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW());
      `, [compId, roundId, judgeId, contestants[i], critId, 10 - i]);
    }

    // Finalize should succeed!
    const res = await client.queryObject<{ finalize_voting_round: any }>(`
      SELECT finalize_voting_round($1);
    `, [roundId]);

    const result = res.rows[0].finalize_voting_round;
    if (!result?.finalized) {
      throw new Error(`Expected finalized: true, got: ${JSON.stringify(result)}`);
    }

    // Check round is finalized
    const roundCheck = await client.queryObject<{ finalized_at: string }>(`
      SELECT finalized_at FROM public.voting_rounds WHERE id = $1;
    `, [roundId]);
    if (!roundCheck.rows[0].finalized_at) {
      throw new Error('Round finalized_at should not be null');
    }

    // Check competition completed with winners
    const compCheck = await client.queryObject<{ status: string; winners: string[] }>(`
      SELECT status, winners FROM public.competitions WHERE id = $1;
    `, [compId]);
    if (compCheck.rows[0].status !== 'completed') {
      throw new Error(`Expected status completed, got: ${compCheck.rows[0].status}`);
    }
    if (compCheck.rows[0].winners.length !== 3) {
      throw new Error(`Expected 3 winners, got: ${compCheck.rows[0].winners.length}`);
    }

    console.log('  ✓ Readiness Barrier 6 passed: complete submitted matrix finalized round and crowned 3 winners.');
  } finally {
    await client.end();
  }
});

Deno.test('Readiness Barrier 7: Hidden preview judges are excluded from readiness check', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestants } = await resetAndSetupBaseFixtures(client);

    // Add criterion
    const critRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Elegance', 1.0, 1) RETURNING id;
    `, [compId]);
    const critId = critRes.rows[0].id;

    // Add claimed active judge with complete submitted scores
    const judgeRes = await client.queryObject<{ id: string }>(`
      INSERT INTO public.judges (competition_id, name, email, claimed_at, user_id, hidden)
      VALUES ($1, 'Active Judge', 'judge@example.com', NOW(), gen_random_uuid(), false)
      RETURNING id;
    `, [compId]);
    const judgeId = judgeRes.rows[0].id;

    for (let i = 0; i < contestants.length; i++) {
      await client.queryArray(`
        INSERT INTO public.judge_scores (competition_id, voting_round_id, judge_id, contestant_id, criterion_id, score, submitted_at)
        VALUES ($1, $2, $3, $4, $5, 9, NOW());
      `, [compId, roundId, judgeId, contestants[i], critId]);
    }

    // Add HIDDEN preview judge who is UNCLAIMED and has ZERO scores
    await client.queryArray(`
      INSERT INTO public.judges (competition_id, name, email, claimed_at, user_id, hidden)
      VALUES ($1, 'Hidden Preview Judge', 'preview@example.com', NULL, NULL, true);
    `, [compId]);

    // Finalize should succeed! Hidden judge does not participate in readiness.
    const res = await client.queryObject<{ finalize_voting_round: any }>(`
      SELECT finalize_voting_round($1);
    `, [roundId]);

    if (!res.rows[0].finalize_voting_round?.finalized) {
      throw new Error('Expected finalization to succeed despite unclaimed hidden judge');
    }

    console.log('  ✓ Readiness Barrier 7 passed: hidden preview judge excluded from readiness checks.');
  } finally {
    await client.end();
  }
});

Deno.test('Readiness Barrier 8: Pure-vote rounds (judge_weight = 0) are completely unaffected', async () => {
  const client = await createClient();
  try {
    const { compId, contestants } = await resetAndSetupBaseFixtures(client);

    // Insert a pure-vote round (judge_weight = 0), NO criteria, NO judges
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

    // Finalization must succeed without any criteria or judges
    const res = await client.queryObject<{ finalize_voting_round: any }>(`
      SELECT finalize_voting_round($1);
    `, [pureRoundId]);

    if (!res.rows[0].finalize_voting_round?.finalized) {
      throw new Error('Expected pure-vote round to finalize cleanly');
    }

    console.log('  ✓ Readiness Barrier 8 passed: pure-vote round finalized without judging criteria or judges.');
  } finally {
    await client.end();
  }
});

Deno.test('Readiness Barrier 9: Transaction rollback guarantees zero partial mutations on failure', async () => {
  const client = await createClient();
  try {
    const { compId, roundId, contestants } = await resetAndSetupBaseFixtures(client);

    // Add criterion, but NO judges (so barrier will fail on judges_missing)
    await client.queryArray(`
      INSERT INTO public.judging_criteria (competition_id, label, weight, sort_order)
      VALUES ($1, 'Stage Presence', 1.0, 1);
    `, [compId]);

    // Initial state snapshot
    const initialComp = await client.queryObject<{ status: string; winners: any }>(`
      SELECT status, winners FROM public.competitions WHERE id = $1;
    `, [compId]);
    const initialRound = await client.queryObject<{ finalized_at: any }>(`
      SELECT finalized_at FROM public.voting_rounds WHERE id = $1;
    `, [roundId]);
    const initialContestants = await client.queryObject<{ id: string; status: string }>(`
      SELECT id, status FROM public.contestants WHERE competition_id = $1;
    `, [compId]);

    // Attempt finalization (must fail)
    let threw = false;
    try {
      await client.queryArray('SELECT finalize_voting_round($1);', [roundId]);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected finalize_voting_round to fail');

    // Verify ZERO mutations survived
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

    console.log('  ✓ Readiness Barrier 9 passed: full transaction rollback verified, 0 mutations survived failure.');
  } finally {
    await client.end();
  }
});

Deno.test('Miss Woman Summer Configuration: Idempotently configures 3 winners and 10 criteria', async () => {
  const client = await createClient();
  try {
    await ensureDatabaseInitialized();

    const mwsCompId = '16276ff8-be5b-47c5-8178-2d463fb7dcc3';
    const mwsRoundId = '85373939-f51b-48df-86ca-cbdaeca51663';

    // Clear any previous MWS test records
    await client.queryArray('DELETE FROM public.judging_criteria WHERE competition_id = $1;', [mwsCompId]);
    await client.queryArray('DELETE FROM public.voting_rounds WHERE id = $1;', [mwsRoundId]);
    await client.queryArray('DELETE FROM public.competitions WHERE id = $1;', [mwsCompId]);

    // Insert baseline MWS records (representing live state before migration)
    await client.queryArray(`
      INSERT INTO public.competitions (id, name, slug, number_of_winners, status)
      VALUES ($1, 'Miss Woman Summer Chicago 2026', 'miss-woman-summer-chi-26', 1, 'voting');
    `, [mwsCompId]);

    await client.queryArray(`
      INSERT INTO public.voting_rounds (id, competition_id, title, round_order, round_type, start_date, end_date, contestants_advance, judge_weight)
      VALUES ($1, $2, 'Final Round', 1, 'judging', NOW() - INTERVAL '1 day', NOW() + INTERVAL '1 day', 1, 100);
    `, [mwsRoundId, mwsCompId]);

    // Apply the MWS configuration from the migration
    const migSql = await Deno.readTextFile('supabase/migrations/20260905000000_mws_judging_readiness_and_placement_labels.sql');
    await client.queryArray(migSql);

    // Verify competition configuration
    const compRes = await client.queryObject<{ number_of_winners: number; winner_placement_labels: string[] }>(`
      SELECT number_of_winners, winner_placement_labels FROM public.competitions WHERE id = $1;
    `, [mwsCompId]);
    if (compRes.rows[0].number_of_winners !== 3) {
      throw new Error(`Expected number_of_winners = 3, got: ${compRes.rows[0].number_of_winners}`);
    }
    const expectedLabels = ['Reina', 'Virreina', 'Princesa'];
    if (JSON.stringify(compRes.rows[0].winner_placement_labels) !== JSON.stringify(expectedLabels)) {
      throw new Error(`Expected placement labels ${JSON.stringify(expectedLabels)}, got: ${JSON.stringify(compRes.rows[0].winner_placement_labels)}`);
    }

    // Verify round configuration
    const roundRes = await client.queryObject<{ contestants_advance: number }>(`
      SELECT contestants_advance FROM public.voting_rounds WHERE id = $1;
    `, [mwsRoundId]);
    if (roundRes.rows[0].contestants_advance !== 3) {
      throw new Error(`Expected contestants_advance = 3, got: ${roundRes.rows[0].contestants_advance}`);
    }

    // Verify criteria count and weights
    const critRes = await client.queryObject<{ count: bigint; total_weight: number }>(`
      SELECT COUNT(*) as count, SUM(weight) as total_weight
      FROM public.judging_criteria
      WHERE competition_id = $1;
    `, [mwsCompId]);
    if (Number(critRes.rows[0].count) !== 10) {
      throw new Error(`Expected 10 criteria, got: ${critRes.rows[0].count}`);
    }
    if (Number(critRes.rows[0].total_weight) !== 10) {
      throw new Error(`Expected total weight 10.00, got: ${critRes.rows[0].total_weight}`);
    }

    // Re-run migration SQL to verify idempotency (no duplicate criteria or errors)
    await client.queryArray(migSql);
    const critRes2 = await client.queryObject<{ count: bigint }>(`
      SELECT COUNT(*) as count FROM public.judging_criteria WHERE competition_id = $1;
    `, [mwsCompId]);
    if (Number(critRes2.rows[0].count) !== 10) {
      throw new Error(`Idempotency failed: expected 10 criteria on re-run, got ${critRes2.rows[0].count}`);
    }

    console.log('  ✓ MWS configuration verified: 3 winners, [Reina, Virreina, Princesa], 10 criteria with equal weight 1.0, 100% idempotent.');
  } finally {
    await client.end();
  }
});
