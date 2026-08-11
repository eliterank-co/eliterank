/**
 * Blended judging + vote scoring — the JavaScript mirror of the Postgres
 * `finalize_voting_round()` function.
 *
 * For each contestant we combine two normalized components:
 *   normJudges = judgeAvg / max(judgeAvg within the contestant's bucket)
 *   normVotes  = votes    / max(votes    within the contestant's bucket)
 *   final      = (jw/100) · normJudges + ((100 − jw)/100) · normVotes
 *
 * The "bucket" is the gender division when `winners_split_by_gender` is on —
 * each gender is normalized against its own top scorer, matching the
 * per-division rule contestants are told about — and a single global bucket
 * otherwise. Keeping this in one tested helper means the host-side results
 * preview (JudgingResultsPanel) and the server-side finalization can't drift.
 *
 * Kept intentionally in lockstep with
 * supabase/migrations/20260811000000_120_finalize_last_round_crowning_and_gender_normalization.sql
 */

const GLOBAL_BUCKET = '__all__';
const NO_GENDER_BUCKET = '__none__';

/**
 * The normalization bucket a contestant falls into.
 * @param {?string} gender
 * @param {boolean} splitByGender
 * @returns {string}
 */
export function bucketKey(gender, splitByGender) {
  if (!splitByGender) return GLOBAL_BUCKET;
  return gender ?? NO_GENDER_BUCKET;
}

/**
 * Compute blended final scores with per-bucket normalization.
 *
 * @param {Object} opts
 * @param {Array<{votes?:number, gender?:?string, judgeAvg?:number}>} opts.rows
 *   One entry per contestant. Extra fields are preserved on the output.
 * @param {number} opts.judgeWeight   Judges' weight for the round, 0–100.
 * @param {boolean} [opts.splitByGender=false]
 * @returns {Array} rows annotated with { normJudges, normVotes, final }.
 */
export function blendedScores({ rows = [], judgeWeight = 0, splitByGender = false }) {
  const jw = judgeWeight / 100;
  const vw = (100 - judgeWeight) / 100;

  const maxJudge = new Map();
  const maxVotes = new Map();
  for (const r of rows) {
    const bucket = bucketKey(r.gender ?? null, splitByGender);
    const ja = r.judgeAvg || 0;
    const v = r.votes || 0;
    if (ja > (maxJudge.get(bucket) || 0)) maxJudge.set(bucket, ja);
    if (v > (maxVotes.get(bucket) || 0)) maxVotes.set(bucket, v);
  }

  return rows.map((r) => {
    const bucket = bucketKey(r.gender ?? null, splitByGender);
    const mj = maxJudge.get(bucket) || 0;
    const mv = maxVotes.get(bucket) || 0;
    const normJudges = mj > 0 ? (r.judgeAvg || 0) / mj : 0;
    const normVotes = mv > 0 ? (r.votes || 0) / mv : 0;
    return { ...r, normJudges, normVotes, final: jw * normJudges + vw * normVotes };
  });
}
