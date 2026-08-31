import React, { useState, useEffect } from 'react';
import { Download, Share2, Copy, Check, UserPlus, Send } from 'lucide-react';
import ShareableCard from './ShareableCard';
import { shareOrDownload, copyLink } from '../utils/shareUtils';
import { generateAchievementCard } from '../../achievement-cards/generateAchievementCard';
import { getCompetitionTitle, getCityName } from '../utils/eligibilityEngine';
import { ContestantGuide } from '../../contestant-guide';

/**
 * Card Reveal - Final step showing the generated card with share options
 * For self-entries, shows ContestantGuide after the card reveal before completing.
 */
export default function CardReveal({
  competition,
  submittedData,
  onDone,
  onNominateAnother,
  organizationLogoUrl,
  // Optional: pass these for richer guide content
  votingRounds = [],
  about,
  phase,
  publicBasePath,
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const title = getCompetitionTitle(competition);
  const cityName = getCityName(competition);
  const season = competition?.season;
  const accentColor = competition?.theme_primary || '#d4af37';
  const voteUrl = publicBasePath ? `eliterank.co${publicBasePath}` : 'eliterank.co';

  // Trigger reveal animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setRevealed(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const cardParams = {
    achievementType: 'nominated',
    name: submittedData.name,
    photoUrl: submittedData.photoUrl,
    handle: submittedData.handle,
    competitionName: title,
    cityName,
    season: String(season || ''),
    accentColor,
    organizationLogoUrl,
    voteUrl,
    votingStartDate: competition?.voting_start,
  };

  const handleShare = async () => {
    setIsGenerating(true);
    try {
      const blob = await generateAchievementCard(cardParams);
      const shareText = isThirdParty
        ? "You've been nominated on EliteRank!"
        : "I've been nominated on EliteRank!";
      await shareOrDownload(blob, `eliterank-${submittedData.name?.toLowerCase().replace(/\s+/g, '-')}.png`, { text: shareText });
    } catch (err) {
      console.error('Share failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    try {
      const blob = await generateAchievementCard(cardParams);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `eliterank-${submittedData.name?.toLowerCase().replace(/\s+/g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}${window.location.pathname.replace('/enter', '')}?apply=true`;
    const success = await copyLink(url);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isThirdParty = submittedData.isNomination;
  const isAnonymous = submittedData.nominatorAnonymous;
  const isSelfEntry = !isThirdParty;

  // For self-entries: show guide before completing
  const handleDoneClick = () => {
    if (isSelfEntry && !showGuide) {
      setShowGuide(true);
    } else {
      onDone?.();
    }
  };

  // Guide completed - finish the flow
  const handleGuideComplete = () => {
    onDone?.();
  };

  // If showing guide, render it instead of the card reveal
  if (showGuide) {
    return (
      <ContestantGuide
        competition={competition}
        votingRounds={votingRounds}
        about={about}
        phase={phase}
        mode="splash"
        onComplete={handleGuideComplete}
      />
    );
  }

  return (
    <div className={`entry-step entry-step-card ${revealed ? 'revealed' : ''}`}>
      <div className="entry-card-reveal-header">
        <h2 className="entry-step-title">Nominated!</h2>
        <p className="entry-step-subtitle">
          {isThirdParty
            ? `You nominated ${submittedData.name} for ${title}`
            : `You've been nominated for ${title}`}
        </p>
      </div>

      {/* Card preview */}
      <div className="entry-card-preview-wrap">
        <ShareableCard
          name={submittedData.name}
          photoUrl={submittedData.photoUrl}
          handle={submittedData.handle}
          competitionTitle={title}
          cityName={cityName}
          season={season}
          accentColor={accentColor}
          organizationLogoUrl={organizationLogoUrl}
          voteUrl={voteUrl}
          votingStartDate={competition?.voting_start}
        />
      </div>

      {/* Share actions */}
      <div className="entry-share-actions">
        {isThirdParty && !isAnonymous ? (
          <>
            {/* Third-party non-anonymous: share with nominee */}
            <button
              className="entry-btn-primary"
              onClick={handleShare}
              disabled={isGenerating}
            >
              <Send size={18} />
              {isGenerating ? 'Generating...' : 'Share with Nominee'}
            </button>

            <button
              className="entry-btn-primary entry-btn-outline"
              onClick={onNominateAnother}
            >
              <UserPlus size={18} />
              Nominate Another
            </button>

            <button className="entry-btn-done" onClick={handleDoneClick}>
              I'm Done
            </button>
          </>
        ) : (
          <>
            {/* Self-entry or anonymous nomination: standard share flow */}
            <button
              className="entry-btn-primary"
              onClick={handleShare}
              disabled={isGenerating}
            >
              <Share2 size={18} />
              {isGenerating ? 'Generating...' : 'Share'}
            </button>

            <div className="entry-share-row">
              <button
                className="entry-btn-secondary"
                onClick={handleDownload}
                disabled={isGenerating}
              >
                <Download size={16} />
                Download
              </button>
            </div>

            <button className="entry-btn-done" onClick={handleDoneClick}>
              {isSelfEntry ? 'Continue' : 'Done'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
