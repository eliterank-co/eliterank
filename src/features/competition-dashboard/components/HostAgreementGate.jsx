import React, { useState } from 'react';
import { FileText, CheckCircle, Loader, LogOut } from 'lucide-react';
import { Button } from '../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import {
  HOST_AGREEMENT_TITLE,
  HOST_AGREEMENT_BODY,
  HOST_AGREEMENT_VERSION,
  acceptHostAgreement,
} from '../../../lib/hostAgreement';

/**
 * HostAgreementGate — a BLOCKING re-acceptance overlay.
 *
 * When the Host Agreement version is bumped, an existing host who accepted an
 * older version must re-accept the current one before they can keep using the
 * dashboard. Unlike HostAgreementCard (a passive card the host might never
 * scroll to), this overlays the whole dashboard and can only be dismissed by
 * accepting — or by logging out. The caller decides WHEN to render it (see
 * CompetitionDashboard: shown only to a real host of an unmanaged org whose
 * accepted version is stale).
 *
 * Deliberately NOT the shared Modal: a blocking gate must not offer an X or a
 * backdrop-close that lets the host slip past without accepting.
 */
export default function HostAgreementGate({ organizationId, onAccepted, onLogout }) {
  const [checked, setChecked] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(null);

  const handleAccept = async () => {
    if (!organizationId || !checked || accepting) return;
    setAccepting(true);
    setError(null);
    try {
      await acceptHostAgreement(organizationId);
      onAccepted?.();
    } catch (err) {
      console.error('Failed to record agreement re-acceptance:', err);
      setError(err?.message || 'Could not record your acceptance. Please try again.');
      setAccepting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: colors.background.primary,
          border: `1px solid ${colors.border.primary}`,
          borderRadius: borderRadius.lg,
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: spacing.xl, borderBottom: `1px solid ${colors.border.primary}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
            <FileText size={18} style={{ color: colors.gold.primary }} />
            <h2
              style={{
                margin: 0,
                color: colors.text.primary,
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
              }}
            >
              We've updated the {HOST_AGREEMENT_TITLE}
            </h2>
          </div>
          <p style={{ margin: 0, color: colors.text.secondary, fontSize: typography.fontSize.sm, lineHeight: 1.5 }}>
            Please review and accept the updated agreement to continue managing your competition.
            Your competitions keep running in the meantime.
          </p>
        </div>

        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: spacing.lg,
            margin: spacing.lg,
            marginBottom: 0,
            background: colors.background.secondary,
            border: `1px solid ${colors.border.primary}`,
            borderRadius: borderRadius.lg,
            color: colors.text.secondary,
            fontSize: typography.fontSize.sm,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
          }}
        >
          {HOST_AGREEMENT_BODY}
        </div>

        <div style={{ padding: spacing.xl }}>
          <p style={{ color: colors.text.muted, fontSize: typography.fontSize.xs, marginTop: 0, marginBottom: spacing.md }}>
            Version {HOST_AGREEMENT_VERSION}
          </p>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: spacing.sm,
              cursor: 'pointer',
              color: colors.text.primary,
              fontSize: typography.fontSize.sm,
              marginBottom: spacing.lg,
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
              disabled={accepting}
              style={{ marginTop: 3, accentColor: colors.gold.primary, width: 16, height: 16 }}
            />
            <span>I have read and agree to the {HOST_AGREEMENT_TITLE} on behalf of this organization.</span>
          </label>

          {error && (
            <p style={{ color: colors.status.error, fontSize: typography.fontSize.xs, marginBottom: spacing.md }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', gap: spacing.md, flexWrap: 'wrap' }}>
            <Button
              onClick={handleAccept}
              disabled={!checked || accepting || !organizationId}
              icon={accepting ? Loader : CheckCircle}
            >
              {accepting ? 'Recording…' : 'Accept agreement'}
            </Button>
            {onLogout && (
              <Button variant="ghost" onClick={onLogout} disabled={accepting} icon={LogOut}>
                Log out
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
