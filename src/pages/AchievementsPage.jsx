/**
 * AchievementsPage - Shows share cards for all competitions the user is in
 * (as a contestant or nominee)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ImagePlus,
  Download,
  Share2,
  Loader,
  Trophy,
  Star,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  X,
} from 'lucide-react';
import AchievementsSkeleton from '../components/skeletons/AchievementsSkeleton';
import EmptyState from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import { useSupabaseAuth } from '../hooks';
import { supabase } from '../lib/supabase';
import { PageHeader } from '../components/ui';
import {
  generateAchievementCard,
  getAdvancementTitle,
  getPlacementTitle,
} from '../features/achievement-cards';
import './AchievementsPage.css';
import { getCompetitionUrl } from '../utils/slugs';

export default function AchievementsPage() {
  const navigate = useNavigate();
  const { user, profile, isAuthenticated } = useSupabaseAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [achievementRecords, setAchievementRecords] = useState([]);
  const [expandedCompetition, setExpandedCompetition] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [shareStatus, setShareStatus] = useState(null);
  const [previewModal, setPreviewModal] = useState({ open: false, record: null, card: null, imageUrl: null, loading: false });

  // Fetch all competitions the user is in (as contestant or nominee)
  const fetchAchievementRecords = useCallback(async () => {
    if (!user?.id && !user?.email) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const contestantSelect = `
        *,
        competition:competitions (
          id,
          name,
          slug,
          city:cities(name),
          season,
          status,
          theme_primary,
          number_of_winners,
          winners_split_by_gender,
          voting_start,
          organization:organizations (
            id,
            name,
            slug,
            logo_url
          ),
          voting_rounds (
            id,
            title,
            start_date,
            round_order,
            contestants_advance,
            round_type
          )
        )
      `;

      const nomineeSelect = `
        id,
        name,
        email,
        avatar_url,
        instagram,
        status,
        user_id,
        converted_to_contestant,
        competition:competitions (
          id,
          name,
          slug,
          city:cities(name),
          season,
          status,
          theme_primary,
          organization:organizations (
            id,
            name,
            slug,
            logo_url
          )
        )
      `;

      // Build separate queries by user_id and email to avoid PostgREST .or()
      // parsing issues with email addresses containing dots.
      // Track contestant vs nominee queries separately for correct deduplication.
      const contestantQueries = [];
      const nomineeQueries = [];

      if (user?.id) {
        contestantQueries.push(
          supabase.from('contestants').select(contestantSelect).eq('user_id', user.id).order('created_at', { ascending: false })
        );
        nomineeQueries.push(
          supabase.from('nominees').select(nomineeSelect).eq('user_id', user.id).not('status', 'in', '("rejected")').order('created_at', { ascending: false })
        );
      }
      if (user?.email) {
        contestantQueries.push(
          supabase.from('contestants').select(contestantSelect).eq('email', user.email).order('created_at', { ascending: false })
        );
        nomineeQueries.push(
          supabase.from('nominees').select(nomineeSelect).eq('email', user.email).not('status', 'in', '("rejected")').order('created_at', { ascending: false })
        );
      }

      const [contestantResults, nomineeResults] = await Promise.all([
        Promise.all(contestantQueries),
        Promise.all(nomineeQueries),
      ]);

      // Merge and deduplicate results by id
      const contestantMap = new Map();
      for (const result of contestantResults) {
        if (result.error) {
          console.error('Error fetching contestant records:', result.error);
          continue;
        }
        for (const row of result.data || []) {
          if (!contestantMap.has(row.id)) contestantMap.set(row.id, row);
        }
      }

      const nomineeMap = new Map();
      for (const result of nomineeResults) {
        if (result.error) {
          console.error('Error fetching nominee records:', result.error);
          continue;
        }
        for (const row of result.data || []) {
          if (!nomineeMap.has(row.id)) nomineeMap.set(row.id, row);
        }
      }

      const contestants = [...contestantMap.values()].filter(c =>
        c.competition &&
        ['publish', 'published', 'live', 'completed'].includes(c.competition.status?.toLowerCase())
      );

      // Track which competition IDs already have contestant records
      const contestantCompetitionIds = new Set(
        contestants.map(c => c.competition?.id).filter(Boolean)
      );

      // Filter nominees: only keep those not already represented as contestants,
      // and not already converted to a contestant
      const nomineeRecords = [...nomineeMap.values()]
        .filter(n =>
          n.competition &&
          ['publish', 'published', 'live', 'completed'].includes(n.competition.status?.toLowerCase()) &&
          !n.converted_to_contestant &&
          !contestantCompetitionIds.has(n.competition?.id)
        )
        .map(n => ({
          ...n,
          _source: 'nominee',
        }));

      // Mark contestant records
      const contestantRecords = contestants.map(c => ({
        ...c,
        _source: 'contestant',
      }));

      const merged = [...contestantRecords, ...nomineeRecords];

      setAchievementRecords(merged);

      // Auto-expand first one if only one
      if (merged.length === 1) {
        setExpandedCompetition(merged[0].competition?.id);
      }
    } catch (err) {
      console.error('Error fetching achievement records:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.email]);

  useEffect(() => {
    fetchAchievementRecords();
  }, [fetchAchievementRecords]);

  // Get available cards for a record
  const getAvailableCards = (record) => {
    const cards = [];

    // Nominee-only records can only show the "Nominated" card
    if (record._source === 'nominee') {
      cards.push({
        type: 'nominated',
        title: 'NOMINATED',
        description: 'Share that you\'ve been nominated!',
        icon: <Sparkles size={20} />,
      });
      return cards;
    }

    // Contestant records
    const status = record.status || 'pending';
    const currentRound = record.current_round || 1;
    const rank = record.rank;
    const votingRounds = record.competition?.voting_rounds || [];

    // Nominated - always available
    cards.push({
      type: 'nominated',
      title: 'NOMINATED',
      description: 'Share that you\'ve been nominated!',
      icon: <Sparkles size={20} />,
    });

    // Contestant - if active
    if (status === 'active' || status === 'winner') {
      cards.push({
        type: 'contestant',
        title: 'COMPETING',
        description: 'Let everyone know you\'re competing',
        icon: <Star size={20} />,
      });
    }

    // Advanced - if past round 1
    if (currentRound > 1 && status === 'active') {
      const advancedToRound = votingRounds.find(r => r.round_order === currentRound);
      const advanceCount = advancedToRound?.contestants_advance;

      if (advanceCount) {
        cards.push({
          type: 'advanced',
          customTitle: getAdvancementTitle(advanceCount),
          title: getAdvancementTitle(advanceCount),
          description: `You made the ${advancedToRound?.title || `Round ${currentRound}`}!`,
          icon: <Trophy size={20} />,
        });
      }
    }

    // Finalist
    const sortedRounds = [...votingRounds].sort((a, b) => (a.round_order || 0) - (b.round_order || 0));
    const finalRound = sortedRounds[sortedRounds.length - 1];
    if (finalRound && currentRound === finalRound.round_order && status === 'active') {
      cards.push({
        type: 'finalist',
        title: 'FINALIST',
        description: 'You\'re in the finals!',
        icon: <Trophy size={20} />,
      });
    }

    // Winner. Key off status, never the global contestants.rank column
    // (host-curated and usually NULL — gating on it dropped the winner card
    // entirely). When winners are split by gender the two champions are
    // co-equal, so there is no "placement": only a non-split competition with
    // a populated rank > 1 shows an ordinal placement card.
    if (status === 'winner') {
      const splitByGender = !!record.competition?.winners_split_by_gender;
      const isPlacement = !splitByGender && !!rank && rank > 1;
      cards.push({
        type: isPlacement ? 'placement' : 'winner',
        customTitle: isPlacement ? getPlacementTitle(rank) : undefined,
        title: isPlacement ? getPlacementTitle(rank) : 'WINNER',
        description: isPlacement
          ? `You placed ${rank}${rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th'}!`
          : 'You won! Share your victory!',
        icon: <Trophy size={20} />,
        rank: isPlacement ? rank : undefined,
      });
    }

    return cards;
  };

  // Build generation params for a record + card option
  const getCardParams = (record, cardOption) => {
    const competition = record.competition;
    const organization = competition?.organization;
    return {
      achievementType: cardOption.type,
      customTitle: cardOption.customTitle,
      name: record.name,
      photoUrl: record.avatar_url || profile?.avatar_url,
      handle: record.instagram,
      competitionName: competition?.name || `Most Eligible ${competition?.city?.name}`,
      cityName: competition?.city?.name,
      season: competition?.season?.toString(),
      organizationName: organization?.name || 'Most Eligible',
      organizationLogoUrl: organization?.logo_url,
      accentColor: competition?.theme_primary || '#d4af37',
      voteUrl: competition?.slug
        ? `eliterank.co${getCompetitionUrl(organization?.slug || 'most-eligible', competition.slug)}`
        : 'eliterank.co',
      rank: cardOption.rank,
      votingStartDate: competition?.voting_start
        || competition?.voting_rounds
          ?.filter(r => r.round_type === 'voting')
          ?.map(r => r.start_date)
          ?.sort()[0]
        || null,
    };
  };

  // Open preview modal and generate card image
  const handleShowCard = async (record, cardOption) => {
    setPreviewModal({ open: true, record, card: cardOption, imageUrl: null, loading: true });
    try {
      const blob = await generateAchievementCard(getCardParams(record, cardOption));
      const url = URL.createObjectURL(blob);
      setPreviewModal(prev => ({ ...prev, imageUrl: url, loading: false }));
    } catch (err) {
      console.error('Card generation failed:', err);
      setPreviewModal(prev => ({ ...prev, loading: false }));
    }
  };

  const closePreview = () => {
    if (previewModal.imageUrl) URL.revokeObjectURL(previewModal.imageUrl);
    setPreviewModal({ open: false, record: null, card: null, imageUrl: null, loading: false });
  };

  // Download from existing preview blob URL, or generate fresh
  const handlePreviewDownload = async () => {
    const { record, card, imageUrl } = previewModal;
    if (!record || !card) return;
    const competition = record.competition;

    setGenerating('preview-download');
    try {
      let blob;
      if (imageUrl) {
        const resp = await fetch(imageUrl);
        blob = await resp.blob();
      } else {
        blob = await generateAchievementCard(getCardParams(record, card));
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${card.type}-${competition?.city?.name || 'card'}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setGenerating(null);
    }
  };

  // Share from existing preview blob URL, or generate fresh
  const handlePreviewShare = async () => {
    const { record, card, imageUrl } = previewModal;
    if (!record || !card) return;
    const competition = record.competition;

    setGenerating('preview-share');
    try {
      let blob;
      if (imageUrl) {
        const resp = await fetch(imageUrl);
        blob = await resp.blob();
      } else {
        blob = await generateAchievementCard(getCardParams(record, card));
      }
      const file = new File([blob], 'share-card.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `I'm ${card.title.toLowerCase()} in ${competition?.name}!`,
        });
        setShareStatus('shared');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${card.type}-${competition?.city?.name || 'card'}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setShareStatus('downloaded');
      }
      setTimeout(() => setShareStatus(null), 2000);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    } finally {
      setGenerating(null);
    }
  };

  // Not logged in
  if (!isAuthenticated) {
    return (
      <div className="achievements-page">
        <div className="achievements-empty">
          <ImagePlus size={48} />
          <h2>Sign in to view your achievements</h2>
          <p>Access your share cards for all competitions you're in</p>
          <button onClick={() => navigate('/login')} className="achievements-btn-primary">
            Sign In
          </button>
        </div>
      </div>
    );
  }

  // Loading
  if (loading) {
    return <AchievementsSkeleton />;
  }

  // Error
  if (error) {
    return (
      <div className="achievements-page">
        <PageHeader title="" />
        <ErrorState
          title="Failed to load achievements"
          message="We couldn't load your achievements. Please try again."
          onRetry={() => { setError(null); fetchAchievementRecords(); }}
        />
      </div>
    );
  }

  // No competitions
  if (achievementRecords.length === 0) {
    return (
      <div className="achievements-page">
        <PageHeader title="" />
        <EmptyState
          icon={<ImagePlus size={32} />}
          title="No achievements yet"
          description="Enter a competition to start earning achievements and share cards"
          ctaLabel="Enter a Competition"
          onCta={() => navigate('/')}
        />
      </div>
    );
  }

  return (
    <div className="achievements-page">
      <PageHeader title="" />

      <div className="achievements-list">
        {achievementRecords.map((record) => {
          const competition = record.competition;
          const isExpanded = expandedCompetition === competition?.id;
          const cards = getAvailableCards(record);
          const isNomineeOnly = record._source === 'nominee';

          return (
            <div key={record.id} className="achievements-competition">
              <button
                className="achievements-competition-header"
                onClick={() => setExpandedCompetition(isExpanded ? null : competition?.id)}
              >
                <div className="achievements-competition-info">
                  <h2>{competition?.name || 'Competition'}</h2>
                  <span className="achievements-competition-meta">
                    {competition?.city?.name} · {competition?.season}
                    {isNomineeOnly && ' · Nominated'}
                    {!isNomineeOnly && record.status === 'active' && ' · Active'}
                    {!isNomineeOnly && record.status === 'winner' && ' · Winner'}
                    {!isNomineeOnly && record.status === 'pending' && ' · Pending'}
                  </span>
                </div>
                {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </button>

              {isExpanded && (
                <div className="achievements-cards">
                  {cards.map((card) => (
                    <button
                      key={card.type}
                      className="achievements-card achievements-card--clickable"
                      onClick={() => handleShowCard(record, card)}
                    >
                      <div className="achievements-card-icon">{card.icon}</div>
                      <div className="achievements-card-info">
                        <h3>{card.title}</h3>
                        <p>{card.description}</p>
                      </div>
                      <span className="achievements-card-view">View</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Card Preview Modal */}
      {previewModal.open && (
        <div className="achievements-preview-overlay" onClick={closePreview}>
          <div className="achievements-preview-modal" onClick={e => e.stopPropagation()}>
            <button className="achievements-preview-close" onClick={closePreview}>
              <X size={20} />
            </button>

            <div className="achievements-preview-card">
              {previewModal.loading ? (
                <div className="achievements-preview-loading">
                  <Loader size={32} className="spinning" />
                  <p>Generating your card...</p>
                </div>
              ) : previewModal.imageUrl ? (
                <img
                  src={previewModal.imageUrl}
                  alt={`${previewModal.card?.title} card`}
                  className="achievements-preview-image"
                />
              ) : (
                <div className="achievements-preview-loading">
                  <p>Failed to generate card</p>
                </div>
              )}
            </div>

            {!previewModal.loading && previewModal.imageUrl && (
              <div className="achievements-preview-actions">
                <button
                  className="achievements-preview-btn"
                  onClick={handlePreviewDownload}
                  disabled={generating === 'preview-download'}
                >
                  {generating === 'preview-download' ? <Loader size={18} className="spinning" /> : <Download size={18} />}
                  <span>Download</span>
                </button>
                <button
                  className="achievements-preview-btn achievements-preview-btn--primary"
                  onClick={handlePreviewShare}
                  disabled={generating === 'preview-share'}
                >
                  {generating === 'preview-share' ? (
                    <Loader size={18} className="spinning" />
                  ) : shareStatus ? (
                    <Check size={18} />
                  ) : (
                    <Share2 size={18} />
                  )}
                  <span>{shareStatus === 'shared' ? 'Shared!' : shareStatus === 'downloaded' ? 'Saved!' : 'Share'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
