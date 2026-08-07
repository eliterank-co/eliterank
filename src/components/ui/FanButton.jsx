import { useState, useEffect, useCallback } from 'react';
import { Mail } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks';
import { useToast } from '../../contexts/ToastContext';
import { useIsPreview } from '../../contexts/PublicCompetitionContext';
import { getCompetitionUrl, getCompetitionUrlById } from '../../utils/slugs';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';

/**
 * Look up contestant + competition details and fire the fan confirmation
 * email. Kept at module scope so it can be triggered as fire-and-forget
 * without tying into the component render cycle.
 */
async function sendFanConfirmationEmail({ email, contestantId, fanId }) {
  if (!supabase || !email || !contestantId || !fanId) return;

  const { data: contestant } = await supabase
    .from('contestants')
    .select('name, user_id, competition:competitions(name, slug, organization:organizations(slug))')
    .eq('id', contestantId)
    .maybeSingle();

  if (!contestant) return;

  const orgSlug = contestant.competition?.organization?.slug || 'most-eligible';
  const competitionSlug = contestant.competition?.slug;
  const competitionUrl = competitionSlug
    ? `${window.location.origin}${getCompetitionUrl(orgSlug, competitionSlug)}`
    : contestant.competition?.id
      ? `${window.location.origin}${getCompetitionUrlById(orgSlug, contestant.competition.id)}`
      : undefined;
  const profileUrl = contestant.user_id
    ? `${window.location.origin}/profile/${contestant.user_id}`
    : undefined;

  await supabase.functions.invoke('send-onesignal-email', {
    body: {
      type: 'fan_confirmation',
      to_email: email,
      contestant_name: contestant.name,
      competition_name: contestant.competition?.name,
      competition_url: competitionUrl,
      profile_url: profileUrl,
      fan_id: fanId,
    },
  });
}

/**
 * FanButton — "Become a Fan" toggle for contestant profiles.
 *
 * Clicking "Become a Fan" opens an opt-in confirmation modal that discloses
 * the weekly email subscription. The DB insert + email only happens after
 * the user confirms. Unfanning is a single click (they already opted in).
 *
 * @param {string} contestantId - The contestant to fan
 * @param {string} [contestantName] - Optional name for the opt-in copy
 * @param {function} onLoginRequired - Called when unauthenticated user clicks
 */
export default function FanButton({ contestantId, contestantName, onLoginRequired }) {
  const { user } = useSupabaseAuth();
  const toast = useToast();
  const isPreview = useIsPreview();
  const [isFan, setIsFan] = useState(false);
  const [fanCount, setFanCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [dialogMode, setDialogMode] = useState(null); // null | 'opt-in' | 'login'

  const displayName = contestantName?.trim() || 'this contestant';

  // Fetch fan status and count. After the lookup resolves, check for the
  // ?pendingFan=1 query param set by the login-prompt redirect — if the
  // user just logged in and isn't already a fan, auto-open the opt-in
  // dialog so the original click is completed without another tap.
  useEffect(() => {
    if (!contestantId || !supabase) return;

    const fetchFanData = async () => {
      const { count } = await supabase
        .from('contestant_fans')
        .select('*', { count: 'exact', head: true })
        .eq('contestant_id', contestantId);

      setFanCount(count || 0);

      let userIsFan = false;
      if (user?.id) {
        const { data } = await supabase
          .from('contestant_fans')
          .select('id')
          .eq('contestant_id', contestantId)
          .eq('user_id', user.id)
          .maybeSingle();

        userIsFan = !!data;
        setIsFan(userIsFan);
      }

      if (user?.id && !userIsFan) {
        const url = new URL(window.location.href);
        if (url.searchParams.get('pendingFan') === '1') {
          setDialogMode('opt-in');
          url.searchParams.delete('pendingFan');
          window.history.replaceState({}, '', url.pathname + url.search + url.hash);
        }
      }
    };

    fetchFanData();
  }, [contestantId, user?.id]);

  const handleClick = useCallback(() => {
    if (!user?.id) {
      // Show a login prompt that discloses what they're signing up for,
      // instead of bouncing them straight to the login page.
      setDialogMode('login');
      return;
    }
    if (loading || !supabase) return;

    if (isFan) {
      setDialogMode('unfan');
    } else {
      setDialogMode('opt-in');
    }
  }, [user?.id, isFan, loading, onLoginRequired]);

  // Build the returnTo URL that carries a pendingFan flag, so after login
  // the user lands back here and the opt-in dialog auto-opens instead of
  // requiring them to hunt down the Fan button again.
  const goToLogin = useCallback(() => {
    setDialogMode(null);
    const url = new URL(window.location.href);
    url.searchParams.set('pendingFan', '1');
    const returnTo = url.pathname + url.search + url.hash;
    if (onLoginRequired) {
      onLoginRequired(returnTo);
    } else {
      window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
    }
  }, [onLoginRequired]);

  const unfan = useCallback(async () => {
    if (isPreview) {
      setDialogMode(null);
      toast.info?.('Preview mode — no changes saved.');
      return;
    }
    setLoading(true);
    try {
      // supabase-js resolves (does not throw) on RLS/DB errors — inspect
      // `error` explicitly so a failed delete never shows a false success.
      const { error } = await supabase
        .from('contestant_fans')
        .delete()
        .eq('contestant_id', contestantId)
        .eq('user_id', user.id);
      if (error) throw error;
      setIsFan(false);
      setFanCount(prev => Math.max(0, prev - 1));
      setDialogMode(null);
      toast.success(
        `You're no longer a fan of ${displayName}. You can fan them again any time.`,
        5000,
      );
    } catch (err) {
      console.error('Fan toggle failed:', err);
      toast.error('Could not update your fan status. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [contestantId, user?.id, toast, displayName, isPreview]);

  const confirmBecomeFan = useCallback(async () => {
    if (!user?.id || loading) return;
    if (isPreview) {
      setDialogMode(null);
      toast.info?.('Preview mode — no changes saved.');
      return;
    }

    setLoading(true);
    try {
      const { data: inserted, error } = await supabase
        .from('contestant_fans')
        .insert({ contestant_id: contestantId, user_id: user.id })
        .select('id')
        .maybeSingle();

      // supabase-js resolves (does not throw) on RLS/DB errors — it returns
      // them here. Without this check a failed insert (e.g. an expired
      // session, so auth.uid() is null and the RLS WITH CHECK fails) would
      // still show a "you're a fan" toast while nothing was actually saved,
      // and the fan status would silently reset on the next page load.
      // 23505 = unique_violation: the row already exists, so treat as success.
      const alreadyFan = error?.code === '23505';
      if (error && !alreadyFan) throw error;

      setIsFan(true);
      if (!alreadyFan) setFanCount(prev => prev + 1);
      setDialogMode(null);

      // Toast copy avoids promising an email that might silently fail —
      // the confirmation send is fire-and-forget.
      toast.success(
        `You're a fan of ${displayName}! We'll email you weekly competition updates.`,
        5000,
      );

      if (user.email && inserted?.id) {
        sendFanConfirmationEmail({
          email: user.email,
          contestantId,
          fanId: inserted.id,
        }).catch(err => console.warn('Fan confirmation email failed:', err));
      }
    } catch (err) {
      console.error('Fan opt-in failed:', err);
      toast.error('Could not save your fan status. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email, contestantId, loading, toast, displayName, isPreview]);

  const tooltip = isFan
    ? "You'll receive weekly competition updates for this contestant"
    : 'Become a fan to get weekly competition updates for this contestant';

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        title={tooltip}
        aria-label={tooltip}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.xs,
          padding: `${spacing.xs} ${spacing.md}`,
          background: isFan
            ? 'rgba(212,175,55,0.15)'
            : 'rgba(255,255,255,0.06)',
          border: `1px solid ${isFan ? 'rgba(212,175,55,0.3)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: borderRadius.pill,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
          color: isFan ? colors.gold.primary : colors.text.secondary,
          cursor: loading ? 'wait' : 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        {isFan ? 'Fans' : 'Become a Fan'}
        {fanCount > 0 && (
          <span style={{
            marginLeft: '2px',
            fontSize: typography.fontSize.xs,
            opacity: 0.7,
          }}>
            {fanCount.toLocaleString()}
          </span>
        )}
      </button>

      {dialogMode === 'opt-in' && (
        <FanDialog
          title={`Become a Fan of ${displayName}?`}
          body={<>You'll receive a <strong style={{ color: colors.text.primary }}>weekly email</strong> with competition performance updates — round standings, milestones, and when it's time to vote again. You can unsubscribe any time with one tap from the email.</>}
          primaryLabel={loading ? 'Confirming…' : 'Become a Fan'}
          onPrimary={confirmBecomeFan}
          onCancel={() => setDialogMode(null)}
          loading={loading}
        />
      )}

      {dialogMode === 'unfan' && (
        <FanDialog
          title={`Unfan ${displayName}?`}
          body={<>You'll stop receiving <strong style={{ color: colors.text.primary }}>weekly performance updates</strong> about {displayName} — round standings, milestones, and voting reminders. You can fan them again any time.</>}
          primaryLabel={loading ? 'Unfanning…' : 'Unfan'}
          onPrimary={unfan}
          onCancel={() => setDialogMode(null)}
          loading={loading}
        />
      )}

      {dialogMode === 'login' && (
        <FanDialog
          title={`Log in to become a fan of ${displayName}`}
          body={<>Fans receive a <strong style={{ color: colors.text.primary }}>weekly email</strong> with competition performance updates for their favorite contestants. Create a free account or log in to continue — we'll bring you right back here.</>}
          primaryLabel="Log in or Sign up"
          onPrimary={goToLogin}
          onCancel={() => setDialogMode(null)}
        />
      )}
    </>
  );
}

/**
 * Shared dialog used by both the opt-in flow and the unauthenticated login
 * prompt. Discloses what the user is signing up for before they commit.
 */
function FanDialog({ title, body, primaryLabel, onPrimary, onCancel, loading = false }) {
  // Close on Escape key — matches standard modal accessibility behavior.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onCancel, loading]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: spacing.xl,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: colors.background.primary,
          borderRadius: borderRadius.xl,
          border: `1px solid ${colors.border.gold || 'rgba(212,175,55,0.3)'}`,
          maxWidth: '440px',
          width: '100%',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: spacing.xl, textAlign: 'center' }}>
          <div style={{
            width: '44px',
            height: '44px',
            background: 'rgba(212,175,55,0.15)',
            borderRadius: borderRadius.lg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: `0 auto ${spacing.md}`,
          }}>
            <Mail size={20} style={{ color: colors.gold.primary }} />
          </div>

          <h2 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            margin: 0,
            marginBottom: spacing.sm,
          }}>
            {title}
          </h2>

          <p style={{
            color: colors.text.secondary,
            fontSize: typography.fontSize.md,
            lineHeight: 1.6,
            margin: 0,
            marginBottom: spacing.xl,
          }}>
            {body}
          </p>

          <div style={{ display: 'flex', gap: spacing.md }}>
            <button
              onClick={onCancel}
              disabled={loading}
              style={{
                flex: 1,
                padding: `${spacing.sm} ${spacing.md}`,
                background: 'transparent',
                border: `1px solid ${colors.border.primary || 'rgba(255,255,255,0.1)'}`,
                borderRadius: borderRadius.lg,
                color: colors.text.secondary,
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                cursor: loading ? 'wait' : 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              Cancel
            </button>
            <button
              onClick={onPrimary}
              disabled={loading}
              style={{
                flex: 1,
                padding: `${spacing.sm} ${spacing.md}`,
                background: 'linear-gradient(135deg, #d4af37, #f4d03f)',
                border: 'none',
                borderRadius: borderRadius.lg,
                color: '#000',
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.bold,
                cursor: loading ? 'wait' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
