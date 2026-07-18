import React, { useState, useEffect } from 'react';
import { Send, Users, Crown, UserCheck, Clock } from 'lucide-react';
import { Modal, Button, Input, Textarea } from '../ui';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';

const SUBJECT_MAX = 150;
const MESSAGE_MAX = 2000;

const AUDIENCES = [
  { value: 'contestants', label: 'Contestants', icon: Crown },
  { value: 'nominees', label: 'Nominees', icon: UserCheck },
  { value: 'everyone', label: 'Everyone', icon: Users },
];

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
  } catch {
    return '';
  }
};

/**
 * HostBroadcastModal — lets a host send ONE message to a whole audience
 * (all contestants, all nominees, or everyone). Limited to once per week per
 * competition; the weekly status is checked when the modal opens.
 *
 * Props:
 *   isOpen, onClose
 *   defaultAudience   'contestants' | 'nominees' | 'everyone'
 *   reach             { contestants: number, nominees: number }  // rough people counts
 *   competitionName   string
 *   onCheckStatus()   => Promise<{ canSend, nextAllowedAt }>
 *   onSend(audience, subject, message) => Promise<{ success, error?, data? }>
 */
export default function HostBroadcastModal({
  isOpen,
  onClose,
  defaultAudience = 'contestants',
  allowNominees = true,
  reach = { contestants: 0, nominees: 0 },
  competitionName,
  onCheckStatus,
  onSend,
}) {
  // Once nominations close, only Contestants can be messaged — drop the
  // Nominees and Everyone options.
  const availableAudiences = allowNominees
    ? AUDIENCES
    : AUDIENCES.filter((a) => a.value === 'contestants');
  const resolvedDefault =
    !allowNominees && defaultAudience !== 'contestants' ? 'contestants' : defaultAudience;

  const [audience, setAudience] = useState(resolvedDefault);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState({ loading: true, canSend: true, nextAllowedAt: null });

  // Reset + re-check the weekly limit each time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setAudience(resolvedDefault);
    setSubject('');
    setMessage('');
    setSending(false);
    setError(null);
    setStatus({ loading: true, canSend: true, nextAllowedAt: null });

    let cancelled = false;
    (async () => {
      if (!onCheckStatus) {
        if (!cancelled) setStatus({ loading: false, canSend: true, nextAllowedAt: null });
        return;
      }
      try {
        const result = await onCheckStatus();
        if (!cancelled) {
          setStatus({
            loading: false,
            canSend: result?.canSend !== false,
            nextAllowedAt: result?.nextAllowedAt || null,
          });
        }
      } catch {
        if (!cancelled) setStatus({ loading: false, canSend: true, nextAllowedAt: null });
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen, resolvedDefault, onCheckStatus]);

  const reachCount =
    audience === 'contestants' ? reach.contestants
      : audience === 'nominees' ? reach.nominees
        : reach.contestants + reach.nominees;

  const limitReached = !status.loading && !status.canSend;
  const canSend =
    subject.trim().length > 0 &&
    message.trim().length > 0 &&
    !sending &&
    !status.loading &&
    !limitReached;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const result = await onSend(audience, subject.trim(), message.trim());
      if (result && result.success === false) {
        // Server may report the weekly limit was hit since we last checked.
        if (result.data?.rate_limited || result.rate_limited) {
          setStatus({ loading: false, canSend: false, nextAllowedAt: result.data?.next_allowed_at || result.next_allowed_at || null });
        }
        setError(result.error || 'Failed to send message');
        setSending(false);
        return;
      }
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to send message');
      setSending(false);
    }
  };

  const audienceButtonStyle = (active) => ({
    flex: 1,
    padding: `${spacing.sm} ${spacing.md}`,
    borderRadius: borderRadius.md,
    border: active ? `1px solid ${colors.gold.primary}` : `1px solid ${colors.border.primary}`,
    background: active ? 'rgba(212,175,55,0.12)' : 'rgba(255,255,255,0.03)',
    color: active ? colors.gold.primary : colors.text.secondary,
    fontWeight: typography.fontWeight.medium,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    fontSize: typography.fontSize.sm,
    transition: 'all 0.2s',
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Message Your Audience"
      maxWidth="560px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.md, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={sending} style={{ width: 'auto' }}>
            Cancel
          </Button>
          <Button onClick={handleSend} icon={Send} disabled={!canSend} style={{ width: 'auto' }}>
            {sending ? 'Sending…' : `Send to ${reachCount}`}
          </Button>
        </div>
      }
    >
      {/* Weekly limit banner */}
      {limitReached ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.md,
            background: 'rgba(245,158,11,0.1)',
            border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: borderRadius.lg,
            marginBottom: spacing.lg,
          }}
        >
          <Clock size={18} style={{ color: colors.status.warning, flexShrink: 0 }} />
          <p style={{ margin: 0, color: colors.text.primary, fontSize: typography.fontSize.sm }}>
            You've already messaged your audience this week. You can send again on{' '}
            <strong>{formatDate(status.nextAllowedAt)}</strong>.
          </p>
        </div>
      ) : (
        <p style={{ margin: `0 0 ${spacing.md}`, color: colors.text.muted, fontSize: typography.fontSize.xs, display: 'flex', alignItems: 'center', gap: spacing.xs }}>
          <Clock size={12} /> You can send one message to your audience per week.
        </p>
      )}

      {/* Audience selector — hidden entirely when only one audience is available */}
      <label style={{ display: 'block', fontSize: typography.fontSize.sm, color: colors.text.secondary, marginBottom: spacing.sm }}>
        Send to
      </label>
      <div style={{ display: 'flex', gap: spacing.sm, marginBottom: spacing.md }}>
        {availableAudiences.map((a) => {
          const Icon = a.icon;
          return (
            <button key={a.value} type="button" onClick={() => setAudience(a.value)} style={audienceButtonStyle(audience === a.value)}>
              <Icon size={14} /> {a.label}
            </button>
          );
        })}
      </div>

      {/* Reach summary */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
          padding: spacing.md,
          background: 'rgba(212,175,55,0.08)',
          border: `1px solid rgba(212,175,55,0.2)`,
          borderRadius: borderRadius.lg,
          marginBottom: spacing.lg,
        }}
      >
        <Users size={18} style={{ color: colors.gold.primary, flexShrink: 0 }} />
        <p style={{ margin: 0, color: colors.text.primary, fontSize: typography.fontSize.md }}>
          {reachCount} {reachCount === 1 ? 'person' : 'people'}
          {competitionName ? <span style={{ color: colors.text.secondary }}> · {competitionName}</span> : null}
          <span style={{ display: 'block', color: colors.text.muted, fontSize: typography.fontSize.xs, marginTop: '2px' }}>
            Delivered in their notifications and by email.
          </span>
        </p>
      </div>

      <Input
        label="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="e.g., Photoshoot details for Saturday"
        maxLength={SUBJECT_MAX}
        disabled={limitReached}
      />

      <Textarea
        label="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Write your message…"
        rows={6}
        maxLength={MESSAGE_MAX}
        showCount
        disabled={limitReached}
      />

      {error && (
        <p
          style={{
            margin: 0,
            padding: spacing.md,
            background: 'rgba(239,68,68,0.1)',
            borderRadius: borderRadius.md,
            color: colors.status.error,
            fontSize: typography.fontSize.sm,
          }}
        >
          {error}
        </p>
      )}
    </Modal>
  );
}
