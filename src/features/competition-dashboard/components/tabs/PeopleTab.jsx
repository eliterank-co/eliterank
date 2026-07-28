import React, { useState, useRef, useMemo } from 'react';
import {
  Crown, RotateCcw, ExternalLink, UserCheck, Users, CheckCircle, XCircle,
  Plus, User, Star, UserPlus, Link2, Check, Download, Loader, Send, Camera, Wrench, Clock, Instagram,
  ChevronUp, ChevronDown, MessageSquare,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Badge, Avatar, Panel, Modal } from '../../../../components/ui';
import { HostBroadcastModal } from '../../../../components/modals';
import { colors, spacing, borderRadius, typography } from '../../../../styles/theme';
import { useResponsive } from '../../../../hooks/useResponsive';
import { useToast } from '../../../../contexts/ToastContext';
import { generateAchievementCard, getAdvancementTitle } from '../../../achievement-cards/generateAchievementCard';
import { uploadPhoto } from '../../../entry/utils/uploadPhoto';
import { supabase } from '../../../../lib/supabase';
import { sortContestantsByStanding } from '../../../../utils/contestantRanking';
import { getReachedTierLabel } from '../../../../utils/roundLabels';
import { getNominationWindow, isLive } from '../../../../utils/competitionPhase';
import WinnersManager from '../WinnersManager';
import CustomQuestionAnswers from '../CustomQuestionAnswers';
import { resolveNominationFormConfig } from '../../../../utils/nominationFormDefaults';

// Normalize an instagram handle that may be a bare username, "@name", or full URL
const parseInstagram = (raw) => {
  if (!raw) return null;
  const clean = String(raw)
    .trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
    .replace(/\/+$/, '')
    .split(/[/?#]/)[0];
  if (!clean) return null;
  return { url: `https://instagram.com/${clean}`, handle: clean };
};

const InstagramLink = ({ instagram, iconOnly = false }) => {
  const ig = parseInstagram(instagram);
  if (!ig) return null;
  return (
    <a
      href={ig.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`@${ig.handle} on Instagram`}
      aria-label={`Open @${ig.handle} on Instagram`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px',
        color: colors.gold.primary,
        textDecoration: 'none',
        fontSize: typography.fontSize.xs,
        fontWeight: typography.fontWeight.medium,
        borderRadius: borderRadius.sm,
        lineHeight: 1,
      }}
    >
      <Instagram size={14} />
      {!iconOnly && <span>@{ig.handle}</span>}
    </a>
  );
};

/**
 * PeopleTab - Manages winners, nominees, contestants, and host profile
 */
export default function PeopleTab({
  competition,
  votingRounds = [],
  nominees,
  contestants,
  host,
  coHosts = [],
  isSuperAdmin = false,
  onRefresh,
  onApproveNominee,
  onRejectNominee,
  onRestoreNominee,
  onOpenAddPersonModal,
  onShowHostAssignment,
  onRemoveHost,
  onShowAddCoHost,
  onRemoveCoHost,
  onResendInvite,
  onSendHostBroadcast,
  onGetHostBroadcastStatus,
  onRemoveContestant,
  onUnconvertContestant,
  onRepairNomineeAccount,
  onRepairAllNomineeAccounts,
}) {
  const { isMobile } = useResponsive();
  const navigate = useNavigate();
  const toast = useToast();
  // Host-defined custom questions for this competition — used to label the
  // nominee's answers shown on their row (answers live in eligibilityAnswers).
  const customQuestions = useMemo(
    () => resolveNominationFormConfig(
      competition?.nominationFormConfig ?? competition?.nomination_form_config
    ).custom_questions,
    [competition?.nominationFormConfig, competition?.nomination_form_config]
  );
  const [processingIds, setProcessingIds] = useState(new Set());
  const addProcessing = (id) => setProcessingIds(prev => new Set(prev).add(id));
  const removeProcessing = (id) => setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  const [copiedId, setCopiedId] = useState(null);
  const [resentId, setResentId] = useState(null);
  const [generatingCardId, setGeneratingCardId] = useState(null);
  const [uploadingAvatarId, setUploadingAvatarId] = useState(null);
  const [bulkPhotoProgress, setBulkPhotoProgress] = useState(null);
  const avatarFileRef = useRef(null);
  const avatarUploadTarget = useRef(null);
  const [reordering, setReordering] = useState(false);
  // Host → audience broadcast composer. `defaultAudience` presets which group
  // the modal opens on (the host can still switch inside the modal).
  const [broadcastModal, setBroadcastModal] = useState({ isOpen: false, defaultAudience: 'contestants' });

  const openBroadcastModal = (defaultAudience = 'contestants') => {
    setBroadcastModal({ isOpen: true, defaultAudience });
  };
  const closeBroadcastModal = () => setBroadcastModal((prev) => ({ ...prev, isOpen: false }));

  const handleSendHostBroadcast = async (audience, subject, message) => {
    if (!onSendHostBroadcast) return { success: false, error: 'Messaging is unavailable' };
    const result = await onSendHostBroadcast(audience, subject, message);
    if (result?.success) {
      const sent = result.data?.sent;
      const summary = sent
        ? `Message sent — ${sent.in_app} in-app, ${sent.email} email`
        : 'Message sent';
      toast?.success?.(summary);
    } else if (!result?.data?.rate_limited) {
      // The modal renders the weekly-limit case itself; only toast other errors.
      toast?.error?.(result?.error || 'Failed to send message');
    }
    return result;
  };
  // Nominee pending confirmation before being converted to a contestant.
  // Conversion makes them public + votable, so it requires an explicit confirm.
  const [convertConfirm, setConvertConfirm] = useState(null);
  // 'all' | 'male' | 'female' — only meaningful when the competition splits
  // winners by gender. Filters every nominee / contestant section below.
  const [genderFilter, setGenderFilter] = useState('all');

  const splitByGender = !!competition?.winnersSplitByGender;

  // Adding nominees is gated on nominations actually being LIVE — the
  // competition is live AND inside the nomination window. A host can't seed
  // their field before the public can nominate, or after nominations close.
  const nomWindow = getNominationWindow(competition);
  const canAddNominee = isLive(competition?.status) && nomWindow.state === 'open';
  // Once nominations close there's no one left to reach as a "nominee", so the
  // broadcast composer drops the Nominees (and Everyone) audience options.
  const nominationsEnded = nomWindow.state === 'ended';
  const nomOpenDateLabel = nomWindow.start
    ? nomWindow.start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;
  const addNomineeBlockedReason = canAddNominee
    ? null
    : nomWindow.state === 'no_date'
      ? 'Set your nomination dates in the Setup tab, then you can add nominees.'
      : nomWindow.state === 'ended'
        ? 'Nominations have closed, so no new nominees can be added.'
        : nomOpenDateLabel
          ? `You can add nominees once nominations open${nomWindow.state === 'upcoming' ? ` on ${nomOpenDateLabel}` : ''} and your competition is live.`
          : 'You can add nominees once nominations are live.';

  const isLegacy = competition?.is_legacy;
  const isCompleted = competition?.status === 'completed';
  const showReorder = isLegacy || isCompleted;

  // Vertical order of the People sections, via CSS flex `order` on the column
  // container — so we reorder without physically moving the large JSX blocks.
  // Before the competition is live the host is still building their field, so
  // nominees sit on top (ready to approve → awaiting → incomplete), with
  // contestants below. Once live, the contestant lineup is what matters most,
  // so it jumps above the nominee buckets. Judges + winners stay at the bottom.
  const preLive = ['draft', 'pending_approval', 'approved'].includes(competition?.status);
  const sectionOrder = (id) => {
    const map = preLive
      ? { readyToApprove: 1, awaitingResponse: 2, incompleteSelfNoms: 3, contestants: 4, judges: 5, winners: 6, declined: 7 }
      : { contestants: 1, readyToApprove: 2, awaitingResponse: 3, incompleteSelfNoms: 4, judges: 5, winners: 6, declined: 7 };
    return map[id];
  };

  const handleMoveContestant = async (contestantId, direction) => {
    if (!supabase || !competition?.id) return;
    setReordering(true);

    // Work from the same rank order the list is displayed in.
    const ordered = [...contestants].sort((a, b) => (a.rank || 999) - (b.rank || 999));
    const currentIndex = ordered.findIndex(c => c.id === contestantId);
    const swapIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (currentIndex === -1 || swapIndex < 0 || swapIndex >= ordered.length) {
      setReordering(false);
      return;
    }

    // Move the contestant one slot in the chosen direction.
    [ordered[currentIndex], ordered[swapIndex]] = [ordered[swapIndex], ordered[currentIndex]];

    // Renumber everyone 1..N. Swapping the two rank *values* (the old approach)
    // is a no-op whenever neighbors share a rank — and the data can contain
    // duplicate / non-sequential ranks — so always reassign sequential ranks.
    try {
      await Promise.all(
        ordered.map((c, idx) =>
          supabase.from('contestants').update({ rank: idx + 1 }).eq('id', c.id),
        ),
      );
      if (onRefresh) await onRefresh();
    } catch (err) {
      console.error('Error reordering contestants:', err);
    } finally {
      setReordering(false);
    }
  };

  const handleAvatarClick = (person, type = 'nominee') => {
    avatarUploadTarget.current = { ...person, _table: type };
    avatarFileRef.current?.click();
  };

  const handleAvatarFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !avatarUploadTarget.current) return;
    const target = avatarUploadTarget.current;
    const table = target._table === 'contestant' ? 'contestants' : 'nominees';
    e.target.value = '';

    setUploadingAvatarId(target.id);
    try {
      const url = await uploadPhoto(file, 'host-uploads');
      await supabase
        .from(table)
        .update({ avatar_url: url })
        .eq('id', target.id);
      onRefresh?.();
    } catch (err) {
      console.error('Avatar upload failed:', err);
    } finally {
      setUploadingAvatarId(null);
      avatarUploadTarget.current = null;
    }
  };

  const handleViewProfile = (profileId) => {
    if (!profileId) return;
    navigate(`/profile/${profileId}`);
  };

  const handleDownloadCard = async (person, type = 'contestant', options = {}) => {
    setGeneratingCardId(person.id);
    try {
      const blob = await generateAchievementCard({
        achievementType: type === 'contestant' ? 'contestant' : 'nominated',
        customTitle: options.customTitle,
        name: person.name,
        photoUrl: person.avatarUrl,
        handle: person.instagram,
        competitionName: competition?.name || `Most Eligible ${competition?.city?.name || competition?.city}`,
        cityName: competition?.city?.name || competition?.city,
        season: competition?.season?.toString(),
        organizationName: competition?.organizationName || 'Most Eligible',
        organizationLogoUrl: competition?.organizationLogoUrl,
        accentColor: competition?.themePrimary || '#d4af37',
        voteUrl: competition?.slug ? `eliterank.co/${competition.slug}` : 'eliterank.co',
        votingStartDate: competition?.votingStart,
      });

      const fileSuffix = options.fileSuffix || type;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${person.name.replace(/\s+/g, '-').toLowerCase()}-${fileSuffix}-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Card generation failed:', err);
    } finally {
      setGeneratingCardId(null);
    }
  };

  // Compute every "TOP N CONTESTANT" tier this contestant has earned.
  // Mirrors ProfileView.jsx's tier logic but returns ALL surviving rounds,
  // not just the highest — so a Top-15 contestant gets Top-50, Top-25 and
  // Top-15 cards (one per round they made the cut for). Active contestants
  // earn credit for every completed round; eliminated contestants earn
  // credit for every round strictly before eliminated_in_round.
  const getAdvancementCardsForContestant = (person) => {
    if (!person) return [];
    let earnedRounds;
    if (person.status === 'eliminated' && person.eliminatedInRound) {
      earnedRounds = votingRounds.filter(
        (r) => (r.round_order || 0) < person.eliminatedInRound,
      );
    } else {
      const now = Date.now();
      earnedRounds = votingRounds.filter(
        (r) => r.end_date && new Date(r.end_date).getTime() <= now,
      );
    }
    return earnedRounds
      .filter((r) => Number.isFinite(r.contestants_advance) && r.contestants_advance > 0)
      // Largest cohort first (Top 50 before Top 25) — matches how the
      // contestant progressed through the funnel.
      .sort((a, b) => (b.contestants_advance || 0) - (a.contestants_advance || 0))
      .map((r) => ({
        title: `TOP ${r.contestants_advance} CONTESTANT`,
        menuLabel: `${getAdvancementTitle(r.contestants_advance)} Contestant Card`,
        advanceCount: r.contestants_advance,
      }));
  };

  const triggerBlobDownload = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const photoFilename = (person, blob) => {
    const safeName = person.name.replace(/\s+/g, '-').toLowerCase();
    const mime = blob.type || '';
    let ext = mime.split('/')[1]?.split('+')[0];
    if (!ext) {
      const fromUrl = person.avatarUrl?.split('?')[0]?.split('.').pop()?.toLowerCase();
      ext = fromUrl && fromUrl.length <= 5 ? fromUrl : 'jpg';
    }
    if (ext === 'jpeg') ext = 'jpg';
    return `${safeName}-photo.${ext}`;
  };

  const handleDownloadPhoto = async (person) => {
    if (!person.avatarUrl) {
      alert('No profile photo on file for this contestant.');
      return;
    }
    setGeneratingCardId(person.id);
    try {
      const response = await fetch(person.avatarUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      triggerBlobDownload(blob, photoFilename(person, blob));
    } catch (err) {
      console.error('Photo download failed:', err);
      alert('Failed to download photo. Please try again.');
    } finally {
      setGeneratingCardId(null);
    }
  };

  const handleDownloadAllPhotos = async () => {
    const withPhotos = contestants.filter(c => c.avatarUrl);
    if (!withPhotos.length) {
      alert('No contestants have a profile photo yet.');
      return;
    }
    const skipped = contestants.length - withPhotos.length;
    const msg = skipped
      ? `Download ${withPhotos.length} of ${contestants.length} contestant photos? (${skipped} without photos will be skipped)\n\nYour browser may ask permission to download multiple files.`
      : `Download photos for all ${withPhotos.length} contestants?\n\nYour browser may ask permission to download multiple files.`;
    if (!confirm(msg)) return;
    let failed = 0;
    for (let i = 0; i < withPhotos.length; i++) {
      const c = withPhotos[i];
      setBulkPhotoProgress({ current: i + 1, total: withPhotos.length });
      try {
        const response = await fetch(c.avatarUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        triggerBlobDownload(blob, photoFilename(c, blob));
        await new Promise(r => setTimeout(r, 250));
      } catch (err) {
        console.error(`Failed to download photo for ${c.name}:`, err);
        failed++;
      }
    }
    setBulkPhotoProgress(null);
    if (failed) alert(`Done. ${withPhotos.length - failed} downloaded, ${failed} failed.`);
  };

  const handleCopyClaimLink = async (nominee) => {
    if (!nominee.inviteToken) return;
    const url = `${window.location.origin}/claim/${nominee.inviteToken}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedId(nominee.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleResendInvite = async (nominee) => {
    if (!onResendInvite) return;
    addProcessing(nominee.id);
    try {
      const result = await onResendInvite(nominee.id);
      if (result?.success) {
        setResentId(nominee.id);
        setTimeout(() => setResentId(null), 2000);
      } else {
        alert(result?.error || 'Failed to send reminder. Please try again.');
      }
    } catch (err) {
      alert('Failed to send reminder. Please try again.');
    } finally {
      removeProcessing(nominee.id);
    }
  };

  const handleBulkResendInvites = async (nomineeList, label) => {
    const withEmail = nomineeList.filter(n => n.email);
    if (!withEmail.length || !onResendInvite) return;
    const skipped = nomineeList.length - withEmail.length;
    const msg = skipped
      ? `Send invite/reminder to ${withEmail.length} of ${nomineeList.length} ${label} nominees? (${skipped} without email will be skipped)`
      : `Send invite/reminder to all ${withEmail.length} ${label} nominees?`;
    if (!confirm(msg)) return;
    addProcessing('bulk-send');
    let sent = 0;
    let failed = 0;
    for (const n of withEmail) {
      try {
        const result = await onResendInvite(n.id);
        if (result?.success) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }
    removeProcessing('bulk-send');
    alert(`Done! Sent: ${sent}${failed ? `, Failed: ${failed}` : ''}`);
  };

  // Categorize nominees
  const activeNominees = nominees.filter(n => {
    if (n.status !== 'pending' && n.status !== 'profile_complete' && n.status !== 'awaiting_profile') return false;
    // Incomplete self-nominees go in their own bucket
    if (n.nominatedBy === 'self' && !n.claimedAt) return false;
    return true;
  });
  // Incomplete self-nominations: started the flow but haven't finished
  const incompleteNomineesAll = nominees.filter(n =>
    (n.status === 'pending' || n.status === 'awaiting_profile' || n.status === 'profile_complete') &&
    n.nominatedBy === 'self' && !n.claimedAt
  );
  const nomineesWithProfileAll = activeNominees.filter(n => n.hasProfile);
  const externalNomineesAll = activeNominees.filter(n => !n.hasProfile);
  const declinedNomineesAll = nominees.filter(n => n.status === 'declined' || n.status === 'rejected' || n.status === 'archived');

  // Per-gender breakdown helper. Used for both the stat-row sub-counts and
  // the host's male/female filter chips. Only meaningful when split is on.
  const byGender = (list) => ({
    male: list.filter((p) => p.gender === 'male').length,
    female: list.filter((p) => p.gender === 'female').length,
    unset: list.filter((p) => p.gender !== 'male' && p.gender !== 'female').length,
  });
  const applyGenderFilter = (list) => {
    if (!splitByGender || genderFilter === 'all') return list;
    return list.filter((p) => p.gender === genderFilter);
  };

  // Filtered views used in the section panels + their counts.
  const nomineesWithProfile = applyGenderFilter(nomineesWithProfileAll);
  const externalNominees = applyGenderFilter(externalNomineesAll);
  const incompleteNominees = applyGenderFilter(incompleteNomineesAll);
  const declinedNominees = applyGenderFilter(declinedNomineesAll);
  const contestantsFiltered = applyGenderFilter(contestants || []);

  // Whether a nominee can be approved (must have accepted and have a profile)
  const canApprove = (nominee) => {
    if (nominee.nominatedBy === 'self') return !!nominee.hasProfile;
    return !!nominee.claimedAt && !!nominee.hasProfile;
  };

  // Acceptance status badge for nominees
  const AcceptanceStatus = ({ nominee }) => {
    if (nominee.nominatedBy === 'self') {
      return (
        <span style={{
          fontSize: typography.fontSize.xs,
          padding: `2px ${spacing.sm}`,
          borderRadius: borderRadius.sm,
          background: 'rgba(212,175,55,0.15)',
          color: colors.gold.primary,
          whiteSpace: 'nowrap',
        }}>
          Self
        </span>
      );
    }
    // "Accepted" requires an explicit claim — a matched profile alone is
    // not consent. Host-added (nominated_by='admin') nominees often match
    // an existing platform user by email, which used to flip this badge
    // to "Accepted" before they ever clicked the invite link.
    if (nominee.claimedAt) {
      return (
        <span style={{
          fontSize: typography.fontSize.xs,
          padding: `2px ${spacing.sm}`,
          borderRadius: borderRadius.sm,
          background: 'rgba(34,197,94,0.15)',
          color: '#22c55e',
          whiteSpace: 'nowrap',
        }}>
          Accepted
        </span>
      );
    }
    if (nominee.claimedAt || (nominee.flowStage && nominee.flowStage !== 'pending')) {
      return (
        <span style={{
          fontSize: typography.fontSize.xs,
          padding: `2px ${spacing.sm}`,
          borderRadius: borderRadius.sm,
          background: 'rgba(251,146,60,0.15)',
          color: '#fb923c',
          whiteSpace: 'nowrap',
        }}>
          In Progress
        </span>
      );
    }
    return (
      <span style={{
        fontSize: typography.fontSize.xs,
        padding: `2px ${spacing.sm}`,
        borderRadius: borderRadius.sm,
        background: 'rgba(251,191,36,0.15)',
        color: '#fbbf24',
        whiteSpace: 'nowrap',
      }}>
        Awaiting Response
      </span>
    );
  };

  // Action buttons for nominee rows
  const NomineeActions = ({ nominee }) => {
    const isProcessing = processingIds.has(nominee.id);
    const approveDisabled = isProcessing || !canApprove(nominee);
    const isCopied = copiedId === nominee.id;
    return (
      <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
        <AcceptanceStatus nominee={nominee} />
        {nominee.inviteToken && (
          <button
            onClick={() => handleCopyClaimLink(nominee)}
            title={isCopied ? 'Copied!' : 'Copy claim link'}
            style={{
              padding: spacing.xs,
              background: isCopied ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
              border: 'none',
              borderRadius: borderRadius.sm,
              cursor: 'pointer',
              color: isCopied ? '#22c55e' : '#3b82f6',
              minWidth: '32px',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isCopied ? <Check size={16} /> : <Link2 size={16} />}
          </button>
        )}
        {nominee.email && onResendInvite && (!nominee.hasProfile || (nominee.claimedAt && !nominee.convertedToContestant)) && (
          <button
            onClick={() => handleResendInvite(nominee)}
            disabled={isProcessing}
            title={resentId === nominee.id ? 'Sent!' : `${nominee.claimedAt ? 'Send profile completion reminder' : 'Resend invite email'}${nominee.inviteSentAt ? `\nLast sent: ${new Date(nominee.inviteSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : '\nNever sent'}`}
            style={{
              padding: spacing.xs,
              background: resentId === nominee.id ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
              border: 'none',
              borderRadius: borderRadius.sm,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              color: resentId === nominee.id ? '#22c55e' : '#a855f7',
              minWidth: '32px',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {resentId === nominee.id ? <Check size={16} /> : <Send size={16} />}
          </button>
        )}
        {!nominee.hasProfile && nominee.email && nominee.claimedAt && nominee.userId && onRepairNomineeAccount && (
          <button
            onClick={async () => {
              addProcessing(nominee.id);
              try {
                const result = await onRepairNomineeAccount(nominee.id);
                if (result?.success) {
                  const msg = result.data?.repaired?.length
                    ? `Repaired: ${result.data.repaired[0]?.action}`
                    : result.data?.skipped?.length
                      ? `Already OK: ${result.data.skipped[0]?.reason}`
                      : 'Done';
                  alert(msg);
                } else {
                  alert(`Repair failed: ${result?.error || 'Unknown error'}`);
                }
              } finally {
                removeProcessing(nominee.id);
              }
            }}
            disabled={isProcessing}
            title="Repair account (create auth user + sync profile data)"
            style={{
              padding: spacing.xs,
              background: 'rgba(245,158,11,0.1)',
              border: 'none',
              borderRadius: borderRadius.sm,
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              color: '#f59e0b',
              minWidth: '32px',
              minHeight: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Wrench size={16} />
          </button>
        )}
        <button
          onClick={() => setConvertConfirm(nominee)}
          disabled={approveDisabled}
          title={!canApprove(nominee) ? 'Nominee must accept first' : 'Approve & convert to contestant'}
          style={{
            padding: spacing.xs,
            background: approveDisabled ? 'rgba(107,114,128,0.1)' : 'rgba(34,197,94,0.1)',
            border: 'none',
            borderRadius: borderRadius.sm,
            cursor: approveDisabled ? 'not-allowed' : 'pointer',
            color: approveDisabled ? '#6b7280' : '#22c55e',
            minWidth: '32px',
            minHeight: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: approveDisabled ? 0.5 : 1,
          }}
        >
          <CheckCircle size={16} />
        </button>
        <button
          onClick={async () => { addProcessing(nominee.id); try { await onRejectNominee(nominee.id); } finally { removeProcessing(nominee.id); } }}
          disabled={isProcessing}
          style={{
            padding: spacing.xs,
            background: 'rgba(239,68,68,0.1)',
            border: 'none',
            borderRadius: borderRadius.sm,
            cursor: 'pointer',
            color: '#ef4444',
            minWidth: '32px',
            minHeight: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <XCircle size={16} />
        </button>
      </div>
    );
  };

  // Download card button shared across rows
  const CardDownloadButton = ({ person, type }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const isContestant = type === 'contestant';
    const advancementCards = isContestant ? getAdvancementCardsForContestant(person) : [];

    if (!isContestant) {
      return (
        <button
          onClick={() => handleDownloadCard(person, type)}
          disabled={generatingCardId === person.id}
          title="Download share card"
          style={{
            padding: spacing.xs,
            background: 'rgba(212,175,55,0.1)',
            border: 'none',
            borderRadius: borderRadius.sm,
            cursor: generatingCardId === person.id ? 'wait' : 'pointer',
            color: colors.gold.primary,
            minWidth: '32px',
            minHeight: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {generatingCardId === person.id ? (
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Download size={16} />
          )}
        </button>
      );
    }

    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          disabled={generatingCardId === person.id}
          title="Download share card"
          style={{
            padding: spacing.xs,
            background: 'rgba(212,175,55,0.1)',
            border: 'none',
            borderRadius: borderRadius.sm,
            cursor: generatingCardId === person.id ? 'wait' : 'pointer',
            color: colors.gold.primary,
            minWidth: '32px',
            minHeight: '32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {generatingCardId === person.id ? (
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <Download size={16} />
          )}
        </button>
        {menuOpen && (
          <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 9 }}
              onClick={() => setMenuOpen(false)}
            />
            <div style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: 4,
              background: colors.background.secondary,
              border: `1px solid ${colors.border.primary}`,
              borderRadius: borderRadius.md,
              padding: spacing.xs,
              zIndex: 10,
              minWidth: 160,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}>
              <button
                onClick={() => { setMenuOpen(false); handleDownloadCard(person, 'contestant'); }}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  background: 'none',
                  border: 'none',
                  color: colors.text.primary,
                  cursor: 'pointer',
                  borderRadius: borderRadius.sm,
                  textAlign: 'left',
                  fontSize: typography.fontSize.sm,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.target.style.background = 'none'}
              >
                Contestant Card
              </button>
              {advancementCards.map((advancement) => (
                <button
                  key={advancement.advanceCount}
                  onClick={() => {
                    setMenuOpen(false);
                    handleDownloadCard(person, 'contestant', {
                      customTitle: advancement.title,
                      fileSuffix: `top-${advancement.advanceCount}`,
                    });
                  }}
                  style={{
                    padding: `${spacing.xs} ${spacing.sm}`,
                    background: 'none',
                    border: 'none',
                    color: colors.text.primary,
                    cursor: 'pointer',
                    borderRadius: borderRadius.sm,
                    textAlign: 'left',
                    fontSize: typography.fontSize.sm,
                    whiteSpace: 'nowrap',
                  }}
                  onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={e => e.target.style.background = 'none'}
                >
                  {advancement.menuLabel}
                </button>
              ))}
              <button
                onClick={() => { setMenuOpen(false); handleDownloadCard(person, 'nominee'); }}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  background: 'none',
                  border: 'none',
                  color: colors.text.primary,
                  cursor: 'pointer',
                  borderRadius: borderRadius.sm,
                  textAlign: 'left',
                  fontSize: typography.fontSize.sm,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
                onMouseLeave={e => e.target.style.background = 'none'}
              >
                Nominated Card
              </button>
              <button
                onClick={() => { setMenuOpen(false); handleDownloadPhoto(person); }}
                disabled={!person.avatarUrl}
                title={person.avatarUrl ? 'Download original profile photo' : 'No profile photo on file'}
                style={{
                  padding: `${spacing.xs} ${spacing.sm}`,
                  background: 'none',
                  border: 'none',
                  color: person.avatarUrl ? colors.text.primary : colors.text.muted,
                  cursor: person.avatarUrl ? 'pointer' : 'not-allowed',
                  borderRadius: borderRadius.sm,
                  textAlign: 'left',
                  fontSize: typography.fontSize.sm,
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (person.avatarUrl) e.target.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => e.target.style.background = 'none'}
              >
                Profile Photo
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  // Extract bare email from "Name <email>" format
  const parseEmail = (email) => {
    if (!email) return email;
    const match = email.match(/<([^>]+)>/);
    return match ? match[1] : email;
  };

  // Person row component - shared between contestants and nominees
  const PersonRow = ({ person, actions, dimmed, showVotes, onNameClick, cardType, onAvatarUpload }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: spacing.md,
      padding: spacing.md,
      background: colors.background.secondary,
      borderRadius: borderRadius.lg,
      opacity: dimmed ? 0.7 : 1,
    }}>
      {onAvatarUpload ? (
        <button
          onClick={() => onAvatarUpload(person)}
          title={person.avatarUrl ? 'Change photo' : 'Upload photo'}
          style={{
            position: 'relative',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: uploadingAvatarId === person.id ? 'wait' : 'pointer',
            borderRadius: '50%',
            flexShrink: 0,
          }}
        >
          <Avatar name={person.name} size={40} src={person.avatarUrl} />
          <div style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: uploadingAvatarId === person.id ? 1 : 0,
            transition: 'opacity 0.15s',
          }}
            onMouseEnter={e => { if (uploadingAvatarId !== person.id) e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={e => { if (uploadingAvatarId !== person.id) e.currentTarget.style.opacity = '0'; }}
          >
            {uploadingAvatarId === person.id ? (
              <Loader size={16} style={{ color: '#fff', animation: 'spin 1s linear infinite' }} />
            ) : (
              <Camera size={16} style={{ color: '#fff' }} />
            )}
          </div>
        </button>
      ) : (
        <Avatar name={person.name} size={40} src={person.avatarUrl} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        {onNameClick ? (
          <button
            onClick={onNameClick}
            style={{
              fontWeight: typography.fontWeight.medium,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              background: 'none',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              padding: 0,
              fontSize: 'inherit',
              textAlign: 'left',
              display: 'flex',
              alignItems: 'center',
              gap: spacing.xs,
              width: '100%',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {person.name}
            </span>
            <ExternalLink size={12} style={{ opacity: 0.5, flexShrink: 0 }} />
          </button>
        ) : (
          <p style={{
            fontWeight: typography.fontWeight.medium,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {person.name}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' }}>
          {splitByGender && (person.gender === 'male' || person.gender === 'female') && (
            <span style={{
              fontSize: typography.fontSize.xs,
              fontWeight: typography.fontWeight.semibold,
              padding: `1px ${spacing.xs}`,
              borderRadius: borderRadius.sm,
              background: 'rgba(212,175,55,0.12)',
              color: colors.gold.primary,
              letterSpacing: '0.04em',
            }}>
              {person.gender === 'male' ? 'M' : 'F'}
            </span>
          )}
          {/* How far the contestant got: "Winner" / "Finalist" / "Top N" /
              "Entry Round" so a host can read the bracket at a glance. */}
          {cardType === 'contestant' && (() => {
            const tier = getReachedTierLabel(person, votingRounds);
            if (!tier) return null;
            const out = person.status === 'eliminated';
            return (
              <span style={{
                fontSize: typography.fontSize.xs,
                fontWeight: typography.fontWeight.semibold,
                padding: `1px ${spacing.xs}`,
                borderRadius: borderRadius.sm,
                background: out ? 'rgba(255,255,255,0.06)' : 'rgba(212,175,55,0.12)',
                color: out ? colors.text.secondary : colors.gold.primary,
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap',
              }}>
                {tier}
              </span>
            );
          })()}
          <span style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>
            {parseEmail(person.email)}{(() => {
              // Contestants show their total competition votes (lifetime); the
              // round-scoped `votes` is a misleading per-round number that
              // resets and freezes on elimination.
              const total = person.lifetimeVotes ?? person.votes;
              return showVotes && total > 0 ? `${person.email ? ' · ' : ''}${total.toLocaleString()} votes` : '';
            })()}
            {person.inviteSentAt && (
              <span style={{ color: colors.text.muted, opacity: 0.7 }}>
                {' · '}Invited {new Date(person.inviteSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </span>
          {person.instagram && <InstagramLink instagram={person.instagram} />}
        </div>
        {(cardType === 'nominee' || cardType === 'contestant') && customQuestions.length > 0 && (
          <CustomQuestionAnswers questions={customQuestions} answers={person.eligibilityAnswers} />
        )}
      </div>
      {cardType && <CardDownloadButton person={person} type={cardType} />}
      {actions}
    </div>
  );

  const totalPeople = activeNominees.length + contestants.length;
  const isNewHost = totalPeople === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xl }}>
      {/* Hidden file input for nominee avatar uploads */}
      <input
        ref={avatarFileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleAvatarFileChange}
      />

      {/* Getting Started - shown when no people yet */}
      {isNewHost && (
        <div style={{
          padding: isMobile ? spacing.lg : spacing.xl,
          borderRadius: borderRadius.xl,
          background: 'linear-gradient(135deg, rgba(212,175,55,0.1) 0%, rgba(139,92,246,0.06) 100%)',
          border: '1px solid rgba(212,175,55,0.2)',
        }}>
          <h3 style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.semibold,
            marginBottom: spacing.sm,
            color: colors.gold.primary,
          }}>
            Get your first nominees
          </h3>
          <p style={{
            color: colors.text.secondary,
            fontSize: typography.fontSize.sm,
            lineHeight: 1.6,
            marginBottom: spacing.lg,
          }}>
            {canAddNominee
              ? 'Share your competition link to collect nominations, or add people manually to get started.'
              : 'Once nominations open, you can collect them from your competition link or add people manually.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
            <div style={{ display: 'flex', gap: spacing.sm, flexWrap: 'wrap' }}>
              <Button
                size="sm"
                icon={Plus}
                disabled={!canAddNominee}
                onClick={() => onOpenAddPersonModal('nominee')}
              >
                Add Nominee
              </Button>
            </div>
            {addNomineeBlockedReason && (
              <p style={{
                display: 'flex', alignItems: 'center', gap: spacing.xs,
                color: colors.text.muted, fontSize: typography.fontSize.xs, margin: 0,
              }}>
                <Clock size={12} style={{ flexShrink: 0 }} />
                {addNomineeBlockedReason}
              </p>
            )}
          </div>
        </div>
      )}


      {/* Winners Manager */}
      <div style={{ order: sectionOrder('winners') }}>
        <WinnersManager competition={competition} onUpdate={onRefresh} allowEdit={isSuperAdmin} />
      </div>

      {/* Judges now live in the Setup tab, next to the judging rules, so the
          whole judging setup is in one place. Live results (the leaderboard)
          remain on the Activity tab. */}

      {/* Gender filter chips — only shown when the competition splits
       *  winners by gender. Filters every section below + the contestants
       *  panel. Counts above stay against the full population. */}
      {!isNewHost && splitByGender && (
        <div style={{
          display: 'flex',
          gap: spacing.xs,
          flexWrap: 'wrap',
          padding: spacing.xs,
          background: colors.background.card,
          border: `1px solid ${colors.border.light}`,
          borderRadius: borderRadius.lg,
        }}>
          {[
            { value: 'all', label: 'All' },
            { value: 'male', label: 'Men' },
            { value: 'female', label: 'Women' },
          ].map((opt) => {
            const active = genderFilter === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setGenderFilter(opt.value)}
                style={{
                  flex: isMobile ? 1 : 'initial',
                  padding: `${spacing.xs} ${spacing.md}`,
                  background: active ? 'rgba(212,175,55,0.15)' : 'transparent',
                  border: `1px solid ${active ? colors.gold.primary : 'transparent'}`,
                  borderRadius: borderRadius.md,
                  color: active ? colors.gold.primary : colors.text.secondary,
                  fontSize: typography.fontSize.sm,
                  fontWeight: typography.fontWeight.medium,
                  cursor: 'pointer',
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Stats Row - hide when all zeros */}
      {!isNewHost && <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
        gap: spacing.sm,
      }}>
        {[
          { label: 'Nominees', list: nominees, color: colors.gold.primary },
          { label: 'Ready to Approve', list: nomineesWithProfileAll, color: '#3b82f6' },
          { label: 'Awaiting Response', list: externalNomineesAll, color: '#f59e0b' },
          { label: 'Contestants', list: contestants || [], color: '#22c55e' },
          { label: 'Declined', list: declinedNomineesAll, color: '#ef4444' },
        ].map((stat, i, arr) => {
          const breakdown = splitByGender ? byGender(stat.list) : null;
          return (
            <div
              key={stat.label}
              style={{
                background: colors.background.card,
                border: `1px solid ${colors.border.light}`,
                borderRadius: borderRadius.lg,
                padding: spacing.md,
                ...(isMobile && i === arr.length - 1 && arr.length % 2 === 1 ? { gridColumn: 'span 2' } : {}),
              }}
            >
              <p style={{
                color: colors.text.secondary,
                fontSize: typography.fontSize.xs,
                marginBottom: spacing.xs,
              }}>
                {stat.label}
              </p>
              <p style={{
                fontSize: typography.fontSize.xl,
                fontWeight: typography.fontWeight.bold,
                color: stat.color,
              }}>
                {stat.list.length}
              </p>
              {breakdown && (
                <p style={{
                  marginTop: spacing.xs,
                  fontSize: typography.fontSize.xs,
                  color: colors.text.muted,
                }}>
                  {breakdown.male}M · {breakdown.female}F
                  {breakdown.unset > 0 ? ` · ${breakdown.unset}?` : ''}
                </p>
              )}
            </div>
          );
        })}
      </div>}

      {/* Contestants Section */}
      <Panel
        title={`Contestants (${contestantsFiltered.length})`}
        icon={Crown}
        style={{ marginBottom: 0, order: sectionOrder('contestants') }}
        collapsible
        defaultCollapsed
        action={
          <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            {onSendHostBroadcast && contestantsFiltered.length > 0 && (
              <Button
                size="sm"
                variant="secondary"
                icon={MessageSquare}
                onClick={() => openBroadcastModal('contestants')}
                title="Send a message to all contestants"
              >
                Message
              </Button>
            )}
            {contestants.some(c => c.avatarUrl) && (
              <Button
                size="sm"
                variant="secondary"
                icon={bulkPhotoProgress ? Loader : Download}
                disabled={!!bulkPhotoProgress}
                onClick={handleDownloadAllPhotos}
                title="Download all contestant profile photos"
              >
                {bulkPhotoProgress ? `${bulkPhotoProgress.current}/${bulkPhotoProgress.total}` : 'Photos'}
              </Button>
            )}
          </div>
        }
      >
        <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
          {contestantsFiltered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.text.secondary }}>
              <Crown size={40} style={{ marginBottom: spacing.md, opacity: 0.4, color: colors.gold.primary }} />
              <p style={{ marginBottom: spacing.md, fontSize: typography.fontSize.sm }}>No contestants yet</p>
              <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted }}>
                Approve nominees to build your lineup.
              </p>
            </div>
          ) : (() => {
            const sortedContestants = showReorder
              ? [...contestantsFiltered].sort((a, b) => (a.rank || 999) - (b.rank || 999))
              : sortContestantsByStanding(contestantsFiltered, (c) => c.lifetimeVotes || 0);
            return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {sortedContestants.map((c, idx) => (
                <PersonRow
                  key={c.id}
                  person={c}
                  showVotes
                  cardType="contestant"
                  onAvatarUpload={(person) => handleAvatarClick(person, 'contestant')}
                  onNameClick={c.userId ? () => handleViewProfile(c.userId) : undefined}
                  actions={
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      {showReorder && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <button
                            onClick={() => handleMoveContestant(c.id, 'up')}
                            disabled={idx === 0 || reordering}
                            title="Move up"
                            style={{
                              padding: '2px',
                              background: 'transparent',
                              border: 'none',
                              cursor: idx === 0 || reordering ? 'default' : 'pointer',
                              color: idx === 0 ? colors.border.primary : colors.text.secondary,
                              opacity: idx === 0 ? 0.3 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <ChevronUp size={14} />
                          </button>
                          <button
                            onClick={() => handleMoveContestant(c.id, 'down')}
                            disabled={idx === sortedContestants.length - 1 || reordering}
                            title="Move down"
                            style={{
                              padding: '2px',
                              background: 'transparent',
                              border: 'none',
                              cursor: idx === sortedContestants.length - 1 || reordering ? 'default' : 'pointer',
                              color: idx === sortedContestants.length - 1 ? colors.border.primary : colors.text.secondary,
                              opacity: idx === sortedContestants.length - 1 ? 0.3 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                      )}
                      {onUnconvertContestant && (
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Move ${c.name} back to Nominees? This undoes the conversion — they stop being public and votable, and return to the "Ready to Approve" list. Any votes auto-awarded by the conversion are discarded.`)) return;
                            addProcessing(c.id);
                            try {
                              const result = await onUnconvertContestant(c.id);
                              if (result && !result.success) alert(result.error || 'Could not move this contestant back to nominees.');
                            } finally { removeProcessing(c.id); }
                          }}
                          disabled={processingIds.has(c.id)}
                          title="Move back to nominees (undo conversion)"
                          style={{
                            padding: spacing.xs,
                            background: 'rgba(212,175,55,0.1)',
                            border: 'none',
                            borderRadius: borderRadius.sm,
                            cursor: 'pointer',
                            color: colors.gold.primary,
                            minWidth: '32px',
                            minHeight: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <RotateCcw size={16} />
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Remove ${c.name} from contestants? They will be moved to Declined.`)) return;
                          addProcessing(c.id);
                          try { await onRemoveContestant(c.id); } finally { removeProcessing(c.id); }
                        }}
                        disabled={processingIds.has(c.id)}
                        title="Remove contestant"
                        style={{
                          padding: spacing.xs,
                          background: 'rgba(239,68,68,0.1)',
                          border: 'none',
                          borderRadius: borderRadius.sm,
                          cursor: 'pointer',
                          color: '#ef4444',
                          minWidth: '32px',
                          minHeight: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
            );
          })()}
        </div>
      </Panel>

      {/* Ready to Approve */}
      <Panel
        title={`Ready to Approve (${nomineesWithProfile.length})`}
        icon={UserCheck}
        style={{ marginBottom: 0, order: sectionOrder('readyToApprove') }}
        collapsible
        defaultCollapsed
      >
        <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
          {nomineesWithProfile.length === 0 ? (
            <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.text.secondary }}>
              <UserCheck size={40} style={{ marginBottom: spacing.md, opacity: 0.4 }} />
              <p style={{ fontSize: typography.fontSize.sm }}>No nominees ready to approve yet</p>
              <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: spacing.xs }}>
                Nominees who accept and complete their profile will appear here for your review.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {nomineesWithProfile.map(n => (
                <PersonRow
                  key={n.id}
                  person={n}
                  showVotes
                  cardType="nominee"
                  onNameClick={n.matchedProfileId ? () => handleViewProfile(n.matchedProfileId) : undefined}
                  actions={<NomineeActions nominee={n} />}
                  onAvatarUpload={handleAvatarClick}
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* External Nominees */}
      <Panel
        title={`Awaiting Response (${externalNominees.length})`}
        icon={Users}
        style={{ marginBottom: 0, order: sectionOrder('awaitingResponse') }}
        collapsible
        defaultCollapsed
        action={
          <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
            {onSendHostBroadcast && activeNominees.length > 0 && !nominationsEnded && (
              <Button
                size="sm"
                variant="secondary"
                icon={MessageSquare}
                onClick={() => openBroadcastModal('nominees')}
                title="Send a message to all nominees"
              >
                Message
              </Button>
            )}
            <span title={addNomineeBlockedReason || undefined}>
              <Button
                size="sm"
                icon={Plus}
                disabled={!canAddNominee}
                onClick={() => onOpenAddPersonModal('nominee')}
              >
                Add
              </Button>
            </span>
          </div>
        }
      >
        <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
          {externalNominees.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: spacing.sm, marginBottom: spacing.md }}>
              {onResendInvite && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={processingIds.has('bulk-send')}
                  onClick={() => handleBulkResendInvites(externalNominees, 'awaiting')}
                >
                  <Send size={14} style={{ marginRight: spacing.xs }} />
                  {processingIds.has('bulk-send') ? 'Sending...' : 'Send All Invites'}
                </Button>
              )}
              {onRepairAllNomineeAccounts && <Button
                variant="secondary"
                size="sm"
                disabled={processingIds.has('repair-all')}
                onClick={async () => {
                  if (!confirm(`Repair all ${externalNominees.length} external nominee accounts? This will create auth users and sync profiles for any that are missing.`)) return;
                  addProcessing('repair-all');
                  try {
                    const result = await onRepairAllNomineeAccounts();
                    if (result?.success) {
                      alert(result.data?.summary || 'Repair complete');
                    } else {
                      alert(`Repair failed: ${result?.error || 'Unknown error'}`);
                    }
                  } finally {
                    removeProcessing('repair-all');
                  }
                }}
              >
                <Wrench size={14} style={{ marginRight: spacing.xs }} />
                {processingIds.has('repair-all') ? 'Repairing...' : 'Repair All Accounts'}
              </Button>}
            </div>
          )}
          {externalNominees.length === 0 ? (
            <div style={{ textAlign: 'center', padding: spacing.xl, color: colors.text.secondary }}>
              <Users size={40} style={{ marginBottom: spacing.md, opacity: 0.4 }} />
              <p style={{ fontSize: typography.fontSize.sm }}>No one awaiting response</p>
              <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, marginTop: spacing.xs }}>
                Nominees who haven't accepted their invitation yet will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {externalNominees.map(n => (
                <PersonRow
                  key={n.id}
                  person={n}
                  showVotes
                  cardType="nominee"
                  actions={<NomineeActions nominee={n} />}
                  onAvatarUpload={handleAvatarClick}
                />
              ))}
            </div>
          )}
        </div>
      </Panel>

      {/* Incomplete Self-Nominations */}
      {incompleteNominees.length > 0 && (
        <Panel
          title={`Incomplete Self-Nominations (${incompleteNominees.length})`}
          icon={Clock}
          style={{ marginBottom: 0, order: sectionOrder('incompleteSelfNoms') }}
          collapsible
          defaultCollapsed
        >
          <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, margin: 0 }}>
                These people started entering but haven't finished their profile.
              </p>
              {onResendInvite && incompleteNominees.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={processingIds.has('bulk-send')}
                  onClick={() => handleBulkResendInvites(incompleteNominees, 'incomplete')}
                >
                  <Send size={14} style={{ marginRight: spacing.xs }} />
                  {processingIds.has('bulk-send') ? 'Sending...' : 'Send All Reminders'}
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {incompleteNominees.map(n => (
                <PersonRow
                  key={n.id}
                  person={n}
                  cardType="nominee"
                  onAvatarUpload={handleAvatarClick}
                  actions={
                    <div style={{ display: 'flex', gap: spacing.xs, alignItems: 'center' }}>
                      <span style={{
                        fontSize: typography.fontSize.xs,
                        padding: `2px ${spacing.sm}`,
                        borderRadius: borderRadius.sm,
                        background: 'rgba(251,191,36,0.15)',
                        color: '#fbbf24',
                        whiteSpace: 'nowrap',
                      }}>
                        Incomplete
                      </span>
                      {n.inviteToken && (
                        <button
                          onClick={() => handleCopyClaimLink(n)}
                          title={copiedId === n.id ? 'Copied!' : 'Copy resume link'}
                          style={{
                            padding: spacing.xs,
                            background: copiedId === n.id ? 'rgba(34,197,94,0.1)' : 'rgba(59,130,246,0.1)',
                            border: 'none',
                            borderRadius: borderRadius.sm,
                            cursor: 'pointer',
                            color: copiedId === n.id ? '#22c55e' : '#3b82f6',
                            minWidth: '32px',
                            minHeight: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {copiedId === n.id ? <Check size={16} /> : <Link2 size={16} />}
                        </button>
                      )}
                      {n.email && onResendInvite && (
                        <button
                          onClick={() => handleResendInvite(n)}
                          disabled={processingIds.has(n.id)}
                          title={resentId === n.id ? 'Sent!' : `Send reminder to finish profile${n.inviteSentAt ? `\nLast sent: ${new Date(n.inviteSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}`}
                          style={{
                            padding: spacing.xs,
                            background: resentId === n.id ? 'rgba(34,197,94,0.1)' : 'rgba(168,85,247,0.1)',
                            border: 'none',
                            borderRadius: borderRadius.sm,
                            cursor: processingIds.has(n.id) ? 'not-allowed' : 'pointer',
                            color: resentId === n.id ? '#22c55e' : '#a855f7',
                            minWidth: '32px',
                            minHeight: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {resentId === n.id ? <Check size={16} /> : <Send size={16} />}
                        </button>
                      )}
                      <button
                        onClick={async () => { addProcessing(n.id); try { await onRejectNominee(n.id); } finally { removeProcessing(n.id); } }}
                        disabled={processingIds.has(n.id)}
                        title="Reject"
                        style={{
                          padding: spacing.xs,
                          background: 'rgba(239,68,68,0.1)',
                          border: 'none',
                          borderRadius: borderRadius.sm,
                          cursor: 'pointer',
                          color: '#ef4444',
                          minWidth: '32px',
                          minHeight: '32px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </div>
        </Panel>
      )}

      {/* Declined / Rejected */}
      {declinedNominees.length > 0 && (
        <Panel
          title={`Declined (${declinedNominees.length})`}
          icon={XCircle}
          style={{ marginBottom: 0, order: sectionOrder('declined') }}
          collapsible
          defaultCollapsed
        >
          <div style={{ padding: isMobile ? spacing.md : spacing.xl }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
              {declinedNominees.map(n => (
                <PersonRow
                  key={n.id}
                  person={n}
                  dimmed
                  actions={
                    <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs }}>
                      <Badge variant="error" size="sm">
                        {n.status === 'declined' ? 'Declined' : 'Rejected'}
                      </Badge>
                      <button
                        onClick={async () => {
                          addProcessing(n.id);
                          try { await onRestoreNominee(n.id); } finally { removeProcessing(n.id); }
                        }}
                        disabled={processingIds.has(n.id)}
                        title="Unreject"
                        style={{
                          padding: `${spacing.xs} ${spacing.sm}`,
                          background: 'rgba(34,197,94,0.1)',
                          border: 'none',
                          borderRadius: borderRadius.sm,
                          cursor: processingIds.has(n.id) ? 'not-allowed' : 'pointer',
                          color: '#22c55e',
                          display: 'flex',
                          alignItems: 'center',
                          gap: spacing.xs,
                          fontSize: typography.fontSize.sm,
                        }}
                      >
                        <RotateCcw size={14} /> Restore
                      </button>
                    </div>
                  }
                />
              ))}
            </div>
          </div>
        </Panel>
      )}

      {/* Convert-to-contestant confirmation. Converting is a one-way, public
       *  action (the nominee goes live on the Contestants page and voting
       *  opens), so it requires an explicit confirm to avoid early conversions. */}
      <Modal
        isOpen={!!convertConfirm}
        onClose={() => setConvertConfirm(null)}
        title="Convert to contestant?"
        maxWidth="480px"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConvertConfirm(null)} style={{ width: 'auto' }}>
              Cancel
            </Button>
            <Button
              icon={Crown}
              disabled={convertConfirm ? processingIds.has(convertConfirm.id) : false}
              onClick={async () => {
                const nominee = convertConfirm;
                if (!nominee) return;
                addProcessing(nominee.id);
                try {
                  const result = await onApproveNominee(nominee);
                  if (result && !result.success) {
                    alert(result.error || 'Could not convert this nominee to a contestant.');
                  } else {
                    setConvertConfirm(null);
                  }
                } finally {
                  removeProcessing(nominee.id);
                }
              }}
              style={{ width: 'auto' }}
            >
              Convert &amp; notify
            </Button>
          </>
        }
      >
        {convertConfirm && (() => {
          const votingOpen = !!competition?.votingStart && new Date(competition.votingStart) <= new Date();
          const bullets = [
            'Publish their profile on the public Contestants page',
            votingOpen
              ? 'Open voting so fans can cast votes for them right away'
              : 'Make them eligible to receive votes once voting opens',
            'Add them to the leaderboard',
            'Email them to let them know they’ve been accepted',
          ];
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.lg }}>
              <p style={{ color: colors.text.light, fontSize: typography.fontSize.md, lineHeight: 1.6 }}>
                This makes <strong style={{ color: '#fff' }}>{convertConfirm.name}</strong> an active contestant. It will:
              </p>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                {bullets.map((line) => (
                  <li key={line} style={{ display: 'flex', alignItems: 'flex-start', gap: spacing.sm }}>
                    <Check size={16} style={{ color: colors.gold.primary, flexShrink: 0, marginTop: 2 }} />
                    <span style={{ color: colors.text.secondary, fontSize: typography.fontSize.md, lineHeight: 1.5 }}>
                      {line}
                    </span>
                  </li>
                ))}
              </ul>
              {!votingOpen && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: spacing.sm,
                  padding: spacing.md,
                  background: 'rgba(245,158,11,0.1)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: borderRadius.md,
                }}>
                  <Clock size={16} style={{ color: colors.status.warning, flexShrink: 0, marginTop: 2 }} />
                  <span style={{ color: colors.text.secondary, fontSize: typography.fontSize.sm, lineHeight: 1.5 }}>
                    They’ll be published on the public Contestants page right away, but fans can’t vote until voting opens. There’s no rush to convert — you can wait until closer to when voting starts. You can undo this from the Contestants list as long as they have no votes.
                  </span>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Host → audience broadcast composer */}
      <HostBroadcastModal
        isOpen={broadcastModal.isOpen}
        onClose={closeBroadcastModal}
        defaultAudience={broadcastModal.defaultAudience}
        allowNominees={!nominationsEnded}
        reach={{ contestants: (contestants || []).length, nominees: activeNominees.length }}
        competitionName={competition?.name}
        onCheckStatus={onGetHostBroadcastStatus}
        onSend={handleSendHostBroadcast}
      />

      {/* Keyframes for loader animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
