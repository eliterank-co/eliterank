import React, { useEffect, useRef, useState } from 'react';
import { Landmark, CheckCircle, Clock, AlertTriangle, ExternalLink, Loader, RefreshCw } from 'lucide-react';
import { Panel, Button } from '../../../components/ui';
import { colors, spacing, borderRadius, typography } from '../../../styles/theme';
import { useToast } from '../../../contexts/ToastContext';
import { supabase } from '../../../lib/supabase';
import { useStripeConnect } from '../hooks/useStripeConnect';

/**
 * HostConnectCard — Stripe Connect (payouts) status + onboarding entry point
 * for the host organization (§5.1).
 *
 * Shows the org's current KYC/connection state and a CTA to start or finish
 * Stripe's hosted onboarding. Identity (SSN/EIN) is entered into Stripe, never
 * here (Invariant 15).
 *
 * Stripe verifies KYC in the background, so a host returning from onboarding
 * usually lands on `pending`. The stripe-webhook is the source of truth — on
 * Stripe's `account.updated` it writes the new kyc_status + capability flags to
 * the org row (§5.1) — so this card subscribes to that row over Realtime and
 * reflects the flip the instant it lands: no reload, no Stripe-polling. A
 * manual "Check status now" button re-pulls straight from Stripe as an escape
 * hatch (e.g. if a webhook is ever missed).
 *
 * Props:
 *   - connect: { hasAccount, kycStatus, chargesEnabled, payoutsEnabled, detailsSubmitted }
 *   - organizationId: string
 *   - onSynced: () => void — called after a status change so the parent can
 *     refresh the dashboard (which re-renders this card and the launch gates).
 */
export default function HostConnectCard({ connect, organizationId, locked = false, onSynced }) {
  const { startOnboarding, syncStatus, starting, syncing, error } = useStripeConnect();
  const toast = useToast();

  // Host's legal-entity country, chosen before the first connect. Sets the
  // Stripe account country + payout currency (US → USD, CA → CAD) and is fixed
  // once the account exists, so the picker only shows before onboarding starts.
  const [country, setCountry] = useState('US');

  const status = connect?.kycStatus || 'not_started';
  const verified = status === 'verified';
  const pending = status === 'pending';
  const failed = status === 'failed';
  const notStarted = status === 'not_started';

  // Keep the latest callbacks/status in refs so the realtime effect doesn't
  // tear down and re-subscribe when the parent passes new (unmemoized) props.
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const statusRef = useRef(status);
  statusRef.current = status;

  const announceTransition = (kyc) => {
    if (kyc === 'verified') {
      toastRef.current?.success?.('Stripe account connected — payouts are enabled.');
    } else if (kyc === 'failed') {
      toastRef.current?.error?.('Stripe needs more information before payouts can be enabled.');
    }
  };

  // Subscribe to the org's connect row while KYC isn't yet verified. The
  // stripe-webhook writes the new kyc_status on Stripe's `account.updated`,
  // which the DB mirrors into `organization_connect` (a strict-RLS table only
  // the org's owner/co-hosts can read — so this subscription can't be used to
  // snoop on other orgs). Realtime pushes that change here so the card — and
  // the launch gates, via onSynced→refresh — update instantly. Realtime doesn't
  // replay events missed while the socket was down, so on every re-subscribe we
  // refresh to catch up.
  useEffect(() => {
    if (verified || !organizationId) return;
    let subscribedBefore = false;
    const channel = supabase
      .channel(`org-connect-${organizationId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'organization_connect', filter: `organization_id=eq.${organizationId}` },
        (payload) => {
          const next = payload.new?.kyc_status;
          if (next && next !== statusRef.current) announceTransition(next);
          onSyncedRef.current?.();
        }
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') {
          if (subscribedBefore) onSyncedRef.current?.();
          subscribedBefore = true;
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
    // Callbacks/status are read via refs, so they needn't be deps.
  }, [verified, organizationId]);

  // Manual "Check status now" — same authoritative Stripe pull, on demand.
  const handleManualSync = async () => {
    const result = await syncStatus(organizationId);
    if (result?.kyc_status && result.kyc_status !== 'pending') {
      announceTransition(result.kyc_status);
    }
    onSyncedRef.current?.();
  };

  // Status presentation (status colors are used for genuine status here — OK
  // per the brand rules).
  const meta = verified
    ? { color: colors.status.success, Icon: CheckCircle, label: 'Connected', tint: 'rgba(34,197,94,0.1)' }
    : pending
    ? { color: colors.status.warning, Icon: Clock, label: 'Verifying', tint: 'rgba(234,179,8,0.1)' }
    : failed
    ? { color: colors.status.error, Icon: AlertTriangle, label: 'Action needed', tint: 'rgba(239,68,68,0.1)' }
    : { color: colors.text.muted, Icon: Landmark, label: 'Not connected', tint: colors.background.secondary };

  const description = locked
    ? 'Accept the Host Agreement above first, then connect a Stripe account to receive your share of vote revenue.'
    : verified
    ? 'Your Stripe account is verified. Payouts to your bank are enabled.'
    : pending
    ? 'Stripe is verifying your details. This usually takes a few minutes; we’ll update this automatically.'
    : failed
    ? 'Stripe needs more information before payouts can be enabled. Continue onboarding to resolve it.'
    : 'Connect a Stripe account to receive your share of vote revenue. You’ll enter your details securely on Stripe — we never see or store your SSN/EIN.';

  const ctaLabel = notStarted
    ? 'Connect with Stripe'
    : verified
    ? 'Manage on Stripe'
    : 'Finish verification';

  return (
    <Panel
      title="Payouts"
      icon={Landmark}
      style={{ marginBottom: 0 }}
      action={
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: spacing.xs,
            padding: `${spacing.xs} ${spacing.sm}`,
            borderRadius: borderRadius.pill,
            background: meta.tint,
            color: meta.color,
            fontSize: typography.fontSize.xs,
            fontWeight: typography.fontWeight.semibold,
          }}
        >
          <meta.Icon size={12} />
          {meta.label}
        </span>
      }
    >
      <div style={{ padding: spacing.xl }}>
        <p
          style={{
            color: colors.text.secondary,
            fontSize: typography.fontSize.sm,
            lineHeight: 1.5,
            marginBottom: spacing.lg,
          }}
        >
          {description}
        </p>

        {verified && (
          <div
            style={{
              display: 'flex',
              gap: spacing.lg,
              marginBottom: spacing.lg,
              fontSize: typography.fontSize.sm,
            }}
          >
            <CapabilityFlag label="Charges" enabled={connect?.chargesEnabled} />
            <CapabilityFlag label="Payouts" enabled={connect?.payoutsEnabled} />
          </div>
        )}

        {error && (
          <p
            style={{
              color: colors.status.error,
              fontSize: typography.fontSize.xs,
              marginBottom: spacing.md,
            }}
          >
            {error}
          </p>
        )}

        {!connect?.hasAccount && (
          <div style={{ marginBottom: spacing.lg }}>
            <label
              style={{
                display: 'block',
                color: colors.text.secondary,
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.semibold,
                marginBottom: spacing.sm,
              }}
            >
              Where is your business based?
            </label>
            <div style={{ display: 'flex', gap: spacing.sm }}>
              {[
                { code: 'US', label: '🇺🇸 United States' },
                { code: 'CA', label: '🇨🇦 Canada' },
              ].map((opt) => {
                const selected = country === opt.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setCountry(opt.code)}
                    disabled={locked}
                    style={{
                      flex: 1,
                      padding: `${spacing.sm} ${spacing.md}`,
                      borderRadius: borderRadius.md,
                      border: `1px solid ${selected ? colors.gold.primary : colors.border.primary}`,
                      // Subtle gold tint on the selected option (matches the
                      // status-tint pattern used elsewhere in this card).
                      background: selected ? 'rgba(212,175,55,0.1)' : colors.background.secondary,
                      color: selected ? colors.gold.primary : colors.text.secondary,
                      fontSize: typography.fontSize.sm,
                      fontWeight: selected ? typography.fontWeight.semibold : typography.fontWeight.normal,
                      cursor: locked ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p
              style={{
                color: colors.text.muted,
                fontSize: typography.fontSize.xs,
                marginTop: spacing.sm,
              }}
            >
              Choose where your business is legally registered and banks. This sets your payout
              currency (USD or CAD) and can’t be changed after you connect.
            </p>
          </div>
        )}

        <Button
          onClick={() => startOnboarding(organizationId, country)}
          disabled={starting || !organizationId || locked}
          icon={starting ? Loader : ExternalLink}
          variant={verified ? 'secondary' : 'primary'}
        >
          {starting ? 'Opening Stripe…' : ctaLabel}
        </Button>

        {pending && (
          <div style={{ marginTop: spacing.md }}>
            <Button
              onClick={handleManualSync}
              disabled={syncing || !organizationId}
              icon={syncing ? Loader : RefreshCw}
              variant="ghost"
            >
              {syncing ? 'Checking…' : 'Check status now'}
            </Button>
            <p
              style={{
                color: colors.text.muted,
                fontSize: typography.fontSize.xs,
                marginTop: spacing.sm,
              }}
            >
              This updates automatically the moment Stripe finishes — no need to reload.
            </p>
          </div>
        )}
      </div>
    </Panel>
  );
}

function CapabilityFlag({ label, enabled }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: spacing.xs,
        color: enabled ? colors.status.success : colors.text.muted,
      }}
    >
      <CheckCircle size={14} style={{ opacity: enabled ? 1 : 0.4 }} />
      {label} {enabled ? 'enabled' : 'off'}
    </span>
  );
}
