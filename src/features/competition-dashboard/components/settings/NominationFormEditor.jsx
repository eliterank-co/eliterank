import React, { useState, useEffect } from 'react';
import {
  FormInput,
  RotateCcw,
  Check,
  Plus,
  Trash2,
  AlertCircle,
  Lock,
  Calendar,
} from 'lucide-react';
import { Button, Panel } from '../../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../../styles/theme';
import { supabase } from '../../../../lib/supabase';
import { useToast } from '../../../../contexts/ToastContext';
import {
  resolveNominationFormConfig,
  CUSTOM_QUESTION_TYPES,
  newCustomQuestionId,
  getStandardNominationFields,
  MAX_CUSTOM_QUESTIONS,
} from '../../../../utils/nominationFormDefaults';
import { LAUNCH_TIMEFRAME_MONTHS } from '../../../../lib/competitionTemplates';

// Recommended nomination duration by territory scope (issue: hosts asked for
// guidance on how long to leave nominations open).
const NOMINATION_REC = {
  city: { weeks: 6, label: 'city-wide' },
  state: { weeks: 8, label: 'state-wide' },
  us: { weeks: 12, label: 'nationwide' },
};

// timestamptz → 'YYYY-MM-DDTHH:mm' for an <input type="datetime-local">.
// Slicing the ISO string avoids a timezone shift from new Date().
const toDateInput = (v) => (v ? String(v).slice(0, 16) : '');

// 'YYYY-MM-DDTHH:mm' for N months from today at 9:00 AM — a sensible default
// the host can adjust. Used to pre-fill the nomination open date from the
// planned launch timeframe.
const monthsFromNow = (months) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  d.setHours(9, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Add whole weeks to a 'YYYY-MM-DDTHH:mm' value, preserving the time.
const addWeeks = (value, weeks) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + weeks * 7);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * Nomination form creator for hosts.
 *
 * Standard fields (first name, last name, email, Instagram, photo, age, city,
 * bio, password) are fixed by the platform — split between the public
 * nomination form and the post-nomination claim flow. Hosts can add up to
 * MAX_CUSTOM_QUESTIONS extra questions, shown on the self-nomination form
 * and saved into nominees.eligibility_answers.
 *
 * @param {object} competition - Competition object
 * @param {function} onSave - Callback after save completes
 * @param {string} [id] - DOM id for deep-link scrolling (e.g. launch checklist)
 * @param {object} [style] - Extra style for the outer Panel (e.g. flex order)
 * @param {boolean} [collapsible] - Render the Panel collapsible
 * @param {boolean} [defaultCollapsed] - Initial collapsed state when collapsible
 */
export function NominationFormEditor({
  competition,
  onSave,
  id,
  style,
  collapsible = false,
  defaultCollapsed = false,
  locked = false,
  badge,
}) {
  const toast = useToast();

  const [customQuestions, setCustomQuestions] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Nomination open/close window (moved here from Timeline & Status). Stored on
  // the competition (nomination_start/end) and as a single nomination_periods
  // row so the public site and phase logic keep working.
  const [nomStart, setNomStart] = useState('');
  const [nomEnd, setNomEnd] = useState('');
  const [nomPeriodId, setNomPeriodId] = useState(null);
  const [initialNom, setInitialNom] = useState({ start: '', end: '' });
  const [autoFilled, setAutoFilled] = useState(false);

  const rec = NOMINATION_REC[competition?.territoryScope] || NOMINATION_REC.city;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!competition?.id) return;
      const { data } = await supabase
        .from('nomination_periods')
        .select('id, start_date, end_date')
        .eq('competition_id', competition.id)
        .order('period_order', { ascending: true })
        .limit(1);
      if (cancelled) return;
      const row = data?.[0];
      const existingStart = toDateInput(row?.start_date || competition.nominationStart || competition.nomination_start);
      const existingEnd = toDateInput(row?.end_date || competition.nominationEnd || competition.nomination_end);
      let start = existingStart;
      let end = existingEnd;
      // No nomination dates yet? Pre-fill from the host's planned launch
      // timeframe (e.g. "6+ months out" → opens ~6 months from today) plus a
      // recommended window. It's a suggestion the host reviews and Saves —
      // initialNom keeps the real stored value so this counts as a change.
      if (!start) {
        const months = LAUNCH_TIMEFRAME_MONTHS[competition.plannedLaunchTimeframe || competition.planned_launch_timeframe];
        if (months) {
          start = monthsFromNow(months);
          end = addWeeks(start, rec.weeks);
          setAutoFilled(true);
        }
      }
      setNomPeriodId(row?.id || null);
      setNomStart(start);
      setNomEnd(end);
      setInitialNom({ start: existingStart, end: existingEnd });
    })();
    return () => { cancelled = true; };
  }, [competition?.id]);

  const applyRecommendation = () => {
    if (nomStart) setNomEnd(addWeeks(nomStart, rec.weeks));
  };

  // The dashboard hook normalizes the competition row and exposes the JSONB
  // column as camelCase `nominationFormConfig`; the raw DB row uses snake_case
  // `nomination_form_config`. Accept either so the editor works regardless of
  // which shape the parent passes.
  const storedConfig =
    competition?.nominationFormConfig ?? competition?.nomination_form_config;

  useEffect(() => {
    const resolved = resolveNominationFormConfig(storedConfig);
    setCustomQuestions(resolved.custom_questions);
  }, [storedConfig]);

  const hasChanges = () => {
    const stored = JSON.stringify(
      resolveNominationFormConfig(storedConfig).custom_questions
    );
    const current = JSON.stringify(
      resolveNominationFormConfig({ custom_questions: customQuestions }).custom_questions
    );
    const nomChanged = nomStart !== initialNom.start || nomEnd !== initialNom.end;
    return stored !== current || nomChanged;
  };

  const validate = () => {
    if ((nomStart && !nomEnd) || (!nomStart && nomEnd)) {
      return 'Set both an open and a close date for nominations.';
    }
    if (nomStart && nomEnd && nomEnd <= nomStart) {
      return 'Nominations must close after they open.';
    }
    for (const q of customQuestions) {
      if (!q.label.trim()) return 'Every custom question needs a label.';
      if (q.type === 'select' && (!q.options || q.options.length < 2)) {
        return `Dropdown "${q.label}" needs at least two options.`;
      }
    }
    return null;
  };

  const resetToDefaults = () => setCustomQuestions([]);

  const saveChanges = async () => {
    if (!competition?.id) return;

    const validationError = validate();
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    try {
      // .select() forces the response to include the updated row(s). Without
      // it, an RLS denial (e.g. non-host viewer) returns { error: null } with
      // zero rows touched — the save looks successful but nothing was written.
      const { data, error } = await supabase
        .from('competitions')
        .update({
          nomination_form_config: { custom_questions: customQuestions },
          nomination_start: nomStart || null,
          nomination_end: nomEnd || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', competition.id)
        .select('id');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error("You don't have permission to edit this competition.");
      }

      // Keep a single nomination_periods row in sync (drives phase logic + the
      // public site) so the window isn't only in the flat fields.
      if (nomStart && nomEnd) {
        if (nomPeriodId) {
          await supabase
            .from('nomination_periods')
            .update({ start_date: nomStart, end_date: nomEnd })
            .eq('id', nomPeriodId);
        } else {
          const { data: inserted } = await supabase
            .from('nomination_periods')
            .insert({ competition_id: competition.id, title: 'Open Nominations', start_date: nomStart, end_date: nomEnd, period_order: 0 })
            .select('id')
            .single();
          if (inserted?.id) setNomPeriodId(inserted.id);
        }
      }
      setInitialNom({ start: nomStart, end: nomEnd });

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      toast.success('Nomination form saved');
      if (onSave) onSave();
    } catch (err) {
      console.error('Error saving nomination form config:', err);
      toast.error(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  // ---- custom question operations ----
  const addCustomQuestion = () => {
    if (customQuestions.length >= MAX_CUSTOM_QUESTIONS) return;
    setCustomQuestions((prev) => [
      ...prev,
      {
        id: newCustomQuestionId(),
        label: '',
        type: 'short_text',
        required: false,
        options: [],
        help_text: '',
      },
    ]);
  };

  const updateCustomQuestion = (id, patch) => {
    setCustomQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const removeCustomQuestion = (id) => {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  };

  // ---- styles ----
  const sectionHeaderStyle = {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: colors.text.muted,
    marginBottom: spacing.md,
  };

  const inputStyle = {
    width: '100%',
    padding: `${spacing.sm} ${spacing.md}`,
    background: 'rgba(255, 255, 255, 0.05)',
    border: `1px solid ${colors.border.primary}`,
    borderRadius: borderRadius.lg,
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const rowCardStyle = {
    background: 'rgba(255,255,255,0.02)',
    border: `1px solid ${colors.border.light}`,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
  };

  const flagButtonStyle = (active) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.md}`,
    background: active ? 'rgba(212,175,55,0.15)' : 'transparent',
    border: `1px solid ${active ? colors.gold.primary : colors.border.light}`,
    borderRadius: borderRadius.md,
    color: active ? colors.gold.primary : colors.text.secondary,
    fontSize: typography.fontSize.xs,
    cursor: 'pointer',
    fontWeight: typography.fontWeight.medium,
  });

  return (
    <Panel
      id={id}
      style={style}
      collapsible={collapsible}
      defaultCollapsed={defaultCollapsed}
      locked={locked}
      badge={badge}
      title="Nomination Form"
      icon={FormInput}
      action={
        customQuestions.length > 0 ? (
          <button
            onClick={resetToDefaults}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              background: 'transparent',
              border: 'none',
              color: colors.text.secondary,
              fontSize: typography.fontSize.sm,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={14} />
            Reset to Defaults
          </button>
        ) : null
      }
    >
      <div style={{ padding: spacing.xl }}>
        {/* When nominations open & close */}
        <div style={{ marginBottom: spacing.xxl }}>
          <div style={sectionHeaderStyle}>
            <Calendar size={13} style={{ display: 'inline', marginRight: spacing.xs, verticalAlign: 'middle' }} />
            When nominations open &amp; close
          </div>
          <p style={{ color: colors.gold.primary, fontSize: typography.fontSize.xs, margin: `0 0 ${spacing.md}` }}>
            We recommend {rec.weeks} weeks of nominations for {rec.label} competitions.
          </p>
          {autoFilled && (
            <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, margin: `0 0 ${spacing.md}` }}>
              We pre-filled these from your planned launch timeframe — adjust them and Save.
            </p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing.md }}>
            <div>
              <label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.muted, marginBottom: spacing.xs }}>Opens</label>
              <input type="datetime-local" value={nomStart} onChange={(e) => setNomStart(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: typography.fontSize.xs, color: colors.text.muted, marginBottom: spacing.xs }}>Closes</label>
              <input type="datetime-local" value={nomEnd} min={nomStart || undefined} onChange={(e) => setNomEnd(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
              {nomStart && (
                <button
                  type="button"
                  onClick={applyRecommendation}
                  style={{ marginTop: spacing.xs, background: 'transparent', border: 'none', color: colors.gold.primary, fontSize: typography.fontSize.xs, cursor: 'pointer', padding: 0 }}
                >
                  Use recommended ({rec.weeks} weeks)
                </button>
              )}
            </div>
          </div>
        </div>

        <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, margin: `0 0 ${spacing.xl}` }}>
          Add up to {MAX_CUSTOM_QUESTIONS} custom questions on top of the standard nomination flow.
          The nominee answers these themselves — when they self-nominate, or when
          they accept a nomination and build their card. Nominators never answer
          on someone else's behalf. Answers are saved with the nominee.
        </p>

        {/* Standard fields (read-only) */}
        <div style={{ marginBottom: spacing.xxl }}>
          <div style={sectionHeaderStyle}>Standard Fields</div>
          <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, margin: `0 0 ${spacing.md}` }}>
            These are always collected and can't be removed.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: spacing.xs }}>
            {getStandardNominationFields(competition).map((f) => (
              <div
                key={f.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: spacing.sm,
                  padding: `${spacing.sm} ${spacing.md}`,
                  background: colors.background.secondary,
                  border: `1px solid ${colors.border.lighter}`,
                  borderRadius: borderRadius.md,
                  minHeight: '40px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, minWidth: 0 }}>
                  <Lock size={12} style={{ color: colors.text.muted, opacity: 0.5, flexShrink: 0 }} />
                  <span style={{ fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium }}>
                    {f.label}
                  </span>
                </div>
                <span style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, flexShrink: 0 }}>
                  {f.stage}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Custom questions */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: spacing.md,
              gap: spacing.md,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div style={sectionHeaderStyle}>
                Custom Questions ({customQuestions.length}/{MAX_CUSTOM_QUESTIONS})
              </div>
              <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, margin: 0 }}>
                Answered by the nominee when they self-nominate or build their card.
              </p>
            </div>
            <Button
              size="sm"
              icon={Plus}
              onClick={addCustomQuestion}
              disabled={customQuestions.length >= MAX_CUSTOM_QUESTIONS}
            >
              Add Question
            </Button>
          </div>

          {customQuestions.length === 0 ? (
            <div
              style={{
                ...rowCardStyle,
                textAlign: 'center',
                color: colors.text.muted,
                fontSize: typography.fontSize.sm,
                padding: spacing.xl,
              }}
            >
              No custom questions yet. Click "Add Question" to add one.
            </div>
          ) : (
            customQuestions.map((q) => (
              <CustomQuestionRow
                key={q.id}
                question={q}
                onChange={(patch) => updateCustomQuestion(q.id, patch)}
                onRemove={() => removeCustomQuestion(q.id)}
                inputStyle={inputStyle}
                flagButtonStyle={flagButtonStyle}
                cardStyle={rowCardStyle}
              />
            ))
          )}
        </div>

        {/* Save */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            paddingTop: spacing.md,
            borderTop: `1px solid ${colors.border.primary}`,
            marginTop: spacing.lg,
          }}
        >
          <Button onClick={saveChanges} disabled={!hasChanges() || saving} icon={saved ? Check : null}>
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function CustomQuestionRow({ question, onChange, onRemove, inputStyle, flagButtonStyle, cardStyle }) {
  const showOptions = question.type === 'select';
  const optionsText = (question.options || []).join('\n');

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', gap: spacing.sm, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
          <input
            type="text"
            value={question.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Question label (e.g. What's your favorite local cause?)"
            maxLength={140}
            style={inputStyle}
          />

          <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
            <select
              value={question.type}
              onChange={(e) =>
                onChange({
                  type: e.target.value,
                  options: e.target.value === 'select' ? question.options : [],
                })
              }
              style={{ ...inputStyle, width: 'auto', minWidth: '160px' }}
            >
              {CUSTOM_QUESTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>

            <button
              onClick={() => onChange({ required: !question.required })}
              style={flagButtonStyle(question.required)}
            >
              <AlertCircle size={12} />
              {question.required ? 'Required' : 'Optional'}
            </button>
          </div>

          <input
            type="text"
            value={question.help_text || ''}
            onChange={(e) => onChange({ help_text: e.target.value })}
            placeholder="Help text (optional)"
            maxLength={200}
            style={{ ...inputStyle, fontSize: typography.fontSize.sm }}
          />

          {showOptions && (
            <textarea
              value={optionsText}
              onChange={(e) =>
                onChange({
                  options: e.target.value
                    .split('\n')
                    .map((line) => line.trim())
                    .filter(Boolean),
                })
              }
              placeholder="One option per line"
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', fontSize: typography.fontSize.sm }}
            />
          )}
        </div>

        <button
          onClick={onRemove}
          style={{
            padding: spacing.xs,
            background: 'transparent',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: borderRadius.md,
            color: '#ef4444',
            cursor: 'pointer',
            width: '30px',
            height: '30px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export default NominationFormEditor;
