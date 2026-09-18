import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users, ShieldCheck, Ban, PauseCircle, History,
  RotateCcw, AlertTriangle,
} from 'lucide-react';
import { colors, spacing, borderRadius, typography } from '@shared/styles/theme';
import { supabase } from '@shared/lib/supabase';
import { useToast } from '@shared/contexts/ToastContext';
import StatRow from '../../../components/StatRow';
import FilterBar from '../../../components/FilterBar';
import DataTable from '../../../components/DataTable';
import ActionMenu from '../../../components/ActionMenu';
import FormModal from '../../../components/FormModal';
import { FormField, TextInput, TextArea } from '../../../components/FormField';

const PROFILE_COLUMNS = 'id,email,first_name,last_name,city,created_at,is_super_admin,is_host';

const STATUS_META = {
  active: { label: 'Active', color: colors.status.success, icon: ShieldCheck },
  suspended: { label: 'Suspended', color: colors.status.warning, icon: PauseCircle },
  banned: { label: 'Banned', color: colors.status.error, icon: Ban },
};

const ACTION_LABEL = {
  suspend: 'Suspended',
  ban: 'Banned',
  restore: 'Restored',
};

function statusOf(account) {
  return account?.account_status?.status || 'active';
}

function describeError(err) {
  const msg = err?.message || '';
  if (msg.includes('cannot_enforce_self')) return 'You cannot suspend or ban your own account.';
  if (msg.includes('cannot_enforce_super_admin')) return 'Super admin accounts cannot be suspended or banned.';
  if (msg.includes('user_not_found')) return 'That user no longer exists.';
  if (msg.includes('invalid_suspended_until')) return 'The suspension end date must be in the future.';
  if (msg.includes('not_authorized')) return 'You are not authorized to perform this action.';
  return msg || 'The action could not be completed.';
}

export default function AccountsManager() {
  const toast = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchValue, setSearchValue] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Enforcement modal
  const [enforcement, setEnforcement] = useState(null); // { mode, account }
  const [reason, setReason] = useState('');
  const [suspendUntil, setSuspendUntil] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // History modal
  const [historyFor, setHistoryFor] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!supabase) { setAccounts([]); return; }
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const rows = profiles || [];
      let statusByUser = {};
      if (rows.length > 0) {
        const { data: statuses, error: statusErr } = await supabase
          .from('account_status')
          .select('user_id,status,reason,suspended_until,updated_at')
          .in('user_id', rows.map((p) => p.id));
        if (!statusErr) {
          statusByUser = Object.fromEntries((statuses || []).map((s) => [s.user_id, s]));
        }
      }

      setAccounts(rows.map((p) => ({ ...p, account_status: statusByUser[p.id] || null })));
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setAccounts([]);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const load = async () => {
      setLoading(true);
      try { await fetchAccounts(); }
      finally { if (isMounted) setLoading(false); }
    };
    load();
    return () => { isMounted = false; };
  }, [fetchAccounts]);

  const openEnforcement = (mode, account) => {
    setEnforcement({ mode, account });
    setReason('');
    setSuspendUntil('');
    setFormError('');
  };

  const closeEnforcement = () => {
    if (submitting) return;
    setEnforcement(null);
  };

  const submitEnforcement = async () => {
    if (!supabase || !enforcement) return;
    const { mode, account } = enforcement;

    if (mode !== 'restore' && !reason.trim()) {
      setFormError('A reason is required.');
      return;
    }

    setFormError('');
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('admin_set_account_status', {
        p_user_id: account.id,
        p_action: mode,
        p_reason: mode === 'restore' ? null : reason.trim(),
        p_suspended_until: mode === 'suspend' && suspendUntil
          ? new Date(suspendUntil).toISOString()
          : null,
      });
      if (error) throw error;

      await fetchAccounts();
      setEnforcement(null);
      toast.success(`Account ${ACTION_LABEL[mode].toLowerCase()}.`);
    } catch (err) {
      console.error('Error setting account status:', err);
      setFormError(describeError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const openHistory = async (account) => {
    setHistoryFor(account);
    setHistory([]);
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from('account_enforcement_actions')
        .select('id,action,status_before,status_after,reason,suspended_until,performed_by_email,created_at')
        .eq('user_id', account.id)
        .order('created_at', { ascending: false })
        .limit(25);
      if (error) throw error;
      setHistory(data || []);
    } catch (err) {
      console.error('Error fetching enforcement history:', err);
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return accounts.filter((a) => {
      if (statusFilter && statusOf(a) !== statusFilter) return false;
      if (!q) return true;
      const name = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
      return name.includes(q) || (a.email || '').toLowerCase().includes(q);
    });
  }, [accounts, statusFilter, searchValue]);

  const stats = useMemo(() => [
    { label: 'Shown', value: accounts.length, icon: Users },
    { label: 'Suspended', value: accounts.filter((a) => statusOf(a) === 'suspended').length, icon: PauseCircle, color: colors.status.warning },
    { label: 'Banned', value: accounts.filter((a) => statusOf(a) === 'banned').length, icon: Ban, color: colors.status.error },
  ], [accounts]);

  const columns = useMemo(() => [
    {
      key: 'name', label: 'Account', sortable: true,
      render: (_, row) => {
        const name = `${row.first_name || ''} ${row.last_name || ''}`.trim() || row.email;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
            <div style={S.avatar}>{name.charAt(0).toUpperCase()}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: typography.fontWeight.medium }}>{name}</span>
              {row.is_super_admin && <span style={S.subtle}>Super admin</span>}
            </div>
          </div>
        );
      },
    },
    { key: 'email', label: 'Email', sortable: true },
    {
      key: 'status', label: 'Status', width: '130px', sortable: true,
      render: (_, row) => {
        const meta = STATUS_META[statusOf(row)];
        const Icon = meta.icon;
        return (
          <span style={{ ...S.badge, color: meta.color, borderColor: meta.color }}>
            <Icon size={12} />
            {meta.label}
          </span>
        );
      },
    },
    {
      key: 'reason', label: 'Reason', width: '220px',
      render: (_, row) => {
        const st = row.account_status;
        if (!st?.reason) return <span style={S.subtle}>--</span>;
        const until = st.suspended_until
          ? ` (until ${new Date(st.suspended_until).toLocaleDateString()})`
          : '';
        return <span style={S.subtle}>{st.reason}{until}</span>;
      },
    },
    {
      key: 'created_at', label: 'Joined', sortable: true, width: '110px',
      render: (val) => (val ? val.split('T')[0] : '--'),
    },
  ], []);

  const actionLabel = enforcement?.mode === 'suspend'
    ? 'Suspend Account'
    : enforcement?.mode === 'ban'
      ? 'Ban Account'
      : 'Restore Account';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
      <div style={S.headerRow}>
        <div>
          <h1 style={S.title}>Account Enforcement</h1>
          <p style={S.subtitle}>Suspend, ban, or restore user accounts</p>
        </div>
      </div>

      <StatRow stats={stats} />

      <FilterBar
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        searchPlaceholder="Search by name or email..."
        filters={[{
          key: 'status', label: 'Status',
          options: [
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
            { value: 'banned', label: 'Banned' },
          ],
          value: statusFilter,
        }]}
        onFilterChange={(key, value) => { if (key === 'status') setStatusFilter(value); }}
      />

      <DataTable
        columns={columns}
        data={filtered}
        loading={loading}
        emptyMessage="No accounts found."
        actions={(row) => {
          const status = statusOf(row);
          const actions = [
            { label: 'History', icon: History, onClick: () => openHistory(row) },
          ];
          if (status !== 'suspended') {
            actions.push({ label: 'Suspend', icon: PauseCircle, onClick: () => openEnforcement('suspend', row) });
          }
          if (status !== 'banned') {
            actions.push({ label: 'Ban', icon: Ban, variant: 'danger', onClick: () => openEnforcement('ban', row) });
          }
          if (status !== 'active') {
            actions.push({ label: 'Restore', icon: RotateCcw, onClick: () => openEnforcement('restore', row) });
          }
          return <ActionMenu actions={actions} />;
        }}
      />

      {/* ── Enforcement Modal ───────────────────────────── */}
      <FormModal
        isOpen={!!enforcement}
        onClose={closeEnforcement}
        title={actionLabel}
        subtitle={enforcement ? (enforcement.account.email || '') : ''}
        onSubmit={submitEnforcement}
        submitLabel={submitting ? 'Saving...' : actionLabel}
        loading={submitting}
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {enforcement?.mode === 'restore' ? (
            <div style={S.confirmBody}>
              <div style={S.confirmIcon}>
                <ShieldCheck size={24} style={{ color: colors.status.success }} />
              </div>
              <p style={S.confirmText}>
                This clears the current suspension or ban and lets the account vote and
                transact again. The enforcement history is kept.
              </p>
            </div>
          ) : (
            <>
              <FormField
                label="Reason"
                description="Recorded in the enforcement log — be specific."
                required
              >
                <TextArea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={enforcement?.mode === 'ban'
                    ? 'e.g. Confirmed bot voting across multiple accounts'
                    : 'e.g. Vote manipulation under investigation'}
                  rows={3}
                  autoFocus
                />
              </FormField>

              {enforcement?.mode === 'suspend' && (
                <FormField
                  label="Suspension ends"
                  description="Optional. Leave blank for an indefinite suspension."
                >
                  <TextInput
                    type="datetime-local"
                    value={suspendUntil}
                    onChange={(e) => setSuspendUntil(e.target.value)}
                  />
                </FormField>
              )}

              <div style={S.warning}>
                <AlertTriangle size={16} style={{ color: colors.status.warning, flexShrink: 0 }} />
                <span>
                  {enforcement?.mode === 'ban'
                    ? 'Banning blocks all voting and paid-vote purchases for this account.'
                    : 'Suspended accounts cannot cast or purchase votes until restored.'}
                </span>
              </div>
            </>
          )}

          {formError && <div style={S.error}>{formError}</div>}
        </div>
      </FormModal>

      {/* ── History Modal ───────────────────────────────── */}
      <FormModal
        isOpen={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title="Enforcement History"
        subtitle={historyFor ? (historyFor.email || '') : ''}
        onSubmit={() => setHistoryFor(null)}
        submitLabel="Close"
        size="md"
      >
        {historyLoading ? (
          <p style={S.subtle}>Loading...</p>
        ) : history.length === 0 ? (
          <p style={S.subtle}>No enforcement actions recorded for this account.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.md }}>
            {history.map((h) => (
              <div key={h.id} style={S.historyRow}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: spacing.sm }}>
                  <span style={{ fontWeight: typography.fontWeight.semibold, color: colors.text.primary }}>
                    {ACTION_LABEL[h.action] || h.action}
                  </span>
                  <span style={S.subtle}>
                    {h.created_at ? new Date(h.created_at).toLocaleString() : ''}
                  </span>
                </div>
                {h.reason && <p style={S.historyReason}>{h.reason}</p>}
                <span style={S.subtle}>
                  {h.status_before || 'active'} → {h.status_after}
                  {h.performed_by_email ? ` · by ${h.performed_by_email}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
      </FormModal>
    </div>
  );
}

const S = {
  headerRow: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' },
  title: { fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.bold, marginBottom: spacing.xs, color: colors.text.primary },
  subtitle: { color: colors.text.secondary, fontSize: typography.fontSize.sm },
  avatar: { width: '28px', height: '28px', borderRadius: borderRadius.full, background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.bold, color: '#fff', flexShrink: 0 },
  subtle: { color: colors.text.tertiary, fontSize: typography.fontSize.xs },
  badge: { display: 'inline-flex', alignItems: 'center', gap: spacing.xs, padding: `2px ${spacing.sm}`, borderRadius: borderRadius.sm, border: '1px solid', fontSize: typography.fontSize.xs, fontWeight: typography.fontWeight.medium, whiteSpace: 'nowrap' },
  confirmBody: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.md, padding: `${spacing.md} 0` },
  confirmIcon: { width: '48px', height: '48px', borderRadius: borderRadius.full, background: 'rgba(34,197,94,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  confirmText: { fontSize: typography.fontSize.sm, color: colors.text.secondary, lineHeight: 1.6, margin: 0, textAlign: 'center' },
  warning: { display: 'flex', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: borderRadius.md, color: colors.text.secondary, fontSize: typography.fontSize.sm, lineHeight: 1.5 },
  error: { padding: spacing.sm, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: borderRadius.md, color: colors.status.error, fontSize: typography.fontSize.sm },
  historyRow: { display: 'flex', flexDirection: 'column', gap: spacing.xs, padding: spacing.md, background: colors.background.secondary, border: `1px solid ${colors.border.secondary}`, borderRadius: borderRadius.md },
  historyReason: { margin: 0, color: colors.text.secondary, fontSize: typography.fontSize.sm, lineHeight: 1.5 },
};
