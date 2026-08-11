import React, { useMemo, useState, useEffect } from 'react';
import { BarChart3, Crown, Lock, AlertTriangle, Clock } from 'lucide-react';
import { Avatar, Panel } from '../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { blendedScores } from '../../../lib/judgingScore';

/**
 * JudgingResultsPanel — host-side view of how contestants are doing in
 * judging-enabled rounds.
 *
 * Aggregation per round:
 *  - judgeTotal(c)        = avg across submitted judges of Σ(score × weight)
 *  - normJudges(c)        = judgeTotal(c) / max(judgeTotal in bucket)
 *  - normVotes(c)         = votes(c)      / max(votes in bucket)
 *  - finalScore(c)        = (jw/100) · normJudges + ((100-jw)/100) · normVotes
 *  - Sort desc, top `contestants_advance` advance.
 *
 * When `splitByGender` is on, the max used to normalize is the per-gender
 * maximum, mirroring finalize_voting_round(); the shared blendedScores helper
 * keeps this preview and the server-side finalization identical.
 *
 * Only counts judge_scores rows that have `submitted_at` set, so draft scores
 * never affect the leaderboard.
 */
export default function JudgingResultsPanel({
  contestants = [],
  judges = [],
  judgingCriteria = [],
  judgeScores = [],
  votingRounds = [],
  splitByGender = false,
}) {
  // Restrict to rounds with judges enabled
  const judgingRounds = useMemo(() => (
    [...votingRounds]
      .filter(r => (r.judge_weight || 0) > 0)
      .sort((a, b) => (a.round_order || 0) - (b.round_order || 0))
  ), [votingRounds]);

  const [activeRoundId, setActiveRoundId] = useState(judgingRounds[0]?.id || null);

  // Sync default when rounds load
  useEffect(() => {
    if (!activeRoundId && judgingRounds.length > 0) {
      setActiveRoundId(judgingRounds[0].id);
    }
  }, [judgingRounds, activeRoundId]);

  const round = judgingRounds.find(r => r.id === activeRoundId) || judgingRounds[0] || null;
  const roundId = round?.id || null;
  const judgeWeight = round?.judge_weight || 0;

  // Build judge × contestant totals using only submitted rows.
  // judgeTotalByContestant[contestantId] = [judgeTotal, judgeTotal, …]
  const judgeTotalsByContestant = useMemo(() => {
    if (!roundId) return {};
    const out = {};
    const criterionWeight = new Map(judgingCriteria.map(c => [c.id, c.weight || 1]));
    const submittedScoresForRound = judgeScores.filter(s => s.votingRoundId === roundId && s.submittedAt);
    const byJudge = new Map();
    for (const s of submittedScoresForRound) {
      if (!byJudge.has(s.judgeId)) byJudge.set(s.judgeId, new Map());
      const perContestant = byJudge.get(s.judgeId);
      if (!perContestant.has(s.contestantId)) perContestant.set(s.contestantId, 0);
      perContestant.set(s.contestantId, perContestant.get(s.contestantId) + s.score * (criterionWeight.get(s.criterionId) || 1));
    }
    for (const [, perContestant] of byJudge.entries()) {
      for (const [cid, total] of perContestant.entries()) {
        if (!out[cid]) out[cid] = [];
        out[cid].push(total);
      }
    }
    return out;
  }, [judgeScores, judgingCriteria, roundId]);

  const submittedJudgeCount = useMemo(() => {
    if (!roundId) return 0;
    const set = new Set();
    judgeScores.forEach(s => {
      if (s.votingRoundId === roundId && s.submittedAt) set.add(s.judgeId);
    });
    return set.size;
  }, [judgeScores, roundId]);

  const leaderboard = useMemo(() => {
    // Build one row per contestant (maxes are taken over the whole active
    // field, like the SQL), then keep only the judged ones for display.
    const rows = contestants.map((c) => {
      const arr = judgeTotalsByContestant[c.id] || [];
      const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      return {
        contestant: c,
        gender: c.gender ?? null,
        judgeAvg: avg,
        votes: c.votes || 0,
        hasScores: arr.length > 0,
      };
    });
    return blendedScores({ rows, judgeWeight, splitByGender })
      .filter((r) => r.hasScores)
      .sort((a, b) => b.final - a.final);
  }, [contestants, judgeTotalsByContestant, judgeWeight, splitByGender]);

  if (judgingRounds.length === 0 || !round) {
    return null;
  }

  const advanceCount = round.contestants_advance || 0;

  return (
    <Panel
      title="Judging Results"
      icon={BarChart3}
      collapsible
      defaultCollapsed
    >
      <div style={{ padding: spacing.xl }}>
        {/* Round tabs — hidden when only one judging round exists */}
        {judgingRounds.length > 1 && (
          <div style={{ display: 'flex', gap: spacing.xs, marginBottom: spacing.lg, flexWrap: 'wrap' }}>
            {judgingRounds.map((r) => (
              <button
                key={r.id}
                onClick={() => setActiveRoundId(r.id)}
                style={{
                  padding: `${spacing.xs} ${spacing.md}`,
                  borderRadius: borderRadius.full,
                  border: `1px solid ${activeRoundId === r.id ? colors.gold.primary : colors.border.primary}`,
                  background: activeRoundId === r.id ? 'rgba(212,175,55,0.12)' : 'transparent',
                  color: activeRoundId === r.id ? colors.gold.primary : colors.text.secondary,
                  fontSize: typography.fontSize.sm,
                  cursor: 'pointer',
                }}
              >
                {r.title || `Round ${r.round_order || ''}`}
              </button>
            ))}
          </div>
        )}
        {judgingRounds.length === 1 && (
          <div style={{
            fontSize: typography.fontSize.xs,
            color: colors.text.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            marginBottom: spacing.sm,
          }}>
            Judging round: {round.title || `Round ${round.round_order || ''}`}
          </div>
        )}

        <div style={{
          fontSize: typography.fontSize.sm,
          color: colors.text.secondary,
          marginBottom: spacing.md,
        }}>
          {judgeWeight === 100
            ? 'Judges decide who advances this round.'
            : judgeWeight === 0
            ? 'Votes decide this round (no judging weight set).'
            : `Blended: ${judgeWeight}% judges + ${100 - judgeWeight}% votes`}
          {' · '}
          {submittedJudgeCount} of {judges.length} judges have submitted
          {advanceCount > 0 && ` · top ${advanceCount} advance (highlighted below)`}
        </div>

        {/* Finalization banner — set automatically by ensure_round_state()
            after end_date passes and the next visitor hits the public page. */}
        {(() => {
          const now = Date.now();
          const endTime = round.end_date ? new Date(round.end_date).getTime() : null;
          const finalized = !!round.finalized_at;
          const ended = endTime !== null && endTime <= now;
          const judgesMissing = submittedJudgeCount < judges.length;
          if (finalized) {
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: spacing.sm,
                padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md,
                background: 'rgba(34,197,94,0.08)',
                border: `1px solid rgba(34,197,94,0.3)`,
                color: colors.status.success,
                fontSize: typography.fontSize.sm,
              }}>
                <Lock size={16} />
                Round finalized {new Date(round.finalized_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}.
                Advance / elimination decisions are locked in below.
              </div>
            );
          }
          if (ended && !finalized) {
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: spacing.sm,
                padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md,
                background: 'rgba(245,158,11,0.08)',
                border: `1px solid rgba(245,158,11,0.3)`,
                color: colors.status.warning,
                fontSize: typography.fontSize.sm,
              }}>
                <Clock size={16} />
                Round ended. Finalization runs automatically on the next public-page visit or vote — refresh the page in a moment.
              </div>
            );
          }
          if (!ended && judgesMissing) {
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: spacing.sm,
                padding: spacing.md, borderRadius: borderRadius.md, marginBottom: spacing.md,
                background: 'rgba(245,158,11,0.05)',
                border: `1px solid rgba(245,158,11,0.2)`,
                color: colors.status.warning,
                fontSize: typography.fontSize.sm,
              }}>
                <AlertTriangle size={16} />
                {judges.length - submittedJudgeCount} judge{judges.length - submittedJudgeCount === 1 ? '' : 's'} haven&rsquo;t submitted yet. Drafts don&rsquo;t count toward the final score — chase them down before {round.end_date ? new Date(round.end_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'the round ends'}.
              </div>
            );
          }
          return null;
        })()}

        {/* Leaderboard */}
        <div style={{
          overflowX: 'auto',
          background: colors.background.card,
          border: `1px solid ${colors.border.primary}`,
          borderRadius: borderRadius.md,
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: typography.fontSize.sm }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${colors.border.primary}`, color: colors.text.muted, textAlign: 'left' }}>
                <th style={{ padding: spacing.sm, textAlign: 'center', width: 50 }}>#</th>
                <th style={{ padding: spacing.sm }}>Contestant</th>
                <th style={{ padding: spacing.sm, textAlign: 'right' }}>Judge avg</th>
                <th style={{ padding: spacing.sm, textAlign: 'right' }}>Votes</th>
                <th style={{ padding: spacing.sm, textAlign: 'right' }}>Final</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: spacing.xl, textAlign: 'center', color: colors.text.muted }}>
                    {contestants.length === 0
                      ? 'No contestants yet.'
                      : 'No judge scores submitted yet. Results will appear here once judges start submitting.'}
                  </td>
                </tr>
              )}
              {leaderboard.map((row, idx) => {
                const advancing = advanceCount > 0 && idx < advanceCount;
                return (
                  <tr
                    key={row.contestant.id}
                    style={{
                      borderTop: idx === 0 ? 'none' : `1px solid ${colors.border.secondary}`,
                      background: advancing ? 'rgba(212,175,55,0.06)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: spacing.sm, textAlign: 'center', color: advancing ? colors.gold.primary : colors.text.muted, fontWeight: typography.fontWeight.semibold }}>
                      {advancing ? <Crown size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} /> : ''}
                      {idx + 1}
                    </td>
                    <td style={{ padding: spacing.sm }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
                        <Avatar name={row.contestant.name} src={row.contestant.avatarUrl} size={28} />
                        <span style={{ fontWeight: advancing ? typography.fontWeight.semibold : typography.fontWeight.regular }}>
                          {row.contestant.name}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: spacing.sm, textAlign: 'right', color: colors.text.secondary }}>
                      {row.judgeAvg > 0 ? row.judgeAvg.toFixed(1) : '—'}
                    </td>
                    <td style={{ padding: spacing.sm, textAlign: 'right', color: colors.text.secondary }}>
                      {row.votes}
                    </td>
                    <td style={{ padding: spacing.sm, textAlign: 'right', color: advancing ? colors.gold.primary : colors.text.primary, fontWeight: typography.fontWeight.semibold }}>
                      {row.final > 0 ? row.final.toFixed(3) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>
    </Panel>
  );
}
