import React, { useState, useEffect } from 'react';
import { Send, Mail, Bell, Users } from 'lucide-react';
import { Modal, Button, Input, Textarea } from '../ui';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';

const SUBJECT_MAX = 150;
const MESSAGE_MAX = 2000;

/**
 * MessageContestantModal — lets a host compose a direct message to one or more
 * contestants. Delivered in-app (notifications bell) to contestants with an
 * account, and previewed by email to every contestant with an email address.
 *
 * Props:
 *   isOpen, onClose
 *   recipients        Array<{ id, name, userId, email }>
 *   competitionName   string — shown for context
 *   onSend(recipientIds, subject, message) => Promise<{ success, error?, data? }>
 */
export default function MessageContestantModal({
  isOpen,
  onClose,
  recipients = [],
  competitionName,
  onSend,
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setMessage('');
      setSending(false);
      setError(null);
    }
  }, [isOpen]);

  const count = recipients.length;
  const isSingle = count === 1;
  const withEmail = recipients.filter((r) => r.email).length;
  const withAccount = recipients.filter((r) => r.userId).length;

  const audienceLabel = isSingle
    ? recipients[0]?.name || 'this contestant'
    : `${count} contestant${count === 1 ? '' : 's'}`;

  const canSend = subject.trim().length > 0 && message.trim().length > 0 && count > 0 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const result = await onSend(
        recipients.map((r) => r.id),
        subject.trim(),
        message.trim()
      );
      if (result && result.success === false) {
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

  const chipStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing.xs,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: 'rgba(255,255,255,0.05)',
    borderRadius: borderRadius.pill,
    fontSize: typography.fontSize.xs,
    color: colors.text.secondary,
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isSingle ? `Message ${audienceLabel}` : 'Message Contestants'}
      maxWidth="560px"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.md, width: '100%' }}>
          <Button variant="secondary" onClick={onClose} disabled={sending} style={{ width: 'auto' }}>
            Cancel
          </Button>
          <Button onClick={handleSend} icon={Send} disabled={!canSend} style={{ width: 'auto' }}>
            {sending ? 'Sending…' : isSingle ? 'Send Message' : `Send to ${count}`}
          </Button>
        </div>
      }
    >
      {/* Audience summary */}
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
        <div>
          <p style={{ margin: 0, color: colors.text.primary, fontSize: typography.fontSize.md, fontWeight: typography.fontWeight.medium }}>
            {isSingle ? audienceLabel : `Sending to ${audienceLabel}`}
            {competitionName ? <span style={{ color: colors.text.secondary }}> · {competitionName}</span> : null}
          </p>
          <div style={{ display: 'flex', gap: spacing.sm, marginTop: spacing.xs, flexWrap: 'wrap' }}>
            <span style={chipStyle}><Bell size={12} /> {withAccount} in-app</span>
            <span style={chipStyle}><Mail size={12} /> {withEmail} email</span>
          </div>
        </div>
      </div>

      <Input
        label="Subject"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="e.g., Photoshoot details for Saturday"
        maxLength={SUBJECT_MAX}
      />

      <Textarea
        label="Message"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Write your message to your contestant(s)…"
        rows={6}
        maxLength={MESSAGE_MAX}
        showCount
      />

      <p style={{ margin: `0 0 ${spacing.md}`, color: colors.text.muted, fontSize: typography.fontSize.xs }}>
        Contestants with an account get this in their notifications; everyone with an email on file
        also receives an email preview of your message.
      </p>

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
