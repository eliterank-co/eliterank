import React, { useState } from 'react';
import { ChevronDown, ChevronUp, MessageSquare } from 'lucide-react';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';

/**
 * NomineeCustomAnswers
 *
 * Host-facing, read-only display of a nominee's answers to the host-defined
 * custom questions (stored in `nominees.eligibility_answers` under the
 * question's `cq_`-prefixed id). Collapsible so nominee rows stay compact by
 * default. Renders nothing unless the competition has custom questions AND the
 * nominee answered at least one of them (so nominees who never reached the
 * questions — e.g. still awaiting response — show no empty section).
 *
 * @param {Array}  questions - resolved custom questions: { id, label, type, options }
 * @param {Object} answers   - the raw eligibility_answers blob (may be null)
 */
export default function NomineeCustomAnswers({ questions, answers }) {
  const [open, setOpen] = useState(false);

  if (!Array.isArray(questions) || questions.length === 0) return null;
  const blob = answers && typeof answers === 'object' ? answers : {};

  const isAnswered = (q) => {
    const v = blob[q.id];
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    return true; // booleans (yes/no, checkbox) count as answered
  };

  const answeredCount = questions.filter(isAnswered).length;
  if (answeredCount === 0) return null;

  const formatAnswer = (q) => {
    const v = blob[q.id];
    if (q.type === 'yes_no') return v === true ? 'Yes' : v === false ? 'No' : '—';
    if (q.type === 'checkbox') return v === true ? 'Yes' : 'No';
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v === undefined || v === null || v === '') return null; // unanswered
    return String(v);
  };

  return (
    <div style={{ marginTop: spacing.xs, width: '100%' }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.xs,
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          color: colors.gold.primary,
          fontSize: typography.fontSize.xs,
          fontWeight: typography.fontWeight.medium,
        }}
        aria-expanded={open}
      >
        <MessageSquare size={12} />
        {answeredCount === 1 ? '1 response' : `${answeredCount} responses`}
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {open && (
        <div
          style={{
            marginTop: spacing.xs,
            padding: spacing.sm,
            background: colors.background.primary,
            border: `1px solid ${colors.border.secondary}`,
            borderRadius: borderRadius.md,
            display: 'flex',
            flexDirection: 'column',
            gap: spacing.sm,
          }}
        >
          {questions.map((q) => {
            const answer = formatAnswer(q);
            return (
              <div key={q.id} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span
                  style={{
                    fontSize: typography.fontSize.xs,
                    color: colors.text.muted,
                    fontWeight: typography.fontWeight.medium,
                  }}
                >
                  {q.label}
                </span>
                <span
                  style={{
                    fontSize: typography.fontSize.sm,
                    color: answer ? colors.text.primary : colors.text.muted,
                    fontStyle: answer ? 'normal' : 'italic',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {answer || 'No response'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
