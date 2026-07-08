import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  Calendar, Vote, Plus, Trash2, AlertTriangle, Save,
  Clock, Activity, Trophy, Archive, FileEdit, Lock, Info, Sparkles, Award
} from 'lucide-react';
import { Button, Badge } from '../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { useResponsive } from '../../../hooks/useResponsive';
import { supabase } from '../../../lib/supabase';
import { useToast } from '../../../contexts/ToastContext';
import {
  COMPETITION_STATUS,
  STATUS_CONFIG,
  DEFAULT_VOTING_ROUND,
  DEFAULT_NOMINATION_PERIOD,
  ROUND_TYPE_CONFIG,
} from '../../../types/competition';
import {
  getStatusChangeRestriction,
  getNextAutoTransition,
} from '../../../utils/competitionStatusEngine';
import { renumberVotingTitles } from '../../../utils/renumberVotingTitles';
import { getVotingBeforeNominationsWarning } from '../../../utils/votingScheduleWarnings';
import { SkeletonPulse, SkeletonText } from '../../../components/common/Skeleton';

/**
 * Parse a typed date string into an ISO date string
 * Supports formats like:
 * - "Jan 15, 2025 6:00 PM"
 * - "1/15/2025 6pm"
 * - "2025-01-15 18:00"
 * - "January 15 2025 6:00pm"
 */
function parseTypedDate(input) {
  if (!input || !input.trim()) return null;

  const str = input.trim();

  // A complete ISO instant with an explicit timezone — keep its exact instant.
  // Naive strings (no offset) fall through and are parsed as UTC wall-clock
  // below, matching the nomination editor / datetime-local convention.
  let date;
  if (/\d{4}-\d{2}-\d{2}t\d{2}:\d{2}.*(z|[+-]\d{2}:?\d{2})$/i.test(str)) {
    date = new Date(str);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Normalize common patterns
  let normalized = str
    .replace(/\s+/g, ' ')
    .replace(/,/g, '')
    .toLowerCase();

  // Month name mappings
  const months = {
    jan: 0, january: 0,
    feb: 1, february: 1,
    mar: 2, march: 2,
    apr: 3, april: 3,
    may: 4,
    jun: 5, june: 5,
    jul: 6, july: 6,
    aug: 7, august: 7,
    sep: 8, sept: 8, september: 8,
    oct: 9, october: 9,
    nov: 10, november: 10,
    dec: 11, december: 11,
  };

  // Pattern: "Jan 15 2025 6:00 PM" or "January 15 2025 6pm"
  const monthNamePattern = /^(\w+)\s+(\d{1,2})\s+(\d{4})\s*(.*)$/;
  let match = normalized.match(monthNamePattern);
  if (match) {
    const monthStr = match[1];
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const timeStr = match[4];
    const month = months[monthStr];

    if (month !== undefined && day >= 1 && day <= 31) {
      const { hours, minutes } = parseTime(timeStr);
      date = new Date(Date.UTC(year, month, day, hours, minutes));
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  // Pattern: "1/15/2025 6:00 PM" or "01/15/2025 6pm"
  const slashPattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s*(.*)$/;
  match = normalized.match(slashPattern);
  if (match) {
    const month = parseInt(match[1], 10) - 1;
    const day = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    const timeStr = match[4];

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const { hours, minutes } = parseTime(timeStr);
      date = new Date(Date.UTC(year, month, day, hours, minutes));
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  // Pattern: "2025-01-15 6:00 PM"
  const dashPattern = /^(\d{4})-(\d{1,2})-(\d{1,2})\s*(.*)$/;
  match = normalized.match(dashPattern);
  if (match) {
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const timeStr = match[4];

    if (month >= 0 && month <= 11 && day >= 1 && day <= 31) {
      const { hours, minutes } = parseTime(timeStr);
      date = new Date(Date.UTC(year, month, day, hours, minutes));
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }
  }

  return null;
}

/**
 * Parse time string like "6pm", "6:00 PM", "18:00"
 */
function parseTime(timeStr) {
  if (!timeStr || !timeStr.trim()) {
    return { hours: 0, minutes: 0 };
  }

  const str = timeStr.trim().toLowerCase();

  // Check for AM/PM
  const isPM = str.includes('pm');
  const isAM = str.includes('am');
  const cleanTime = str.replace(/[ap]m/g, '').trim();

  // Parse hours:minutes or just hours
  const timeParts = cleanTime.split(':');
  let hours = parseInt(timeParts[0], 10) || 0;
  const minutes = parseInt(timeParts[1], 10) || 0;

  // Convert to 24-hour format
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return { hours, minutes };
}

/**
 * Format an ISO date for display
 */
function formatDateForDisplay(isoDate) {
  if (!isoDate) return '';

  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return '';

  // Read UTC components (naive wall-clock), matching how the nomination editor
  // and the datetime-local inputs store/show times. This keeps a time shown as
  // "7:04 AM" identical across nominations, voting and the finale instead of
  // drifting by the viewer's UTC offset.
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();

  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;

  const minuteStr = minutes.toString().padStart(2, '0');

  return `${month} ${day}, ${year} ${hours}:${minuteStr} ${ampm}`;
}

// Static styles — module-level so they aren't reallocated per render and so the
// memoized VotingRoundCard (below) can reference them directly.
const sectionStyle = {
  background: colors.background.secondary,
  borderRadius: borderRadius.lg,
  padding: spacing.lg,
  marginBottom: spacing.lg,
};
const labelStyle = {
  display: 'block',
  fontSize: typography.fontSize.sm,
  color: colors.text.secondary,
  marginBottom: spacing.xs,
  fontWeight: typography.fontWeight.medium,
};
const inputStyle = {
  width: '100%',
  padding: spacing.md,
  background: colors.background.card,
  border: `1px solid ${colors.border.light}`,
  borderRadius: borderRadius.md,
  color: '#fff',
  fontSize: typography.fontSize.md,
  outline: 'none',
};

// ISO timestamptz ↔ <input type="datetime-local"> value, using the same naive
// wall-clock (UTC) convention as the nomination editor so times don't shift.
function toDateInput(iso) {
  return iso ? String(iso).slice(0, 16) : '';
}
function fromDateInput(local) {
  if (!local) return null;
  const withSecs = local.length === 16 ? `${local}:00` : local;
  const d = new Date(`${withSecs}Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// One voting-round card, memoized so editing a field only re-renders that row
// (not every card on each keystroke). Props are referentially stable: `round`
// keeps its identity for untouched rows, and onUpdate/onRemove are useCallback'd.
const VotingRoundCard = memo(function VotingRoundCard({ round, index, pos, isLastRound, isMobile, usesJudges, onUpdate, onRemove, onSetBlend, onSetSeparate, onSetWeight }) {
  const roundConfig = ROUND_TYPE_CONFIG[round.round_type] || ROUND_TYPE_CONFIG.voting;
  const judgeWeight = round.judge_weight || 0;
  const isJudgingType = (round.round_type || 'voting') === 'judging';
  // "Judged" is a property of the round itself (its judge_weight / type) — never
  // of its position. Tying it to position is what made judging look like it
  // "disappeared" when a host added a round after the judged one.
  const judged = judgeWeight > 0 || isJudgingType;
  // "Judges only" is a property of the round TYPE (a dedicated judging round),
  // not the blend weight — a blended 'voting' round dialed to 100% is still
  // "Judges 100% · Votes 0%", not a judges-only round.
  const judgesOnly = isJudgingType;
  const decides = isLastRound; // the final (last) round is where winners are crowned
  // Flag the confusing state directly on the card: a judged competition whose
  // final round has no judging set up yet.
  const judgingMissingOnFinal = usesJudges && decides && !judged;
  const accentColor = decides || judged ? colors.gold.primary : roundConfig.color;
  const tagBase = {
    display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap',
    padding: `2px ${spacing.sm}`, borderRadius: borderRadius.sm,
    fontSize: '10px', fontWeight: typography.fontWeight.semibold,
  };
  return (
    <div
      style={{
        background: colors.background.card,
        borderRadius: borderRadius.md,
        padding: spacing.md,
        border: `1px solid ${accentColor}33`,
        borderLeft: `3px solid ${accentColor}`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.semibold, color: colors.text.muted, whiteSpace: 'nowrap' }}>
            Round {pos + 1}
          </span>
          <input
            type="text"
            value={round.title}
            onChange={(e) => onUpdate(index, 'title', e.target.value)}
            placeholder={`Round ${pos + 1}`}
            style={{ ...inputStyle, background: 'transparent', border: 'none', padding: 0, fontWeight: typography.fontWeight.medium, flex: 1, minWidth: 0 }}
          />
          {decides && (
            <span style={{ ...tagBase, background: 'rgba(212,175,55,0.12)', border: `1px solid ${colors.gold.primary}55`, color: colors.gold.primary }}>
              <Trophy size={11} /> Decides winners
            </span>
          )}
          {judged && (
            <span style={{ ...tagBase, background: 'rgba(212,175,55,0.12)', border: `1px solid ${colors.gold.primary}55`, color: colors.gold.primary }}>
              <Award size={11} /> {judgesOnly ? 'Judges only' : `Judges ${judgeWeight}% · Votes ${100 - judgeWeight}%`}
            </span>
          )}
          {judgingMissingOnFinal && (
            <span style={{ ...tagBase, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.45)', color: '#ef4444' }}>
              <AlertTriangle size={11} /> Judging not set
            </span>
          )}
        </div>
        <button
          onClick={() => onRemove(index)}
          title="Remove round"
          style={{ background: 'rgba(239,68,68,0.1)', border: 'none', borderRadius: borderRadius.sm, padding: spacing.xs, cursor: 'pointer', color: '#ef4444', flexShrink: 0 }}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Non-final judged round (off-final state) — brief explainer; the list
          above also flags it and the final round's control below fixes it. */}
      {judged && !(isLastRound && usesJudges) && (
        <p style={{
          fontSize: '11px', lineHeight: 1.4, marginBottom: spacing.md,
          display: 'flex', alignItems: 'flex-start', gap: spacing.xs, color: colors.text.muted,
        }}>
          <Info size={12} style={{ color: colors.gold.primary, flexShrink: 0, marginTop: 1 }} />
          <span>
            {judgesOnly
              ? 'Judges alone decide this round (100%).'
              : `Judges score this round alongside public votes — ${judgeWeight}% judges · ${100 - judgeWeight}% votes.`}
          </span>
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: spacing.md }}>
        <div>
          <label style={{ ...labelStyle, fontSize: typography.fontSize.xs }}>Opens</label>
          <input
            type="datetime-local"
            value={toDateInput(round.start_date)}
            onChange={(e) => onUpdate(index, 'start_date', fromDateInput(e.target.value))}
            style={{ ...inputStyle, fontSize: '16px', padding: spacing.md, minHeight: '44px', colorScheme: 'dark' }}
          />
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: typography.fontSize.xs }}>Closes</label>
          <input
            type="datetime-local"
            value={toDateInput(round.end_date)}
            min={toDateInput(round.start_date) || undefined}
            onChange={(e) => onUpdate(index, 'end_date', fromDateInput(e.target.value))}
            style={{ ...inputStyle, fontSize: '16px', padding: spacing.md, minHeight: '44px', colorScheme: 'dark' }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '180px 1fr', gap: spacing.md, marginTop: spacing.md }}>
        <div>
          <label style={{ ...labelStyle, fontSize: typography.fontSize.xs }}>
            {isLastRound ? 'Winners (top #)' : 'Advance (top #)'}
          </label>
          <input
            type="number"
            min="1"
            value={round.contestants_advance}
            onChange={(e) => onUpdate(index, 'contestants_advance', parseInt(e.target.value) || 1)}
            style={{ ...inputStyle, fontSize: '16px', padding: spacing.md, minHeight: '44px' }}
          />
          <p style={{ fontSize: '10px', color: colors.text.muted, marginTop: '2px' }}>
            {isLastRound
              ? (round.contestants_advance === 1
                ? 'The top finisher is crowned the winner.'
                : `Top ${round.contestants_advance} are crowned winners.`)
              : `Top ${round.contestants_advance} move to the next round.`}
          </p>
        </div>
        <div>
          <label style={{ ...labelStyle, fontSize: typography.fontSize.xs }}>Public round name (optional)</label>
          <input
            type="text"
            placeholder="e.g. Quarterfinals, Semifinals, Finale"
            value={round.tier_label || ''}
            onChange={(e) => onUpdate(index, 'tier_label', e.target.value)}
            style={{ ...inputStyle, fontSize: '16px', padding: spacing.md, minHeight: '44px' }}
          />
          <p style={{ fontSize: '10px', color: colors.text.muted, marginTop: '2px' }}>
            Shown to the public during this round. Defaults to the round title.
          </p>
        </div>
      </div>

      {!judgesOnly && (
        <div style={{ marginTop: spacing.md }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!round.votes_reset_at_start}
              onChange={(e) => onUpdate(index, 'votes_reset_at_start', e.target.checked)}
            />
            <span style={{ fontSize: typography.fontSize.sm, color: colors.text.primary }}>
              Reset votes when this round starts
            </span>
          </label>
          <p style={{ fontSize: '10px', color: colors.text.muted, marginTop: '2px' }}>
            Off (default): votes carry over and add up across rounds. On: surviving contestants restart at zero.
          </p>
        </div>
      )}

      {/* Final round, judged competition: choose how winners are decided right
          here — no separate panel, and the rounds list updates instantly. */}
      {isLastRound && usesJudges && (() => {
        const mode = isJudgingType ? 'separate' : (judgeWeight > 0 ? 'blend' : 'unset');
        const optStyle = (active) => ({
          flex: 1, textAlign: 'left', cursor: 'pointer',
          padding: spacing.sm, borderRadius: borderRadius.md,
          background: active ? 'rgba(212,175,55,0.10)' : colors.background.secondary,
          border: `1px solid ${active ? colors.gold.primary : colors.border.light}`,
        });
        return (
          <div style={{ marginTop: spacing.md, paddingTop: spacing.md, borderTop: `1px solid ${colors.border.light}` }}>
            <label style={{ ...labelStyle, fontSize: typography.fontSize.xs, display: 'flex', alignItems: 'center', gap: spacing.xs }}>
              <Award size={13} style={{ color: colors.gold.primary }} /> How winners are decided
            </label>
            <div style={{ display: isMobile ? 'block' : 'flex', gap: spacing.sm }}>
              <button type="button" onClick={() => onSetBlend?.(judgeWeight >= 60 ? judgeWeight : 60)} style={{ ...optStyle(mode === 'blend'), marginBottom: isMobile ? spacing.sm : 0 }}>
                <span style={{ fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm, color: colors.text.primary }}>Public votes + judges</span>
                <span style={{ display: 'block', fontSize: '10px', color: colors.text.muted, marginTop: 2 }}>Judges score this round; public votes still count (judges 60%+).</span>
              </button>
              <button type="button" onClick={() => onSetSeparate?.()} style={optStyle(mode === 'separate')}>
                <span style={{ fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.sm, color: colors.text.primary }}>Judges only</span>
                <span style={{ display: 'block', fontSize: '10px', color: colors.text.muted, marginTop: 2 }}>A judges-only round after voting decides the winners (100%).</span>
              </button>
            </div>

            {mode === 'blend' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm }}>
                <span style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, whiteSpace: 'nowrap' }}>Judges weight</span>
                <input
                  type="range" min={60} max={100} step={5} value={judgeWeight || 60}
                  onChange={(e) => onSetWeight?.(parseInt(e.target.value, 10))}
                  style={{ flex: 1, accentColor: colors.gold.primary }}
                />
                <span style={{ fontSize: typography.fontSize.sm, color: colors.gold.primary, fontWeight: typography.fontWeight.semibold, minWidth: 92, textAlign: 'right' }}>
                  {judgeWeight || 60}% judges · {100 - (judgeWeight || 60)}% votes
                </span>
              </div>
            )}

            {mode === 'unset' && (
              <p style={{ fontSize: '11px', color: '#ef4444', marginTop: spacing.xs }}>
                Pick how judges decide your final round.
              </p>
            )}

            <p style={{ fontSize: '10px', color: colors.text.muted, marginTop: spacing.xs }}>
              Judges score contestants on the criteria you set in the <strong style={{ color: colors.text.secondary }}>Judging</strong> section below.
            </p>
          </div>
        );
      })()}
    </div>
  );
});

/**
 * reconcileOrderedRows
 *
 * UPSERTs an ordered child collection (nomination_periods / voting_rounds)
 * against the desired in-memory state — preserving row identity (and every
 * FK referencing it) instead of the historical delete-and-reinsert pattern
 * which wiped judge_scores, finalization snapshots, and vote-reset state.
 *
 * Algorithm (single-table):
 *   1. Read the current ids in the DB for this competition.
 *   2. DELETE any DB row whose id is no longer in `desired`.
 *   3. Move every surviving row to a negative temporary order (frees up
 *      the unique (competition_id, orderField) namespace so we can rewrite
 *      orders without colliding).
 *   4. For each row in `desired`:
 *        - If it has an id that still exists, UPDATE in place with the new
 *          payload + final orderField = index + 1.
 *        - Otherwise INSERT a new row with competition_id + orderField.
 */
async function reconcileOrderedRows({
  table,
  competitionId,
  desired,
  orderField,
  buildPayload,
}) {
  const { data: existing, error: fetchError } = await supabase
    .from(table)
    .select('id')
    .eq('competition_id', competitionId);
  if (fetchError) throw fetchError;

  const existingIds = new Set((existing || []).map(r => r.id));
  const desiredIds = new Set((desired || []).filter(r => r.id).map(r => r.id));

  // 1) Delete rows the host removed.
  const toDelete = [...existingIds].filter(id => !desiredIds.has(id));
  if (toDelete.length > 0) {
    const { error: delError } = await supabase
      .from(table)
      .delete()
      .in('id', toDelete);
    if (delError) throw delError;
  }

  // 2) Park survivors in negative order space to avoid unique-constraint
  //    collisions when shuffling.
  const survivors = (desired || []).filter(r => r.id && existingIds.has(r.id));
  for (let i = 0; i < survivors.length; i++) {
    const { error } = await supabase
      .from(table)
      .update({ [orderField]: -(i + 1) })
      .eq('id', survivors[i].id);
    if (error) throw error;
  }

  // 3) Update existing rows in place, insert new ones, with final ordering.
  for (let i = 0; i < (desired || []).length; i++) {
    const row = desired[i];
    const payload = { ...buildPayload(row, i), [orderField]: i + 1 };
    if (row.id && existingIds.has(row.id)) {
      const { error } = await supabase
        .from(table)
        .update(payload)
        .eq('id', row.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from(table)
        .insert({ ...payload, competition_id: competitionId });
      if (error) throw error;
    }
  }
}

/**
 * TimelineSettings - Manages competition status, timeline dates, and voting rounds
 * Used by both Host and SuperAdmin dashboards
 *
 * @param {object} competition - Competition object
 * @param {function} onSave - Callback when save completes
 * @param {boolean} isSuperAdmin - Whether the user is a super admin (shows status controls)
 */
export default function TimelineSettings({ competition, onSave, isSuperAdmin = false }) {
  const toast = useToast();
  const { isMobile } = useResponsive();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings state (stores ISO strings for DB)
  const [settings, setSettings] = useState({
    finals_date: '',
  });

  // Display values (what user sees/types)
  const [displayValues, setDisplayValues] = useState({
    finals_date: '',
  });

  // Nomination periods state (replaces single nomination_start/nomination_end)
  const [nominationPeriods, setNominationPeriods] = useState([]);
  const [nominationDisplayValues, setNominationDisplayValues] = useState([]);
  // Non-blocking confirm for "Auto-fill recommended" when it would overwrite.
  const [confirmingAutofill, setConfirmingAutofill] = useState(false);

  // Voting/Judging rounds state
  const [votingRounds, setVotingRounds] = useState([]);
  const [roundDisplayValues, setRoundDisplayValues] = useState([]);

  // Status state
  const [status, setStatus] = useState(competition?.status || COMPETITION_STATUS.DRAFT);

  // The voting timeline locks once voting opens — not at publish. Editing or
  // replacing rounds on a live competition would delete judge scores +
  // finalization snapshots and can re-trigger finalization/vote resets on
  // already-closed rounds. Before voting opens (draft → publish/nomination), no
  // rounds have run yet, so hosts can still fine-tune voting dates and rounds.
  // Nomination dates lock at publish separately (see NominationFormEditor).
  // Super admins keep edit access for corrections.
  const isFinished =
    status === COMPETITION_STATUS.COMPLETED || status === COMPETITION_STATUS.ARCHIVE;
  const isVotingOpen =
    ['live', 'voting', 'finals'].includes(status);
  const isLocked = (isFinished || isVotingOpen) && !isSuperAdmin;

  // Validation errors
  const [errors, setErrors] = useState([]);

  // Parse error indicators
  const [parseErrors, setParseErrors] = useState({});

  // Fetch settings on mount
  useEffect(() => {
    if (competition?.id) {
      fetchSettings();
    }
  }, [competition?.id]);

  const fetchSettings = async () => {
    if (!supabase || !competition?.id) return;

    setLoading(true);
    try {
      const [compResult, roundsResult, periodsResult] = await Promise.all([
        // finals_date is now on the competitions table directly
        supabase
          .from('competitions')
          .select('finals_date')
          .eq('id', competition.id)
          .single(),
        supabase
          .from('voting_rounds')
          .select('*')
          .eq('competition_id', competition.id)
          .order('round_order'),
        supabase
          .from('nomination_periods')
          .select('*')
          .eq('competition_id', competition.id)
          .order('period_order'),
      ]);

      if (compResult.error && compResult.error.code !== 'PGRST116') {
        throw compResult.error;
      }

      if (roundsResult.error) throw roundsResult.error;
      if (periodsResult.error) throw periodsResult.error;

      if (compResult.data) {
        setSettings({
          finals_date: compResult.data.finals_date || '',
        });
        setDisplayValues({
          finals_date: formatDateForDisplay(compResult.data.finals_date),
        });
      }

      // Load nomination periods
      const periods = periodsResult.data || [];
      setNominationPeriods(periods);
      setNominationDisplayValues(periods.map(p => ({
        start_date: formatDateForDisplay(p.start_date),
        end_date: formatDateForDisplay(p.end_date),
      })));

      // Load voting/judging rounds
      const rounds = roundsResult.data || [];
      setVotingRounds(rounds);
      setRoundDisplayValues(rounds.map(r => ({
        start_date: formatDateForDisplay(r.start_date),
        end_date: formatDateForDisplay(r.end_date),
      })));
      setStatus(competition.status);
    } catch (err) {
      console.error('Error fetching settings:', err);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };


  // Judges only matter when winners are decided by judges (or a hybrid). For
  // pure public-vote competitions we hide the judging controls entirely.
  const usesJudges = ['judges', 'hybrid'].includes(competition?.selectionCriteria);

  // Recommended first-voting start = 5 days after nominations close (owned by
  // the Nomination Form section). Used to auto-fill the first voting round.
  const nominationCloseIso = competition?.nominationEnd || competition?.nomination_end || null;
  const recommendedVotingStartIso = nominationCloseIso
    ? new Date(new Date(nominationCloseIso).getTime() + 5 * 86400000).toISOString()
    : null;

  // Voting rounds are pre-filled from a planned-launch estimate and don't
  // recompute when the host later sets their real nomination window — so they
  // can end up scheduled before nominations even close. Detect that so we can
  // nudge the host to re-run Auto-fill (which rebuilds from nominations close).
  const votingWindowWarning = getVotingBeforeNominationsWarning(
    votingRounds,
    nominationCloseIso
  );

  // Voting dates are derived from the nomination close, so a host can't build
  // a sensible voting schedule until their nomination window is SAVED. Gate
  // creating rounds (Auto-fill / Add Voting) on that. It's prop-driven, so it
  // unlocks automatically once the Nomination Form section saves and the parent
  // refetches. Existing rounds are never hidden — this only gates *new* ones,
  // so no live competition's timeline is affected.
  const hasSavedNominationWindow =
    !!nominationCloseIso ||
    nominationPeriods.some((p) => p.start_date && p.end_date);

  // Validate dates
  const validateDates = () => {
    const validationErrors = [];

    // Check for parse errors
    const hasParseErrors = Object.values(parseErrors).some(Boolean);
    if (hasParseErrors) {
      validationErrors.push('Please fix invalid date formats before saving');
    }

    const finale = settings.finals_date ? new Date(settings.finals_date) : null;

    // Validate nomination periods
    let lastNomEnd = null;
    nominationPeriods.forEach((period, index) => {
      const periodStart = period.start_date ? new Date(period.start_date) : null;
      const periodEnd = period.end_date ? new Date(period.end_date) : null;

      if (periodStart && periodEnd && periodEnd <= periodStart) {
        validationErrors.push(`Prospecting Period ${index + 1}: End date must be after start date`);
      }

      if (lastNomEnd && periodStart && periodStart < lastNomEnd) {
        validationErrors.push(`Prospecting Period ${index + 1}: Starts before previous period ends`);
      }

      if (periodEnd) lastNomEnd = periodEnd;
    });

    // Validate voting/judging rounds
    let prevRoundEnd = lastNomEnd;
    votingRounds.forEach((round, index) => {
      const roundStart = round.start_date ? new Date(round.start_date) : null;
      const roundEnd = round.end_date ? new Date(round.end_date) : null;
      const roundType = round.round_type === 'judging' ? 'Judging' : 'Voting';

      if (roundStart && roundEnd && roundEnd <= roundStart) {
        validationErrors.push(`${roundType} Round ${index + 1}: End date must be after start date`);
      }

      // Only warn if strictly before (allow overlap for flexibility)
      if (prevRoundEnd && roundStart && roundStart < prevRoundEnd) {
        // This is now just a warning, not an error - allow overlapping rounds
      }

      prevRoundEnd = roundEnd;
    });

    // The finale (the official close date) just needs to land after the last
    // round ends — that's when winners are decided. We measure against the last
    // round shown here (the same date the host can see and edit), not a hidden
    // judging round, and we require a small minimum gap so they don't collide.
    // There is no upper bound: a host can hold the finale event days later.
    if (finale && prevRoundEnd) {
      const lastEnd = prevRoundEnd.getTime();
      const fin = finale.getTime();
      if (!Number.isNaN(lastEnd) && !Number.isNaN(fin) && fin < lastEnd + 60000) {
        validationErrors.push('Finale must be at least 1 minute after the last round ends.');
      }
    }

    // Voting minimums (only enforced once the host has started adding voting
    // rounds): at least 3 rounds and at least 30 days of voting total.
    const votingTypeRounds = votingRounds.filter((r) => r.round_type === 'voting');
    if (votingTypeRounds.length > 0) {
      if (votingTypeRounds.length < 3) {
        validationErrors.push('Voting needs at least 3 rounds.');
      }
      const starts = votingTypeRounds.map((r) => r.start_date && new Date(r.start_date)).filter(Boolean);
      const ends = votingTypeRounds.map((r) => r.end_date && new Date(r.end_date)).filter(Boolean);
      if (starts.length && ends.length) {
        const firstStart = Math.min(...starts.map((d) => d.getTime()));
        const lastEnd = Math.max(...ends.map((d) => d.getTime()));
        const days = (lastEnd - firstStart) / 86400000;
        if (days < 30) {
          validationErrors.push('Voting must run at least 30 days total (first round start to last round end).');
        }
      }
    }

    if (status === COMPETITION_STATUS.LIVE) {
      if (nominationPeriods.length === 0) {
        validationErrors.push('At least one prospecting period is required for Live status');
      } else {
        const firstPeriod = nominationPeriods[0];
        if (!firstPeriod.start_date || !firstPeriod.end_date) {
          validationErrors.push('First prospecting period must have start and end dates for Live status');
        }
      }
    }

    setErrors(validationErrors);
    return validationErrors.length === 0;
  };

  // Save settings
  const handleSave = async () => {
    if (isLocked) {
      toast.error(
        isFinished
          ? 'This competition has ended — its timeline is locked.'
          : 'Voting has opened — the voting schedule is locked. Contact support to change a date.'
      );
      return;
    }
    if (!validateDates()) {
      toast.error('Please fix the validation errors before saving');
      return;
    }

    setSaving(true);
    try {
      // Nomination open/close dates are owned by the Nomination Form section,
      // not here — this section only manages voting/judging rounds, the finale
      // and status. (See NominationFormEditor for the nomination window.)
      const { error: compError } = await supabase
        .from('competitions')
        .update({
          status,
          finals_date: settings.finals_date || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', competition.id);

      if (compError) throw compError;

      // ────────────────────────────────────────────────────────────────────
      // Reconcile nomination_periods and voting_rounds in place.
      //
      // The previous implementation deleted every row and re-inserted with
      // fresh UUIDs. That destroyed FK references — judge_scores
      // (ON DELETE CASCADE on voting_round_id), votes_at_round_start
      // snapshots keyed by round id, and finalized_at / finalized_snapshot.
      // Re-inserted rounds had finalized_at = NULL, so ensure_round_state()
      // re-ran finalization on already-past rounds, which could re-trigger
      // vote resets — that's the bug that zeroed votes prematurely.
      //
      // The fix: UPDATE rows that have an id (preserves identity + scores +
      // finalization), INSERT only truly new rows, DELETE only rows the host
      // removed. Two-phase round_order update sidesteps the
      // UNIQUE (competition_id, round_order) constraint when rows are
      // reordered.
      // ────────────────────────────────────────────────────────────────────

      await reconcileOrderedRows({
        table: 'voting_rounds',
        competitionId: competition.id,
        // Normalise placeholder round titles to schedule order on every save,
        // so any drift (or already-drifted data) self-heals when persisted.
        desired: renumberVotingTitles(votingRounds),
        orderField: 'round_order',
        buildPayload: (round, index) => ({
          title: round.title || `Round ${index + 1}`,
          round_type: round.round_type || 'voting',
          start_date: round.start_date || null,
          end_date: round.end_date || null,
          contestants_advance: round.contestants_advance || 10,
          tier_label: round.tier_label?.trim() || null,
          votes_reset_at_start: !!round.votes_reset_at_start,
          // Voting Details is now the single owner of the round schedule —
          // including each round's judge weight and type — so we always persist
          // it. (The Judging panel no longer writes rounds; it's a read-only
          // summary, which removes the split-ownership desync.) A vote-only
          // competition carries no judge weight, so force it to 0 — this also
          // clears any stale weight left over from a previously-judged config.
          judge_weight: usesJudges ? (round.judge_weight ?? 0) : 0,
        }),
      });

      toast.success('Timeline settings saved');
      if (onSave) onSave();
    } catch (err) {
      console.error('Error saving settings:', err);
      toast.error(`Failed to save settings: ${err.message || err.code || 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Nomination period management
  const addNominationPeriod = () => {
    setNominationPeriods(prev => [
      ...prev,
      {
        ...DEFAULT_NOMINATION_PERIOD,
        title: prev.length === 0 ? 'Open Nominations' : `Period ${prev.length + 1}`,
        period_order: prev.length + 1,
      }
    ]);
    setNominationDisplayValues(prev => [...prev, { start_date: '', end_date: '' }]);
  };

  const removeNominationPeriod = (index) => {
    setNominationPeriods(prev => prev.filter((_, i) => i !== index));
    setNominationDisplayValues(prev => prev.filter((_, i) => i !== index));
  };

  const updateNominationPeriod = (index, field, value) => {
    setNominationPeriods(prev =>
      prev.map((period, i) =>
        i === index ? { ...period, [field]: value } : period
      )
    );
  };

  const updateNominationDisplayValue = (index, field, value) => {
    setNominationDisplayValues(prev =>
      prev.map((disp, i) =>
        i === index ? { ...disp, [field]: value } : disp
      )
    );
  };

  // Handle nomination period date blur
  const handleNominationDateBlur = (index, field, displayValue) => {
    const errorKey = `nom_${index}_${field}`;
    if (!displayValue.trim()) {
      updateNominationPeriod(index, field, '');
      setParseErrors(prev => ({ ...prev, [errorKey]: false }));
      return;
    }

    const parsed = parseTypedDate(displayValue);
    if (parsed) {
      updateNominationPeriod(index, field, parsed);
      updateNominationDisplayValue(index, field, formatDateForDisplay(parsed));
      setParseErrors(prev => ({ ...prev, [errorKey]: false }));
    } else {
      setParseErrors(prev => ({ ...prev, [errorKey]: true }));
    }
  };

  // Voting/Judging round management
  const ROUND_LEN_MS = 7 * 86400000; // default round length when we auto-fill
  const addVotingRound = (roundType = 'voting') => {
    // Voting dates derive from the nomination close — don't create rounds until
    // the nomination window is saved (mirrors the disabled button state).
    if (!hasSavedNominationWindow) return;
    const typeLabel = roundType === 'judging' ? 'Judging' : 'Voting';

    // Keep judging glued to the FINAL round. In a judged competition, if the
    // last round is the decider (it carries judge weight, or is a judges-only
    // round), insert the new voting round *before* it so the decider stays last.
    // Otherwise a new round would silently become the "final round" and strand
    // judging mid-schedule — the exact behavior that made it look like judging
    // vanished.
    const last = votingRounds[votingRounds.length - 1];
    const lastIsDecider =
      !!last && ((last.judge_weight || 0) > 0 || (last.round_type || 'voting') === 'judging');
    const insertedBeforeFinal = roundType === 'voting' && usesJudges && lastIsDecider;
    const insertAt = insertedBeforeFinal ? votingRounds.length - 1 : votingRounds.length;

    // Start the new round right after the round before it ends, so the schedule
    // stays contiguous. When there's no preceding round (the first round, or
    // inserting before a lone judged round) fall back to the recommended start
    // (nominations close + 5 days).
    const precedingRound = insertAt > 0 ? votingRounds[insertAt - 1] : null;
    const startIso = precedingRound?.end_date || recommendedVotingStartIso || '';
    const endIso = startIso
      ? new Date(new Date(startIso).getTime() + ROUND_LEN_MS).toISOString()
      : '';

    const newRound = {
      ...DEFAULT_VOTING_ROUND,
      title: `${typeLabel} Round ${votingRounds.filter(r => r.round_type === roundType).length + 1}`,
      round_order: votingRounds.length + 1,
      round_type: roundType,
      start_date: startIso || DEFAULT_VOTING_ROUND.start_date || '',
      end_date: endIso || DEFAULT_VOTING_ROUND.end_date || null,
    };
    const newDisplay = {
      start_date: startIso ? formatDateForDisplay(startIso) : '',
      end_date: endIso ? formatDateForDisplay(endIso) : '',
    };

    const rounds = [...votingRounds];
    const disps = [...roundDisplayValues];
    rounds.splice(insertAt, 0, newRound);
    disps.splice(insertAt, 0, newDisplay);

    // When inserted before the judged final round, slide that final round to
    // open when the new round closes (preserving its length) so it stays
    // contiguous instead of overlapping the round we just added.
    if (insertedBeforeFinal && endIso) {
      const fi = insertAt + 1;
      const fin = rounds[fi];
      if (fin) {
        const origLen = (fin.start_date && fin.end_date)
          ? Math.max(86400000, new Date(fin.end_date).getTime() - new Date(fin.start_date).getTime())
          : ROUND_LEN_MS;
        const finEnd = new Date(new Date(endIso).getTime() + origLen).toISOString();
        rounds[fi] = { ...fin, start_date: endIso, end_date: finEnd };
        disps[fi] = { start_date: formatDateForDisplay(endIso), end_date: formatDateForDisplay(finEnd) };
      }
    }

    // Renumber generic titles so an inserted round reads in schedule order
    // (e.g. a round dropped before the judged final round doesn't leave
    // "Voting Round 4" sitting ahead of "Voting Round 3").
    const numbered = renumberVotingTitles(rounds);
    setVotingRounds(numbered);
    setRoundDisplayValues(disps);
    // The last round may have changed (appended, or the slid final round) —
    // keep the finale from landing before it.
    ensureFinaleAfterLast(numbered);
  };

  // ── How winners are decided (configured inline on the final round) ─────────
  // These operate on local state and persist on Save, so the rounds list and
  // the judging setup are one source of truth — switching updates the list
  // immediately (the old split-panel desync is gone). Two supported shapes:
  //   • blend    — the final VOTING round is judged (judges ≥60% + public votes)
  //   • separate — a dedicated JUDGES-ONLY round (100%) after voting closes
  // Keep the finale valid relative to the last round without trampling a finale
  // the host deliberately set later. Only (re)set it when it's missing or would
  // now fall before the last round ends (the validator's 1-minute floor).
  const ensureFinaleAfterLast = (rounds) => {
    const last = rounds[rounds.length - 1];
    if (!last?.end_date) return;
    const t = new Date(last.end_date).getTime();
    if (Number.isNaN(t)) return;
    const minFinale = t + 60000; // ≥ 1 min after the last round ends
    const cur = settings.finals_date ? new Date(settings.finals_date).getTime() : NaN;
    if (!Number.isNaN(cur) && cur >= minFinale) return; // existing finale still valid — keep it
    const finale = new Date(t + 60 * 60 * 1000).toISOString(); // default: 1 hr after
    setSettings(prev => ({ ...prev, finals_date: finale }));
    setDisplayValues(prev => ({ ...prev, finals_date: formatDateForDisplay(finale) }));
  };

  // "Public votes + judges": drop any dedicated judging round, then put the
  // judge weight on the final voting round (judges control ≥60% — the
  // skill-contest floor).
  const setBlendJudging = (weight = 60) => {
    const w = Math.max(60, Math.min(100, Math.round(weight) || 60));
    let pairs = votingRounds
      .map((r, i) => ({ r, d: roundDisplayValues[i] }))
      .filter(({ r }) => (r.round_type || 'voting') !== 'judging');
    // Degenerate case: the only round(s) were dedicated judging rounds. Convert
    // to voting rather than deleting everything, so blend still has a decider.
    if (pairs.length === 0 && votingRounds.length) {
      pairs = votingRounds.map((r, i) => ({ r: { ...r, round_type: 'voting' }, d: roundDisplayValues[i] }));
    }
    // Only clear weights — preserve each round's existing type (don't demote a
    // 'finale'/'resurrection' round to 'voting'). The judged decider rides on
    // the last round, whatever its type.
    const rounds = pairs.map(({ r }) => ({ ...r, judge_weight: 0 }));
    if (rounds.length) rounds[rounds.length - 1] = { ...rounds[rounds.length - 1], judge_weight: w };
    setVotingRounds(renumberVotingTitles(rounds));
    setRoundDisplayValues(pairs.map(({ d }) => d));
    ensureFinaleAfterLast(rounds);
  };

  // "Judges only": voting rounds lose their weight, and a single judges-only
  // round (100%) sits LAST. Reuses an existing judging round (moving it to the
  // end if it had drifted mid-schedule) instead of leaving it stranded.
  const setSeparateJudging = () => {
    const pairs = votingRounds.map((r, i) => ({ r, d: roundDisplayValues[i] }));
    const judgingPair = pairs.find(({ r }) => r.round_type === 'judging');
    const nonJudging = pairs
      .filter(({ r }) => r.round_type !== 'judging')
      .map((p) => ({ ...p, r: { ...p.r, judge_weight: 0 } }));

    let judging;
    if (judgingPair) {
      judging = { r: { ...judgingPair.r, judge_weight: 100 }, d: judgingPair.d };
    } else {
      const lastVoting = [...nonJudging].reverse().find(({ r }) => (r.round_type || 'voting') === 'voting')?.r
        || nonJudging[nonJudging.length - 1]?.r;
      const start = lastVoting?.end_date || null;
      const end = start ? new Date(new Date(start).getTime() + 5 * 86400000).toISOString() : null;
      const winners = Number(competition?.numberOfWinners || competition?.number_of_winners)
        || lastVoting?.contestants_advance || 1;
      judging = {
        r: {
          ...DEFAULT_VOTING_ROUND,
          title: 'Judging Round',
          round_type: 'judging',
          judge_weight: 100,
          start_date: start,
          end_date: end,
          contestants_advance: winners,
        },
        d: {
          start_date: start ? formatDateForDisplay(start) : '',
          end_date: end ? formatDateForDisplay(end) : '',
        },
      };
    }

    const all = [...nonJudging, judging]; // judging round always last
    setVotingRounds(renumberVotingTitles(all.map((p) => p.r)));
    setRoundDisplayValues(all.map((p) => p.d));
    ensureFinaleAfterLast(all.map((p) => p.r));
  };

  // Slider while in blend mode — adjust the final round's judge weight in place.
  const setDecidingWeight = (weight) => {
    const w = Math.max(60, Math.min(100, Math.round(weight) || 60));
    setVotingRounds(prev => prev.map((r, i) => (i === prev.length - 1 ? { ...r, judge_weight: w } : r)));
  };

  // Build the recommended schedule: three contiguous 10-day voting rounds
  // (≥30 days total, the validator's minimum). Judging is tied to the LAST
  // voting round — that round becomes the determining round with judges at the
  // 60% skill-contest floor (the "blend" layout JudgingPanel offers), so there
  // is never a separate judging round. The finale is set 1 hour after that
  // round ends (comfortably past the validator's 1-min minimum gap). Anchored
  // to the recommended first-voting start (nominations close + 5 days); falls
  // back to ~4 weeks out if the nomination close date isn't set yet.
  const buildRecommendedSchedule = () => {
    const DAY = 86400000;
    const addDays = (d, n) => new Date(d.getTime() + n * DAY);
    const base = recommendedVotingStartIso
      ? new Date(recommendedVotingStartIso)
      : new Date(Date.now() + 28 * DAY);

    // The final round crowns the host's actual number of winners (not a fixed 5).
    const winnerCount = Number(competition?.numberOfWinners || competition?.number_of_winners) || 1;

    const rounds = [];
    let cursor = new Date(base);
    const votingTiers = [
      { title: 'Voting Round 1', tier_label: 'Opening Round', advance: 15 },
      { title: 'Voting Round 2', tier_label: 'Semifinals', advance: 8 },
      { title: 'Voting Round 3', tier_label: 'Finals', advance: winnerCount },
    ];
    votingTiers.forEach((t, i) => {
      const start = new Date(cursor);
      const end = addDays(start, 10);
      const isLast = i === votingTiers.length - 1;
      rounds.push({
        ...DEFAULT_VOTING_ROUND,
        title: t.title,
        tier_label: t.tier_label,
        round_type: 'voting',
        round_order: i + 1,
        contestants_advance: t.advance,
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        votes_reset_at_start: false,
        // Judging rides on the final voting round when winners are judge-decided
        // (judges 60% + votes 40%). Pure-vote competitions leave it at 0.
        judge_weight: isLast && usesJudges ? 60 : 0,
      });
      cursor = end; // next round opens as this one closes
    });

    const finale = new Date(cursor.getTime() + 60 * 60 * 1000); // +1 hr after the deciding round
    return { rounds, finaleIso: finale.toISOString() };
  };

  // Apply the recommended schedule. Native window.confirm blocks the main
  // thread (a big INP/long-task offender), so when there's existing data we use
  // a non-blocking inline confirmation (confirmingAutofill) instead.
  const applyRecommendedSchedule = () => {
    const { rounds, finaleIso } = buildRecommendedSchedule();
    setVotingRounds(rounds);
    setRoundDisplayValues(rounds.map(r => ({
      start_date: formatDateForDisplay(r.start_date),
      end_date: formatDateForDisplay(r.end_date),
    })));
    setSettings(prev => ({ ...prev, finals_date: finaleIso }));
    setDisplayValues(prev => ({ ...prev, finals_date: formatDateForDisplay(finaleIso) }));
    setParseErrors({});
    setErrors([]);
    setConfirmingAutofill(false);
    toast.success('Recommended schedule filled in — review the dates, then Save.');
  };

  const handleAutofillClick = () => {
    // Auto-fill derives dates from the nomination close — require it saved first.
    if (!hasSavedNominationWindow) return;
    if (votingRounds.length > 0 || settings.finals_date) {
      setConfirmingAutofill(true);
    } else {
      applyRecommendedSchedule();
    }
  };

  // Stable refs (functional setState, no deps) so the memoized round cards only
  // re-render the row that actually changed — not every card on each keystroke.
  const removeVotingRound = useCallback((index) => {
    // Renumber after removal so the remaining rounds stay 1, 2, 3… in order.
    setVotingRounds(prev => renumberVotingTitles(prev.filter((_, i) => i !== index)));
    setRoundDisplayValues(prev => prev.filter((_, i) => i !== index));
  }, []);

  const updateVotingRound = useCallback((index, field, value) => {
    setVotingRounds(prev =>
      prev.map((round, i) =>
        i === index ? { ...round, [field]: value } : round
      )
    );
  }, []);

  const updateRoundDisplayValue = (index, field, value) => {
    setRoundDisplayValues(prev =>
      prev.map((disp, i) =>
        i === index ? { ...disp, [field]: value } : disp
      )
    );
  };

  // Handle date input blur - parse and validate
  const handleDateBlur = (field, displayValue) => {
    if (!displayValue.trim()) {
      setSettings(prev => ({ ...prev, [field]: '' }));
      setParseErrors(prev => ({ ...prev, [field]: false }));
      return;
    }

    const parsed = parseTypedDate(displayValue);
    if (parsed) {
      setSettings(prev => ({ ...prev, [field]: parsed }));
      setDisplayValues(prev => ({ ...prev, [field]: formatDateForDisplay(parsed) }));
      setParseErrors(prev => ({ ...prev, [field]: false }));
    } else {
      setParseErrors(prev => ({ ...prev, [field]: true }));
    }
  };

  // Handle voting round date blur
  const handleRoundDateBlur = (index, field, displayValue) => {
    const errorKey = `round_${index}_${field}`;
    if (!displayValue.trim()) {
      updateVotingRound(index, field, '');
      setParseErrors(prev => ({ ...prev, [errorKey]: false }));
      return;
    }

    const parsed = parseTypedDate(displayValue);
    if (parsed) {
      updateVotingRound(index, field, parsed);
      updateRoundDisplayValue(index, field, formatDateForDisplay(parsed));
      setParseErrors(prev => ({ ...prev, [errorKey]: false }));
    } else {
      setParseErrors(prev => ({ ...prev, [errorKey]: true }));
    }
  };

  // Styles

  // Compact, read-only schedule shown to hosts once the timeline is locked,
  // instead of the full editor with its empty-state cards and disabled inputs.
  const renderLockedSchedule = () => {
    const finalsDisplay = displayValues.finals_date;
    const fmtRange = (start, end) =>
      !start && !end ? 'Dates not set' : `${start || '—'} → ${end || '—'}`;

    const groupLabel = (Icon, text) => (
      <div style={{
        display: 'flex', alignItems: 'center', gap: spacing.sm,
        color: colors.text.secondary, fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.medium, marginBottom: spacing.sm,
      }}>
        <Icon size={14} /> {text}
      </div>
    );
    const rowStyle = {
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      gap: spacing.md, padding: `${spacing.sm} 0`,
      borderBottom: `1px solid ${colors.border.lighter}`,
    };
    const muted = (t) => (
      <p style={{ margin: 0, color: colors.text.muted, fontSize: typography.fontSize.sm }}>{t}</p>
    );
    const dateText = { color: colors.text.secondary, fontSize: typography.fontSize.xs, whiteSpace: 'nowrap' };

    return (
      <div style={sectionStyle}>
        <h4 style={{ fontSize: typography.fontSize.md, marginBottom: spacing.lg, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <Calendar size={18} /> Schedule
        </h4>

        <div style={{ marginBottom: spacing.lg }}>
          {groupLabel(Vote, 'Voting & Judging Rounds')}
          {votingRounds.length > 0
            ? votingRounds.map((r, i) => {
              const cfg = ROUND_TYPE_CONFIG[r.round_type] || ROUND_TYPE_CONFIG.voting;
              return (
                <div key={i} style={rowStyle}>
                  <span style={{ color: colors.text.primary, fontSize: typography.fontSize.sm }}>
                    {r.title || `Round ${i + 1}`}
                    <span style={{ color: cfg.color, fontSize: typography.fontSize.xs, marginLeft: spacing.sm }}>{cfg.label}</span>
                  </span>
                  <span style={dateText}>{fmtRange(roundDisplayValues[i]?.start_date, roundDisplayValues[i]?.end_date)}</span>
                </div>
              );
            })
            : muted('No rounds')}
        </div>

        <div>
          {groupLabel(Trophy, 'Finals')}
          {finalsDisplay
            ? <p style={{ margin: 0, color: colors.text.primary, fontSize: typography.fontSize.sm }}>{finalsDisplay}</p>
            : muted('Not set')}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div style={{ padding: spacing.lg }}>
        <SkeletonPulse height="20px" width="200px" style={{ marginBottom: spacing.lg }} />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} style={{ display: 'flex', gap: spacing.md, marginBottom: spacing.lg, alignItems: 'center' }}>
            <SkeletonPulse width="140px" height="16px" />
            <SkeletonPulse height="40px" style={{ flex: 1 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Validation Errors */}
      {errors.length > 0 && (
        <div style={{
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: borderRadius.lg,
          padding: spacing.md,
          marginBottom: spacing.lg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <AlertTriangle size={16} style={{ color: '#ef4444' }} />
            <span style={{ color: '#ef4444', fontWeight: typography.fontWeight.medium }}>Validation Errors</span>
          </div>
          <ul style={{ margin: 0, paddingLeft: spacing.lg }}>
            {errors.map((error, i) => (
              <li key={i} style={{ color: '#ef4444', fontSize: typography.fontSize.sm }}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Current Phase + Competition Status removed — phase/status are driven by
          the launch lifecycle (submit → approve → publish), not edited here. */}

      {isLocked ? (
        <>
          {/* Locked: a finished competition's schedule is read-only. Show a
              compact summary instead of the full editor. */}
          <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: spacing.sm,
            padding: spacing.md,
            marginBottom: spacing.lg,
            background: 'rgba(59, 130, 246, 0.1)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: borderRadius.lg,
          }}>
            <Lock size={16} style={{ color: 'rgb(59, 130, 246)', marginTop: '2px', flexShrink: 0 }} />
            <div>
              <p style={{ margin: 0, fontSize: typography.fontSize.sm, color: 'rgb(59, 130, 246)', fontWeight: typography.fontWeight.medium }}>
                Timeline locked
              </p>
              <p style={{ margin: `${spacing.xs} 0 0`, fontSize: typography.fontSize.xs, color: colors.text.muted }}>
                {isFinished
                  ? `This competition has ${status === COMPETITION_STATUS.ARCHIVE ? 'been archived' : 'ended'}. Its schedule is preserved as a record and can no longer be edited.`
                  : 'Voting has opened, so the voting schedule is now locked to protect scores and results. Contact support if a date needs to change.'}
              </p>
            </div>
          </div>
          {renderLockedSchedule()}
        </>
      ) : (
        <>
      {/* Nomination open/close dates moved to the Nomination Form section. */}

      {/* Voting & Judging Rounds */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <h4 style={{ fontSize: typography.fontSize.md, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <Vote size={18} />
            Voting Rounds
          </h4>
          <div style={{ display: 'flex', gap: spacing.sm }}>
            <Button
              size="sm"
              icon={Sparkles}
              onClick={handleAutofillClick}
              disabled={!hasSavedNominationWindow}
              title={!hasSavedNominationWindow ? 'Save your nomination dates first' : undefined}
            >
              Auto-fill recommended
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={() => addVotingRound('voting')}
              disabled={!hasSavedNominationWindow}
              title={!hasSavedNominationWindow ? 'Save your nomination dates first' : undefined}
            >
              Add Voting
            </Button>
          </div>
        </div>
        <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginBottom: spacing.sm }}>
          {usesJudges
            ? 'Your full schedule, in order — the judging round is shown here too. The final round decides winners; set the judging criteria, weight and dates in the Judging section below.'
            : 'This competition is vote-based only. To add judges, change “How they win” in your competition details before submitting.'}
        </p>
        <p style={{ fontSize: typography.fontSize.xs, color: colors.gold.primary, marginBottom: spacing.md }}>
          Voting should run at least <strong>30 days</strong> across at least <strong>3 rounds</strong>. We recommend voting opens 5 days after nominations close
          {recommendedVotingStartIso ? <> — about <strong>{formatDateForDisplay(recommendedVotingStartIso)}</strong>.</> : '.'}{' '}
          Use <strong>Auto-fill recommended</strong> to lay out 3 voting rounds and the finale for you
          {usesJudges ? <> — judges decide the final round at <strong>60%</strong>. Prefer a judges-only finale? Change it on the final round below.</> : '. '}
          {' '}Adjust anything after.
        </p>

        {votingWindowWarning && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: spacing.sm,
            padding: spacing.md, marginBottom: spacing.md,
            background: `${colors.status.warning}12`,
            border: `1px solid ${colors.status.warning}55`,
            borderRadius: borderRadius.md,
          }}>
            <AlertTriangle size={16} style={{ color: colors.status.warning, flexShrink: 0, marginTop: 2 }} />
            <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
              Your voting rounds start{' '}
              <strong>{formatDateForDisplay(votingWindowWarning.earliestStartIso)}</strong>, before nominations
              close (<strong>{formatDateForDisplay(votingWindowWarning.nominationCloseIso)}</strong>). They were
              pre-filled from your planned launch and didn’t update when your nomination window changed. Click{' '}
              <strong>Auto-fill recommended</strong> to rebuild the schedule from your nomination window, or set
              each round’s dates by hand.
            </span>
          </div>
        )}

        {confirmingAutofill && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap',
            gap: spacing.md, padding: spacing.md, marginBottom: spacing.md,
            background: colors.background.card, border: `1px solid ${colors.gold.primary}55`,
            borderRadius: borderRadius.md,
          }}>
            <span style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary }}>
              This replaces your current rounds and finale with the recommended schedule.
            </span>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              <Button size="sm" icon={Sparkles} onClick={applyRecommendedSchedule}>Replace</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmingAutofill(false)}>Keep mine</Button>
            </div>
          </div>
        )}

        {(() => {
        // Show the FULL schedule in one place — voting rounds and the judging
        // round together, in order. How the final round is judged is set inline
        // on its card below; only the scoring criteria live in the Judging
        // section now. This is the single source of truth for the schedule.
        const displayRounds = votingRounds.map((round, index) => ({ round, index }));
        // Where does judging actually live, and is it on the final round? When
        // it isn't, the host hit exactly the confusing state we want to explain.
        const judgedPos = displayRounds.findIndex(
          ({ round }) => (round.judge_weight || 0) > 0 || (round.round_type || 'voting') === 'judging'
        );
        const judgingNotOnFinal =
          usesJudges && judgedPos >= 0 && judgedPos !== displayRounds.length - 1;
        const judgedRoundName =
          judgedPos >= 0 ? (displayRounds[judgedPos].round.title || `Round ${judgedPos + 1}`) : '';
        const finalRoundName = displayRounds.length
          ? (displayRounds[displayRounds.length - 1].round.title || `Round ${displayRounds.length}`)
          : '';
        return displayRounds.length === 0 ? (
          !hasSavedNominationWindow ? (
            // Gate: voting dates are built from the nomination close, so require
            // a saved nomination window before any rounds can be created.
            <div style={{
              textAlign: 'center',
              padding: spacing.xl,
              background: colors.background.card,
              border: `1px solid ${colors.gold.primary}33`,
              borderRadius: borderRadius.lg,
              color: colors.text.secondary,
            }}>
              <Calendar size={32} style={{ marginBottom: spacing.md, opacity: 0.6, color: colors.gold.primary }} />
              <p style={{ color: colors.text.primary, fontWeight: typography.fontWeight.semibold }}>
                Set your nomination window first
              </p>
              <p style={{ fontSize: typography.fontSize.sm }}>
                Your voting schedule is built from your nomination dates. Add and <strong>save</strong> your
                nomination window in the Nomination Form section above, then Auto-fill or add rounds here.
              </p>
            </div>
          ) : (
            <div style={{
              textAlign: 'center',
              padding: spacing.xl,
              background: colors.background.card,
              borderRadius: borderRadius.lg,
              color: colors.text.secondary,
            }}>
              <Vote size={32} style={{ marginBottom: spacing.md, opacity: 0.5 }} />
              <p>No voting rounds yet</p>
              <p style={{ fontSize: typography.fontSize.sm }}>Use Auto-fill recommended, or add voting rounds to define the schedule</p>
            </div>
          )
        ) : (
          <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {displayRounds.map(({ round, index }, pos) => {
              const isLast = pos === displayRounds.length - 1;
              return (
                <VotingRoundCard
                  key={index}
                  round={round}
                  index={index}
                  pos={pos}
                  isLastRound={isLast}
                  isMobile={isMobile}
                  usesJudges={usesJudges}
                  onUpdate={updateVotingRound}
                  onRemove={removeVotingRound}
                  onSetBlend={isLast ? setBlendJudging : undefined}
                  onSetSeparate={isLast ? setSeparateJudging : undefined}
                  onSetWeight={isLast ? setDecidingWeight : undefined}
                />
              );
            })}
          </div>
          {judgingNotOnFinal && (
            <p style={{ fontSize: typography.fontSize.xs, color: '#ef4444', marginTop: spacing.md, display: 'flex', alignItems: 'flex-start', gap: spacing.xs }}>
              <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>
                Judging is set on <strong>{judgedRoundName}</strong>, but your final round is <strong>{finalRoundName}</strong>.
                Judging should run on the final round (where winners are crowned). Open your final round above and choose
                how winners are decided to move it.
              </span>
            </p>
          )}
          </>
        );
        })()}
      </div>

      {/* Finals Date */}
      <div style={sectionStyle}>
        <h4 style={{ fontSize: typography.fontSize.md, marginBottom: spacing.md, display: 'flex', alignItems: 'center', gap: spacing.sm }}>
          <Trophy size={18} />
          Finals Date
        </h4>
        <div>
          <input
            type="datetime-local"
            value={toDateInput(settings.finals_date)}
            onChange={(e) => setSettings(prev => ({ ...prev, finals_date: fromDateInput(e.target.value) }))}
            style={{ ...inputStyle, maxWidth: '300px', colorScheme: 'dark' }}
          />
          <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: spacing.xs }}>
            The official close/finale date — the competition flips to Completed after it passes.
            Winners are decided when your last round ends, so set this after the final round.
          </p>
        </div>
      </div>

      {/* Save Button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: spacing.xl }}>
        <Button icon={Save} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Timeline Settings'}
        </Button>
      </div>
        </>
      )}
    </div>
  );
}
