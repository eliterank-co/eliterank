import React, { useState, useEffect, useCallback } from 'react';
import { Gift, Package, ExternalLink, Clock, Check, Link2, Plus, AlertCircle, Pencil, Trash2, Trophy } from 'lucide-react';
import { Panel, Button } from '../../components/ui';
import { CrownIcon } from '../../components/ui/icons';
import ClaimRewardModal from '../../components/modals/ClaimRewardModal';
import { colors, spacing, borderRadius, typography } from '../../styles/theme';
import { useResponsive } from '../../hooks/useResponsive';
import { PrizeGenderBadge } from '../../components/ui/PrizeGenderBadge';
import { supabase } from '../../lib/supabase';
import { useSupabaseAuth } from '../../hooks';
import { SkeletonPulse, SkeletonCard } from '../../components/common/Skeleton';

const STATUS_CONFIG = {
  pending: { color: '#eab308', label: 'Pending Claim', description: 'Click to claim this reward' },
  claimed: { color: '#3b82f6', label: 'Claimed', description: 'Awaiting shipment' },
  shipped: { color: '#8b5cf6', label: 'Shipped', description: 'On its way to you' },
  active: { color: '#22c55e', label: 'Active', description: 'Start promoting!' },
  completed: { color: '#6b7280', label: 'Completed', description: 'Thank you for participating' },
  expired: { color: '#ef4444', label: 'Expired', description: 'Claim period ended' },
};

/**
 * RewardsPage - Displays user rewards dashboard
 * Shows a simplified profile banner and available rewards section
 */
export default function RewardsPage({ hostProfile }) {
  const { isMobile } = useResponsive();
  const { user } = useSupabaseAuth();
  const [claimableRewards, setClaimableRewards] = useState([]); // Individual assignments (can claim)
  const [visibleRewards, setVisibleRewards] = useState([]); // Competition assignments (visible only)
  const [competitionPrizes, setCompetitionPrizes] = useState([]); // Prizes from competition_prizes table
  const [loading, setLoading] = useState(true);
  const [claimingAssignment, setClaimingAssignment] = useState(null); // Assignment being claimed (opens modal)
  const [addingLinkId, setAddingLinkId] = useState(null);
  const [newLink, setNewLink] = useState('');

  // Fetch user's rewards (both claimable and visible-only)
  const fetchRewards = useCallback(async () => {
    if (!user?.id || !supabase) {
      setClaimableRewards([]);
      setVisibleRewards([]);
      setCompetitionPrizes([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch contestants and nominees for this user in parallel
      const [contestantsRes, nomineesRes] = await Promise.all([
        supabase
          .from('contestants')
          .select('id, competition_id')
          .eq('user_id', user.id),
        supabase
          .from('nominees')
          .select('id, competition_id')
          .eq('user_id', user.id),
      ]);

      if (contestantsRes.error) throw contestantsRes.error;
      if (nomineesRes.error) throw nomineesRes.error;

      const contestants = contestantsRes.data || [];
      const nominees = nomineesRes.data || [];

      const contestantIds = contestants.map(c => c.id);
      const nomineeIds = nominees.map(n => n.id);
      const competitionIds = [
        ...new Set([
          ...contestants.map(c => c.competition_id),
          ...nominees.map(n => n.competition_id),
        ]),
      ];

      if (contestantIds.length === 0 && nomineeIds.length === 0) {
        setClaimableRewards([]);
        setVisibleRewards([]);
        setCompetitionPrizes([]);
        setLoading(false);
        return;
      }

      const rewardSelect = `
        *,
        reward:rewards(*),
        competition:competitions(
          id,
          name,
          season,
          city:cities(name)
        )
      `;

      // Fetch individual assignments for contestants and nominees in parallel
      const assignmentQueries = [];

      if (contestantIds.length > 0) {
        assignmentQueries.push(
          supabase
            .from('reward_assignments')
            .select(rewardSelect)
            .in('contestant_id', contestantIds)
            .order('created_at', { ascending: false })
        );
      }

      if (nomineeIds.length > 0) {
        assignmentQueries.push(
          supabase
            .from('reward_assignments')
            .select(rewardSelect)
            .in('nominee_id', nomineeIds)
            .order('created_at', { ascending: false })
        );
      }

      const assignmentResults = await Promise.all(assignmentQueries);

      // Merge all individual assignments, deduplicating by reward_id (same reward shouldn't show twice)
      const allAssignments = [];
      const seenRewardIds = new Set();
      for (const res of assignmentResults) {
        if (res.error) throw res.error;
        for (const a of (res.data || [])) {
          const rewardId = a.reward_id || a.reward?.id;
          if (!seenRewardIds.has(rewardId)) {
            seenRewardIds.add(rewardId);
            allAssignments.push(a);
          }
        }
      }
      setClaimableRewards(allAssignments);

      // Get competition-level assignments (visible rewards)
      let visibleOnly = [];
      if (competitionIds.length > 0) {
        const { data: compAssignments, error: compError } = await supabase
          .from('reward_competition_assignments')
          .select(rewardSelect)
          .in('competition_id', competitionIds)
          .order('created_at', { ascending: false });

        if (compError) throw compError;

        // Filter out rewards that user already has individual assignment for
        const claimableRewardIds = new Set(allAssignments.map(a => a.reward_id));
        visibleOnly = (compAssignments || []).filter(ca => !claimableRewardIds.has(ca.reward_id));
      }
      setVisibleRewards(visibleOnly);

      // Fetch competition prizes (from competition page)
      if (competitionIds.length > 0) {
        const { data: prizesData, error: prizesError } = await supabase
          .from('competition_prizes')
          .select(`
            id, title, description, image_url, value, sponsor_name,
            external_url, sort_order, prize_type, recipient_gender,
            competition:competitions(id, name, season, city:cities(name))
          `)
          .in('competition_id', competitionIds)
          .order('sort_order', { ascending: true });

        if (!prizesError) {
          setCompetitionPrizes(prizesData || []);
        }
      }
    } catch (err) {
      console.error('Error fetching rewards:', err);
      setClaimableRewards([]);
      setVisibleRewards([]);
      setCompetitionPrizes([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  // Open claim modal for a reward assignment
  const handleStartClaim = (assignment) => {
    setClaimingAssignment(assignment);
  };

  // Add content link
  const handleAddLink = async (assignmentId) => {
    if (!newLink.trim() || !supabase) return;

    try {
      const assignment = claimableRewards.find(a => a.id === assignmentId);
      const currentLinks = assignment?.content_links || [];
      const updatedLinks = [...currentLinks, newLink.trim()];

      const { error } = await supabase
        .from('reward_assignments')
        .update({
          content_links: updatedLinks,
          content_posted: true,
        })
        .eq('id', assignmentId);

      if (error) throw error;
      await fetchRewards();
      setNewLink('');
      setAddingLinkId(null);
    } catch (err) {
      console.error('Error adding link:', err);
      alert('Failed to add link. Please try again.');
    }
  };

  // Edit existing content link
  const handleEditLink = async (assignmentId, linkIndex, updatedLink) => {
    if (!updatedLink.trim() || !supabase) return;

    try {
      const assignment = claimableRewards.find(a => a.id === assignmentId);
      const currentLinks = [...(assignment?.content_links || [])];
      currentLinks[linkIndex] = updatedLink.trim();

      const { error } = await supabase
        .from('reward_assignments')
        .update({ content_links: currentLinks })
        .eq('id', assignmentId);

      if (error) throw error;
      await fetchRewards();
    } catch (err) {
      console.error('Error editing link:', err);
      alert('Failed to update link. Please try again.');
    }
  };

  // Delete content link
  const handleDeleteLink = async (assignmentId, linkIndex) => {
    if (!supabase) return;

    try {
      const assignment = claimableRewards.find(a => a.id === assignmentId);
      const currentLinks = [...(assignment?.content_links || [])];
      currentLinks.splice(linkIndex, 1);

      const { error } = await supabase
        .from('reward_assignments')
        .update({
          content_links: currentLinks,
          content_posted: currentLinks.length > 0,
        })
        .eq('id', assignmentId);

      if (error) throw error;
      await fetchRewards();
    } catch (err) {
      console.error('Error deleting link:', err);
      alert('Failed to delete link. Please try again.');
    }
  };

  if (!hostProfile) return null;

  // Separate claimable rewards by status
  const pendingRewards = claimableRewards.filter(a => a.status === 'pending');
  const activeRewards = claimableRewards.filter(a => ['claimed', 'shipped', 'active'].includes(a.status));
  const completedRewards = claimableRewards.filter(a => ['completed', 'expired'].includes(a.status));

  // Filter out competition prizes that already appear in rewards sections
  const existingRewardNames = new Set();
  for (const a of [...claimableRewards, ...visibleRewards]) {
    const r = a.reward;
    const name = Array.isArray(r) ? r[0]?.name : r?.name;
    if (name) existingRewardNames.add(name.trim().toLowerCase());
  }
  const dedupedPrizes = competitionPrizes.filter(p =>
    !p.title || !existingRewardNames.has(p.title.trim().toLowerCase())
  );

  // Split competition prizes by type
  const winnerPrizes = dedupedPrizes.filter(p => (p.prize_type || 'winner') === 'winner');
  const contestantRewards = dedupedPrizes.filter(p => p.prize_type === 'contestant');

  // Check if there are any rewards at all (claimable, visible, or competition prizes)
  const hasAnyRewards = claimableRewards.length > 0 || visibleRewards.length > 0 || dedupedPrizes.length > 0;

  return (
    <div>
      {/* Loading State */}
      {loading && (
        <div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: isMobile ? spacing.md : spacing.xl,
          }}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i}>
                <SkeletonPulse
                  height={isMobile ? '140px' : '180px'}
                  radius={isMobile ? borderRadius.lg : borderRadius.xl}
                  style={{ marginBottom: spacing.sm }}
                />
                <SkeletonPulse height="16px" width="70%" style={{ marginBottom: spacing.xs }} />
                <SkeletonPulse height="12px" width="40%" />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Rewards - Action Required */}
      {!loading && pendingRewards.length > 0 && (
        <div style={{ marginBottom: spacing.xxxl }}>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: '#eab308',
            marginBottom: spacing.lg,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
            <AlertCircle size={18} />
            Action Required ({pendingRewards.length})
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? spacing.md : spacing.xl }}>
            {pendingRewards.map(assignment => (
              <RewardCard
                key={assignment.id}
                assignment={assignment}
                isMobile={isMobile}
                onClaim={() => handleStartClaim(assignment)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Active Rewards */}
      {!loading && activeRewards.length > 0 && (
        <div style={{ marginBottom: spacing.xxxl }}>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            marginBottom: spacing.lg,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
            <Gift size={18} style={{ color: colors.gold.primary }} />
            Your Rewards ({activeRewards.length})
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? spacing.md : spacing.xl }}>
            {activeRewards.map(assignment => (
              <RewardCard
                key={assignment.id}
                assignment={assignment}
                isMobile={isMobile}
                addingLinkId={addingLinkId}
                setAddingLinkId={setAddingLinkId}
                newLink={newLink}
                setNewLink={setNewLink}
                onAddLink={() => handleAddLink(assignment.id)}
                onEditLink={(index, updatedLink) => handleEditLink(assignment.id, index, updatedLink)}
                onDeleteLink={(index) => handleDeleteLink(assignment.id, index)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Completed/Expired Rewards */}
      {!loading && completedRewards.length > 0 && (
        <div style={{ marginBottom: spacing.xxxl }}>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.secondary,
            marginBottom: spacing.lg,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
            <Clock size={18} style={{ color: colors.text.muted }} />
            Past Rewards ({completedRewards.length})
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? spacing.md : spacing.xl, opacity: 0.6 }}>
            {completedRewards.map(assignment => (
              <RewardCard
                key={assignment.id}
                assignment={assignment}
                isMobile={isMobile}
              />
            ))}
          </div>
        </div>
      )}

      {/* Visible-Only Rewards (can see but not yet assigned) */}
      {!loading && visibleRewards.length > 0 && (
        <div style={{ marginBottom: spacing.xxxl }}>
          <h3 style={{
            fontSize: typography.fontSize.lg,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.primary,
            marginBottom: spacing.sm,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}>
            <Gift size={18} style={{ color: colors.text.muted }} />
            Coming Soon ({visibleRewards.length})
          </h3>
          <p style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.secondary,
            marginBottom: spacing.lg,
          }}>
            These rewards are available for your competition. Check back soon to claim!
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? spacing.md : spacing.xl }}>
            {visibleRewards.map(assignment => (
              <VisibleRewardCard
                key={assignment.id}
                assignment={assignment}
                isMobile={isMobile}
              />
            ))}
          </div>
        </div>
      )}

      {/* Competition Prizes */}
      {!loading && dedupedPrizes.length > 0 && (
        <div style={{ marginBottom: spacing.xxxl }}>
          {/* Contestant Rewards */}
          {contestantRewards.length > 0 && (
            <div style={{ marginBottom: winnerPrizes.length > 0 ? spacing.xl : 0 }}>
              <h4 style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.md,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
              }}>
                <Gift size={16} style={{ color: colors.gold.primary }} />
                Contestant Rewards
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: isMobile ? spacing.md : spacing.xl,
              }}>
                {contestantRewards.map(prize => (
                  <CompetitionPrizeCard key={prize.id} prize={prize} isMobile={isMobile} />
                ))}
              </div>
            </div>
          )}

          {/* Winner's Prize Package */}
          {winnerPrizes.length > 0 && (
            <div>
              <h4 style={{
                fontSize: typography.fontSize.md,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                marginBottom: spacing.md,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.xs,
              }}>
                <CrownIcon size={20} color={colors.gold.primary} />
                Winner&apos;s Prize Package
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: isMobile ? spacing.md : spacing.xl,
              }}>
                {winnerPrizes.map(prize => (
                  <CompetitionPrizeCard key={prize.id} prize={prize} isMobile={isMobile} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!loading && !hasAnyRewards && (
        <div style={{
          textAlign: 'center',
          padding: spacing.xxxl,
          background: colors.background.card,
          border: `1px solid ${colors.border.primary}`,
          borderRadius: borderRadius.xxl,
        }}>
          <Gift size={64} style={{ color: colors.text.muted, marginBottom: spacing.xl }} />
          <h2 style={{ fontSize: typography.fontSize.xxl, fontWeight: typography.fontWeight.semibold, marginBottom: spacing.md }}>
            No Rewards Yet
          </h2>
          <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.lg, maxWidth: '500px', margin: '0 auto' }}>
            Rewards will appear here when assigned to you by EliteRank
          </p>
        </div>
      )}

      {/* Claim Reward Modal */}
      <ClaimRewardModal
        isOpen={!!claimingAssignment}
        onClose={() => setClaimingAssignment(null)}
        assignment={claimingAssignment}
        userId={user?.id}
        onClaimed={fetchRewards}
      />
    </div>
  );
}

/**
 * RewardCard - Displays a single reward assignment
 * Design matches event card pattern: image-first with overlays
 */
function RewardCard({
  assignment,
  isMobile,
  onClaim,
  addingLinkId,
  setAddingLinkId,
  newLink,
  setNewLink,
  onAddLink,
  onEditLink,
  onDeleteLink,
}) {
  const [editingLinkIndex, setEditingLinkIndex] = useState(null);
  const [editingLinkValue, setEditingLinkValue] = useState('');
  const reward = assignment.reward;
  const statusConfig = STATUS_CONFIG[assignment.status] || STATUS_CONFIG.pending;
  const isPending = assignment.status === 'pending';
  const canAddLinks = ['claimed', 'shipped', 'active'].includes(assignment.status);

  // Calculate days remaining to claim
  const getDaysRemaining = () => {
    if (!assignment.expires_at) return null;
    const now = new Date();
    const expires = new Date(assignment.expires_at);
    const diff = Math.ceil((expires - now) / (1000 * 60 * 60 * 24));
    return diff > 0 ? diff : 0;
  };

  const daysRemaining = isPending ? getDaysRemaining() : null;

  return (
    <div
      style={{
        display: 'block',
        overflow: 'hidden',
        minWidth: 0,
        transition: 'transform 0.2s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      {/* Cover Image */}
      <div style={{
        width: '100%',
        aspectRatio: '3 / 2',
        borderRadius: isMobile ? borderRadius.lg : borderRadius.xl,
        overflow: 'hidden',
        position: 'relative',
        background: reward?.image_url
          ? `url(${reward.image_url}) center/cover no-repeat`
          : 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(139,92,246,0.1) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {!reward?.image_url && <Package size={isMobile ? 32 : 56} style={{ color: 'rgba(212,175,55,0.35)' }} />}

        {/* Bottom gradient fade */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Status badge - bottom left */}
        <div style={{
          position: 'absolute',
          bottom: isMobile ? spacing.sm : spacing.md,
          left: isMobile ? spacing.sm : spacing.md,
          background: statusConfig.color,
          borderRadius: '20px',
          padding: isMobile ? `2px ${spacing.sm}` : `4px ${spacing.md}`,
          fontSize: isMobile ? '10px' : typography.fontSize.xs,
          fontWeight: typography.fontWeight.semibold,
          color: '#000',
          letterSpacing: '0.3px',
        }}>
          {statusConfig.label}
        </div>

        {/* Brand badge - top left */}
        {reward?.brand_name && (
          <div style={{
            position: 'absolute',
            top: isMobile ? spacing.sm : spacing.md,
            left: isMobile ? spacing.sm : spacing.md,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            padding: isMobile ? `2px ${spacing.xs}` : `4px ${spacing.sm}`,
            fontSize: isMobile ? '10px' : typography.fontSize.xs,
            color: colors.gold.primary,
            fontWeight: typography.fontWeight.medium,
            letterSpacing: '0.3px',
            maxWidth: isMobile ? '80%' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {reward.brand_name}
          </div>
        )}

        {/* Cash value badge - bottom right */}
        {reward?.cash_value && (
          <div style={{
            position: 'absolute',
            bottom: isMobile ? spacing.sm : spacing.md,
            right: isMobile ? spacing.sm : spacing.md,
            background: 'rgba(34, 197, 94, 0.9)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            padding: isMobile ? `2px ${spacing.sm}` : `4px ${spacing.md}`,
            fontSize: isMobile ? '10px' : typography.fontSize.xs,
            fontWeight: typography.fontWeight.bold,
            color: '#fff',
          }}>
            ${reward.cash_value}
          </div>
        )}

        {/* Days remaining badge - top right (pending only) */}
        {isPending && daysRemaining !== null && (
          <div style={{
            position: 'absolute',
            top: isMobile ? spacing.sm : spacing.md,
            right: isMobile ? spacing.sm : spacing.md,
            background: daysRemaining <= 2 ? 'rgba(239,68,68,0.85)' : 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            padding: isMobile ? `2px ${spacing.xs}` : `4px ${spacing.sm}`,
            fontSize: isMobile ? '10px' : typography.fontSize.xs,
            fontWeight: typography.fontWeight.semibold,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
          }}>
            <Clock size={isMobile ? 10 : 12} />
            {daysRemaining}d
          </div>
        )}
      </div>

      {/* Card Info */}
      <div style={{ padding: `${isMobile ? spacing.sm : spacing.md} 2px 0` }}>
        <h3 style={{
          fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.md,
          fontWeight: typography.fontWeight.bold,
          color: colors.text.primary,
          marginBottom: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {reward?.name}
        </h3>

        {reward?.description && !isMobile && (
          <p style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.tertiary,
            marginBottom: spacing.xs,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}>
            {reward.description}
          </p>
        )}

        <p style={{
          fontSize: isMobile ? '10px' : typography.fontSize.xs,
          color: colors.text.muted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {assignment.competition?.name || assignment.competition?.city?.name || 'Unknown'}
        </p>

        {/* Pending: Claim Button */}
        {isPending && (
          <div style={{ marginTop: isMobile ? spacing.sm : spacing.md }}>
            <Button
              onClick={onClaim}
              icon={isMobile ? undefined : Gift}
              size={isMobile ? 'sm' : undefined}
              style={{ background: '#eab308', color: '#000', width: '100%', fontSize: isMobile ? '11px' : undefined }}
            >
              Claim
            </Button>
          </div>
        )}

        {/* Active: Show code/link and content links */}
        {canAddLinks && (
          <div style={{ marginTop: isMobile ? spacing.sm : spacing.md }}>
            {/* Discount Code & Tracking Link */}
            {(assignment.discount_code || assignment.tracking_link) && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: isMobile ? spacing.sm : spacing.md,
                marginBottom: isMobile ? spacing.sm : spacing.md,
                padding: isMobile ? spacing.sm : spacing.md,
                background: colors.background.card,
                borderRadius: isMobile ? borderRadius.md : borderRadius.lg,
                border: `1px solid ${colors.border.primary}`,
              }}>
                {assignment.discount_code && (
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: isMobile ? '10px' : typography.fontSize.xs, color: colors.text.muted, marginBottom: '2px' }}>
                      Code
                    </p>
                    <p style={{
                      fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.lg,
                      fontWeight: typography.fontWeight.bold,
                      color: colors.gold.primary,
                      fontFamily: 'monospace',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {assignment.discount_code}
                    </p>
                  </div>
                )}
                {assignment.tracking_link && (
                  <a
                    href={assignment.tracking_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: spacing.xs,
                      fontSize: isMobile ? '11px' : typography.fontSize.sm,
                      color: colors.gold.primary,
                      textDecoration: 'none',
                    }}
                  >
                    <Link2 size={isMobile ? 12 : 14} />
                    Track
                    <ExternalLink size={isMobile ? 10 : 12} />
                  </a>
                )}
              </div>
            )}

            {/* Content Links */}
            <div>
              <p style={{ fontSize: isMobile ? '10px' : typography.fontSize.xs, color: colors.text.muted, marginBottom: spacing.sm }}>
                Content ({assignment.content_links?.length || 0})
              </p>

              {assignment.content_links?.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs, marginBottom: spacing.sm }}>
                  {assignment.content_links.map((link, index) => (
                    editingLinkIndex === index ? (
                      <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: spacing.xs }}>
                        <input
                          type="url"
                          value={editingLinkValue}
                          onChange={(e) => setEditingLinkValue(e.target.value)}
                          style={{
                            width: '100%',
                            padding: isMobile ? `${spacing.xs} ${spacing.sm}` : `${spacing.sm} ${spacing.md}`,
                            background: colors.background.card,
                            border: `1px solid ${colors.gold.primary}`,
                            borderRadius: borderRadius.md,
                            color: colors.text.primary,
                            fontSize: isMobile ? '11px' : typography.fontSize.sm,
                            outline: 'none',
                            boxSizing: 'border-box',
                          }}
                          autoFocus
                        />
                        <div style={{ display: 'flex', gap: spacing.xs }}>
                          <Button
                            size="sm"
                            onClick={() => {
                              onEditLink(index, editingLinkValue);
                              setEditingLinkIndex(null);
                              setEditingLinkValue('');
                            }}
                            disabled={!editingLinkValue.trim()}
                            style={{ flex: 1, fontSize: isMobile ? '11px' : undefined }}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => { setEditingLinkIndex(null); setEditingLinkValue(''); }}
                            style={{ flex: 1, fontSize: isMobile ? '11px' : undefined }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: isMobile ? spacing.xs : spacing.sm,
                          fontSize: isMobile ? '11px' : typography.fontSize.sm,
                          color: colors.text.secondary,
                          padding: isMobile ? `${spacing.xs} ${spacing.sm}` : `${spacing.sm} ${spacing.md}`,
                          background: colors.background.card,
                          borderRadius: borderRadius.md,
                          border: `1px solid ${colors.border.secondary}`,
                        }}
                      >
                        <Check size={isMobile ? 12 : 14} style={{ color: '#22c55e', flexShrink: 0 }} />
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            minWidth: 0, color: colors.text.secondary, textDecoration: 'none',
                          }}
                        >
                          {link}
                        </a>
                        <button
                          onClick={() => { setEditingLinkIndex(index); setEditingLinkValue(link); }}
                          style={{
                            background: 'none', border: 'none', padding: '2px', cursor: 'pointer',
                            color: colors.text.muted, flexShrink: 0, display: 'flex', alignItems: 'center',
                          }}
                          aria-label="Edit link"
                        >
                          <Pencil size={isMobile ? 10 : 12} />
                        </button>
                        <button
                          onClick={() => onDeleteLink(index)}
                          style={{
                            background: 'none', border: 'none', padding: '2px', cursor: 'pointer',
                            color: '#ef4444', flexShrink: 0, display: 'flex', alignItems: 'center',
                          }}
                          aria-label="Delete link"
                        >
                          <Trash2 size={isMobile ? 10 : 12} />
                        </button>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* Add Link Form */}
              {addingLinkId === assignment.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}>
                  <input
                    type="url"
                    placeholder={isMobile ? 'Paste link...' : 'Paste your content link...'}
                    value={newLink}
                    onChange={(e) => setNewLink(e.target.value)}
                    style={{
                      width: '100%',
                      padding: isMobile ? `${spacing.xs} ${spacing.sm}` : `${spacing.sm} ${spacing.md}`,
                      background: colors.background.card,
                      border: `1px solid ${colors.border.primary}`,
                      borderRadius: borderRadius.md,
                      color: colors.text.primary,
                      fontSize: isMobile ? '11px' : typography.fontSize.sm,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', gap: spacing.sm }}>
                    <Button size="sm" onClick={onAddLink} disabled={!newLink.trim()} style={{ flex: 1, fontSize: isMobile ? '11px' : undefined }}>
                      Add
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setAddingLinkId(null)} style={{ flex: 1, fontSize: isMobile ? '11px' : undefined }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  icon={isMobile ? undefined : Plus}
                  onClick={() => { setAddingLinkId(assignment.id); setEditingLinkIndex(null); }}
                  style={{ width: '100%', fontSize: isMobile ? '11px' : undefined }}
                >
                  {isMobile ? '+ Add Link' : 'Add Content Link'}
                </Button>
              )}
            </div>

            {/* Terms Reminder */}
            {reward?.terms && (
              <div style={{
                marginTop: isMobile ? spacing.sm : spacing.md,
                padding: isMobile ? spacing.sm : spacing.md,
                background: 'rgba(234,179,8,0.08)',
                borderRadius: isMobile ? borderRadius.md : borderRadius.lg,
                border: '1px solid rgba(234,179,8,0.15)',
              }}>
                <p style={{ fontSize: isMobile ? '10px' : typography.fontSize.xs, color: '#eab308', fontWeight: typography.fontWeight.medium, marginBottom: spacing.xs }}>
                  Requirements
                </p>
                <p style={{
                  fontSize: isMobile ? '11px' : typography.fontSize.sm,
                  color: colors.text.secondary,
                  lineHeight: 1.4,
                  display: '-webkit-box',
                  WebkitLineClamp: isMobile ? 3 : 10,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                }}>
                  {reward.terms}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * VisibleRewardCard - Displays a visible-only reward (not yet assigned to user)
 * Design matches event card pattern with a muted appearance
 */
function VisibleRewardCard({ assignment, isMobile }) {
  const reward = assignment.reward;

  return (
    <div
      style={{
        display: 'block',
        overflow: 'hidden',
        minWidth: 0,
        opacity: 0.85,
        transition: 'transform 0.2s ease, opacity 0.2s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.opacity = '1'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.opacity = '0.85'; }}
    >
      {/* Cover Image */}
      <div style={{
        width: '100%',
        aspectRatio: '3 / 2',
        borderRadius: isMobile ? borderRadius.lg : borderRadius.xl,
        overflow: 'hidden',
        position: 'relative',
        background: reward?.image_url
          ? `url(${reward.image_url}) center/cover no-repeat`
          : 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(139,92,246,0.1) 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {!reward?.image_url && <Package size={isMobile ? 32 : 56} style={{ color: 'rgba(212,175,55,0.35)' }} />}

        {/* Bottom gradient fade */}
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '50%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)',
          pointerEvents: 'none',
        }} />

        {/* Coming Soon badge - bottom left */}
        <div style={{
          position: 'absolute',
          bottom: isMobile ? spacing.sm : spacing.md,
          left: isMobile ? spacing.sm : spacing.md,
          background: 'rgba(107, 114, 128, 0.85)',
          backdropFilter: 'blur(8px)',
          borderRadius: '20px',
          padding: isMobile ? `2px ${spacing.sm}` : `4px ${spacing.md}`,
          fontSize: isMobile ? '10px' : typography.fontSize.xs,
          fontWeight: typography.fontWeight.semibold,
          color: '#fff',
          letterSpacing: '0.3px',
        }}>
          Coming Soon
        </div>

        {/* Brand badge - top left */}
        {reward?.brand_name && (
          <div style={{
            position: 'absolute',
            top: isMobile ? spacing.sm : spacing.md,
            left: isMobile ? spacing.sm : spacing.md,
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            padding: isMobile ? `2px ${spacing.xs}` : `4px ${spacing.sm}`,
            fontSize: isMobile ? '10px' : typography.fontSize.xs,
            color: colors.gold.primary,
            fontWeight: typography.fontWeight.medium,
            letterSpacing: '0.3px',
            maxWidth: isMobile ? '80%' : 'none',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {reward.brand_name}
          </div>
        )}

        {/* Cash value badge - bottom right */}
        {reward?.cash_value && (
          <div style={{
            position: 'absolute',
            bottom: isMobile ? spacing.sm : spacing.md,
            right: isMobile ? spacing.sm : spacing.md,
            background: 'rgba(34, 197, 94, 0.9)',
            backdropFilter: 'blur(8px)',
            borderRadius: '20px',
            padding: isMobile ? `2px ${spacing.sm}` : `4px ${spacing.md}`,
            fontSize: isMobile ? '10px' : typography.fontSize.xs,
            fontWeight: typography.fontWeight.bold,
            color: '#fff',
          }}>
            ${reward.cash_value}
          </div>
        )}
      </div>

      {/* Card Info */}
      <div style={{ padding: `${isMobile ? spacing.sm : spacing.md} 2px 0` }}>
        <h3 style={{
          fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.md,
          fontWeight: typography.fontWeight.bold,
          color: colors.text.primary,
          marginBottom: '2px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {reward?.name}
        </h3>

        {reward?.description && !isMobile && (
          <p style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.tertiary,
            marginBottom: spacing.xs,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            lineHeight: 1.4,
          }}>
            {reward.description}
          </p>
        )}

        <p style={{
          fontSize: isMobile ? '10px' : typography.fontSize.xs,
          color: colors.text.muted,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {assignment.competition?.name || assignment.competition?.city?.name || 'Unknown'}
        </p>

        {/* Commission Info (if applicable) */}
        {reward?.commission_rate && (
          <div style={{
            marginTop: isMobile ? spacing.sm : spacing.md,
            padding: isMobile ? `${spacing.xs} ${spacing.sm}` : `${spacing.sm} ${spacing.md}`,
            background: 'rgba(139, 92, 246, 0.08)',
            borderRadius: isMobile ? borderRadius.md : borderRadius.lg,
            border: '1px solid rgba(139, 92, 246, 0.15)',
          }}>
            <p style={{ fontSize: isMobile ? '10px' : typography.fontSize.xs, color: '#a78bfa', fontWeight: typography.fontWeight.medium }}>
              {isMobile ? `${reward.commission_rate}% commission` : `Earn up to ${reward.commission_rate}% commission on referrals`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * CompetitionPrizeCard - Displays a competition prize from the competition page
 * Matches the card pattern used by VisibleRewardCard
 */
function CompetitionPrizeCard({ prize, isMobile }) {
  const Wrapper = prize.external_url ? 'a' : 'div';
  const wrapperProps = prize.external_url
    ? { href: prize.external_url, target: '_blank', rel: 'noopener noreferrer', style: { textDecoration: 'none', color: 'inherit' } }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
    >
      <div
        style={{
          display: 'block',
          overflow: 'hidden',
          minWidth: 0,
          transition: 'transform 0.2s ease',
          cursor: prize.external_url ? 'pointer' : 'default',
        }}
        onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.02)'; }}
        onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {/* Cover Image */}
        <div style={{
          width: '100%',
          aspectRatio: '3 / 2',
          borderRadius: isMobile ? borderRadius.lg : borderRadius.xl,
          overflow: 'hidden',
          position: 'relative',
          background: prize.image_url
            ? `url(${prize.image_url}) center/cover no-repeat`
            : `linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.05) 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          {!prize.image_url && <Trophy size={isMobile ? 32 : 56} style={{ color: 'rgba(212,175,55,0.35)' }} />}

          {/* Bottom gradient fade */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '50%',
            background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
            pointerEvents: 'none',
          }} />

          {/* Brand name badge - bottom left */}
          {prize.sponsor_name && (
            <div style={{
              position: 'absolute',
              bottom: isMobile ? spacing.sm : spacing.md,
              left: isMobile ? spacing.sm : spacing.md,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(8px)',
              borderRadius: '20px',
              padding: isMobile ? `2px ${spacing.sm}` : `4px ${spacing.md}`,
              fontSize: isMobile ? '10px' : typography.fontSize.xs,
              color: colors.gold.primary,
              fontWeight: typography.fontWeight.medium,
              letterSpacing: '0.3px',
              maxWidth: isMobile ? '80%' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {prize.sponsor_name}
            </div>
          )}

          {/* Value badge - bottom right */}
          {prize.value && (
            <div style={{
              position: 'absolute',
              bottom: isMobile ? spacing.sm : spacing.md,
              right: isMobile ? spacing.sm : spacing.md,
              background: 'rgba(34, 197, 94, 0.9)',
              backdropFilter: 'blur(8px)',
              borderRadius: '20px',
              padding: isMobile ? `2px ${spacing.sm}` : `4px ${spacing.md}`,
              fontSize: isMobile ? '10px' : typography.fontSize.xs,
              fontWeight: typography.fontWeight.bold,
              color: '#fff',
            }}>
              ${Number(prize.value).toLocaleString()}
            </div>
          )}
        </div>

        {/* Card Info */}
        <div style={{ padding: `${isMobile ? spacing.sm : spacing.md} 2px 0` }}>
          <h3 style={{
            fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.md,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            marginBottom: '2px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {prize.title}
          </h3>

          <PrizeGenderBadge prize={prize} isMobile={isMobile} style={{ marginBottom: spacing.xs }} />


          {prize.description && !isMobile && (
            <p style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.tertiary,
              marginBottom: spacing.xs,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              lineHeight: 1.4,
            }}>
              {prize.description}
            </p>
          )}

          <p style={{
            fontSize: isMobile ? '10px' : typography.fontSize.xs,
            color: colors.text.muted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {prize.competition?.name || prize.competition?.city?.name || ''}
          </p>
        </div>
      </div>
    </Wrapper>
  );
}
