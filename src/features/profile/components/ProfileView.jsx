import React, { useState, useEffect, useCallback } from 'react';
import { Edit, MapPin, FileText, Camera, Globe, Share2, Check, Instagram, Linkedin, Link as LinkIcon, Download, Loader, Users, Play, ChevronLeft, ChevronRight } from 'lucide-react';
import { Panel, Button } from '../../../components/ui';
import { colors, spacing, borderRadius, typography, gradients, transitions } from '../../../styles/theme';
import { getContestantCompetitions, getNominationsForUser } from '../../../lib/competition-history';
import { generateAchievementCard } from '../../achievement-cards/generateAchievementCard';
import { useResponsive } from '../../../hooks/useResponsive';
import { useSupabaseAuth } from '../../../hooks';
import { supabase } from '../../../lib/supabase';
import ProfileCompetitions from './ProfileCompetitions';
import ProfileBonusVotes from './ProfileBonusVotes';
import FanButton from '../../../components/ui/FanButton';
import ProfileFans from './ProfileFans';
import IntroVideoModal from '../../../components/modals/IntroVideoModal';
import { transformSupabaseImage, avatarUrl } from '../../../lib/storageImage';

/**
 * Click-through photo gallery. One image at a time with prev/next arrows and
 * dot indicators — purely manual navigation, no auto-rotation. Mirrors the
 * prize carousel UX on the nomination page.
 */
function GalleryCarousel({ images, isMobile }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hovered, setHovered] = useState(null); // 'left' | 'right' | null

  const total = images.length;

  const goTo = useCallback((index) => {
    setCurrentIndex(((index % total) + total) % total);
  }, [total]);

  const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
  const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

  const arrowBase = {
    position: 'absolute',
    top: '50%',
    transform: 'translateY(-50%)',
    zIndex: 2,
    width: 40,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `1px solid ${colors.border.secondary}`,
    borderRadius: borderRadius.full,
    background: 'rgba(0, 0, 0, 0.55)',
    cursor: 'pointer',
    transition: transitions.all,
    padding: 0,
  };

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.background.secondary,
          borderRadius: borderRadius.lg,
          overflow: 'hidden',
        }}
      >
        {total > 1 && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous photo"
            onMouseEnter={() => setHovered('left')}
            onMouseLeave={() => setHovered(null)}
            style={{
              ...arrowBase,
              left: spacing.md,
              color: hovered === 'left' ? colors.gold.primary : colors.text.primary,
              borderColor: hovered === 'left' ? colors.gold.primary : colors.border.secondary,
            }}
          >
            <ChevronLeft size={22} />
          </button>
        )}

        <img
          src={transformSupabaseImage(images[currentIndex], { width: 1080, resize: 'contain' })}
          alt={`Gallery ${currentIndex + 1}`}
          loading="lazy"
          decoding="async"
          style={{
            display: 'block',
            width: '100%',
            maxHeight: isMobile ? '60vh' : 520,
            objectFit: 'contain',
          }}
        />

        {total > 1 && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next photo"
            onMouseEnter={() => setHovered('right')}
            onMouseLeave={() => setHovered(null)}
            style={{
              ...arrowBase,
              right: spacing.md,
              color: hovered === 'right' ? colors.gold.primary : colors.text.primary,
              borderColor: hovered === 'right' ? colors.gold.primary : colors.border.secondary,
            }}
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      {total > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: spacing.sm,
          marginTop: spacing.md,
        }}>
          {images.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to photo ${i + 1}`}
              style={{
                width: 8,
                height: 8,
                padding: 0,
                border: 'none',
                borderRadius: borderRadius.full,
                cursor: 'pointer',
                background: i === currentIndex ? colors.gold.primary : 'rgba(255, 255, 255, 0.15)',
                transform: i === currentIndex ? 'scale(1.3)' : 'none',
                transition: transitions.all,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ProfileView({ hostProfile, onEdit, contestantId, isPreview = false }) {
  const { isMobile, isSmall } = useResponsive();
  const { user } = useSupabaseAuth();
  const [copied, setCopied] = useState(false);
  const [cardInfo, setCardInfo] = useState(null);
  const [generatingCard, setGeneratingCard] = useState(false);
  const [introVideoOpen, setIntroVideoOpen] = useState(false);

  // When a logged-in user views their own contestant profile (either the
  // /profile edit view or the public /profile/:id route), swap "Become a
  // Fan" for a "View My Fans" button that opens the fan list modal.
  const isOwnContestant = !!(user?.id && hostProfile?.id && user.id === hostProfile.id && contestantId);

  useEffect(() => {
    if (!hostProfile?.id) return;

    // Fetch competition data for card generation
    Promise.all([
      getContestantCompetitions(hostProfile.id),
      getNominationsForUser(hostProfile.id, hostProfile.email),
    ]).then(([contestants, nominations]) => {
      // Eliminated contestants keep their card — it becomes a record of how
      // far they got. Title reflects whichever tier they reached (e.g.
      // "TOP 50 CONTESTANT" for someone eliminated in Round 1 after
      // surviving Entry Round). Prefer a non-eliminated entry when one
      // exists so an active competition takes precedence over a past one.
      const activeContestant = contestants.find((c) => c.status !== 'eliminated');
      const contestantEntry = activeContestant || contestants[0];
      const entry = contestantEntry || nominations[0];
      if (!entry) return;
      const comp = entry.competition || entry;
      const org = comp?.organization;
      const city = comp?.city?.name || comp?.city || '';
      const role = contestantEntry ? 'contestant' : 'nominee';
      const cardType = entry.status === 'winner' ? 'winner' : (role === 'contestant' ? 'contestant' : 'nominated');

      // Compute the tier this contestant has secured. Active contestants
      // get credit for the most recently completed round; eliminated
      // contestants get credit for whichever round they survived through
      // (eliminated_in_round - 1). Falls back to the default "CONTESTANT"
      // badge when the tier is undefined (e.g. eliminated in the very
      // first round, or no rounds have ended yet).
      let customTitle;
      if (cardType === 'contestant') {
        const rounds = comp?.voting_rounds || [];
        let tierRound;
        if (entry.status === 'eliminated' && entry.eliminated_in_round) {
          tierRound = rounds.find((r) => r.round_order === entry.eliminated_in_round - 1);
        } else {
          const now = Date.now();
          const completed = rounds
            .filter((r) => r.end_date && new Date(r.end_date).getTime() <= now)
            .sort((a, b) => (b.round_order || 0) - (a.round_order || 0));
          tierRound = completed[0];
        }
        const tierCount = tierRound?.contestants_advance;
        if (Number.isFinite(tierCount) && tierCount > 0) {
          customTitle = `TOP ${tierCount} CONTESTANT`;
        }
      }

      setCardInfo({
        type: cardType,
        customTitle,
        competitionName: comp?.name,
        cityName: city,
        season: comp?.season?.toString(),
        orgName: org?.name || 'Most Eligible',
        orgLogoUrl: org?.logo_url,
        slug: comp?.slug,
      });
    }).catch(console.error);
  }, [hostProfile?.id, hostProfile?.email]);

  const handleShare = async () => {
    if (!hostProfile?.id) return; // Profile not loaded yet
    const baseUrl = window.location.origin;
    const url = `${baseUrl}/profile/${hostProfile.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownloadCard = async () => {
    if (!cardInfo || generatingCard) return;
    setGeneratingCard(true);
    try {
      const blob = await generateAchievementCard({
        achievementType: cardInfo.type,
        customTitle: cardInfo.customTitle,
        name: `${hostProfile.firstName || ''} ${hostProfile.lastName || ''}`.trim() || 'Contestant',
        photoUrl: hostProfile.avatarUrl,
        competitionName: cardInfo.competitionName,
        cityName: cardInfo.cityName,
        season: cardInfo.season,
        organizationName: cardInfo.orgName,
        organizationLogoUrl: cardInfo.orgLogoUrl,
        voteUrl: cardInfo.slug ? `eliterank.co/${cardInfo.slug}` : 'eliterank.co',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${cardInfo.type}-card.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Card generation failed:', err);
    } finally {
      setGeneratingCard(false);
    }
  };

  if (!hostProfile) return null;

  const initials = `${(hostProfile.firstName || '?')[0]}${(hostProfile.lastName || '?')[0]}`;
  const gallery = hostProfile.gallery || [];

  const TikTokIcon = ({ size = 16, style }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.1a8.16 8.16 0 0 0 4.76 1.52v-3.4c-.83 0-1.63-.18-2.36-.53h-.01l.01.01z"/>
    </svg>
  );

  const socialLinks = [
    { platform: 'Instagram', handle: hostProfile.instagram, Icon: Instagram, gradient: 'linear-gradient(135deg, #833AB4, #FD1D1D, #FCAF45)', url: hostProfile.instagram ? `https://instagram.com/${hostProfile.instagram.replace('@', '')}` : null },
    { platform: 'TikTok', handle: hostProfile.tiktok, Icon: TikTokIcon, gradient: 'linear-gradient(135deg, #00f2ea, #ff0050)', url: hostProfile.tiktok ? `https://tiktok.com/@${hostProfile.tiktok.replace('@', '')}` : null },
    { platform: 'LinkedIn', handle: hostProfile.linkedin, Icon: Linkedin, background: '#0A66C2', url: hostProfile.linkedin ? `https://linkedin.com/in/${hostProfile.linkedin}` : null },
    ...(hostProfile.website ? [{ platform: 'Link', handle: hostProfile.website.replace(/^https?:\/\//, ''), Icon: LinkIcon, background: '#52525b', url: hostProfile.website.startsWith('http') ? hostProfile.website : `https://${hostProfile.website}` }] : []),
  ].filter(link => link.handle);

  const sectionPadding = isMobile ? spacing.lg : spacing.xxl;
  const dividerStyle = { borderTop: `1px solid ${colors.border.secondary}`, margin: `0 ${sectionPadding}` };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
      <Panel style={{ marginBottom: spacing.xl }}>
        {/* Hero Section */}
        <div style={{ position: 'relative', padding: isMobile ? spacing.sm : spacing.lg, paddingBottom: 0 }}>
          <div style={{ position: 'absolute', top: isMobile ? spacing.sm : spacing.lg, left: isMobile ? spacing.sm : spacing.lg, zIndex: 2, display: 'flex', gap: spacing.sm }}>
            <Button
              onClick={handleShare}
              icon={copied ? Check : Share2}
              size={isMobile ? 'sm' : 'md'}
              style={{
                background: copied ? 'rgba(34,197,94,0.8)' : 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)',
                minWidth: isMobile ? 'auto' : '100px',
              }}
            >
              {copied ? 'Copied!' : 'Share'}
            </Button>
            {onEdit && cardInfo && (
              <Button
                onClick={handleDownloadCard}
                icon={generatingCard ? Loader : Download}
                size={isMobile ? 'sm' : 'md'}
                disabled={generatingCard}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {generatingCard ? '' : 'Card'}
              </Button>
            )}
          </div>
          {onEdit && (
            <div style={{ position: 'absolute', top: isMobile ? spacing.sm : spacing.lg, right: isMobile ? spacing.sm : spacing.lg, zIndex: 2 }}>
              <Button
                onClick={onEdit}
                icon={Edit}
                size={isMobile ? 'sm' : 'md'}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  backdropFilter: 'blur(8px)',
                  color: '#fff',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                {isMobile ? 'Edit' : 'Edit Profile'}
              </Button>
            </div>
          )}
        </div>
        <div style={{ padding: isMobile ? `${spacing.xxl} ${spacing.lg} ${spacing.lg}` : `${spacing.xxxl} ${spacing.xxxl} ${spacing.xxxl}` }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: spacing.md }}>
            <div
              style={{
                position: 'relative',
                width: isMobile ? '140px' : '150px',
                height: isMobile ? '140px' : '150px',
                borderRadius: borderRadius.xxl,
                background: hostProfile.avatarUrl
                  ? `url(${avatarUrl(hostProfile.avatarUrl, 150)}) center/cover`
                  : 'linear-gradient(135deg, rgba(212,175,55,0.4), rgba(212,175,55,0.1))',
                border: `3px solid rgba(212,175,55,0.3)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isMobile ? '42px' : '48px',
                fontWeight: typography.fontWeight.semibold,
                color: colors.gold.primary,
                flexShrink: 0,
              }}
            >
              {!hostProfile.avatarUrl && initials}
              {hostProfile.introVideoUrl && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setIntroVideoOpen(true); }}
                  aria-label="Play intro video"
                  title="Play intro video"
                  style={{
                    position: 'absolute',
                    bottom: '-4px',
                    right: '-4px',
                    width: '44px',
                    height: '44px',
                    borderRadius: borderRadius.full,
                    background: gradients.gold,
                    border: `3px solid ${colors.background.primary}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    padding: 0,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                  }}
                >
                  <Play size={18} style={{ color: '#0a0a0c', fill: '#0a0a0c', marginLeft: '2px' }} />
                </button>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
              <h1 style={{
                fontSize: isMobile ? typography.fontSize.xxl : typography.fontSize.xxl,
                fontWeight: typography.fontWeight.bold,
                color: '#fff',
                wordBreak: 'break-word',
              }}>
                {hostProfile.firstName} {hostProfile.lastName}
              </h1>
              {hostProfile.city && (
                <p style={{
                  color: colors.text.secondary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: spacing.sm,
                  marginTop: spacing.sm,
                  fontSize: isMobile ? typography.fontSize.md : typography.fontSize.lg
                }}>
                  <MapPin size={isMobile ? 16 : 18} /> {hostProfile.city}{hostProfile.age ? `, ${hostProfile.age}` : ''}
                </p>
              )}
              {hostProfile.headline && (
                <p style={{
                  color: colors.text.muted,
                  textAlign: 'center',
                  marginTop: spacing.sm,
                  fontSize: typography.fontSize.sm,
                  fontStyle: 'italic',
                }}>
                  {hostProfile.headline}
                </p>
              )}
              {/* Per-competition vote totals now live on each competition
                  card (ProfileCompetitions) rather than as a single aggregate
                  pill here, so the number always reads in the context of the
                  competition it belongs to. */}
              {/* Fan affordance below the name.
                  - On someone else's profile: "Become a Fan" (FanButton)
                  - On your own profile (viewing /profile/:yourId or /profile):
                    "View My Fans" button that scrolls to the fan list */}
              {contestantId && !onEdit && !isOwnContestant && (
                <div style={{ marginTop: spacing.md }}>
                  <FanButton
                    contestantId={contestantId}
                    contestantName={`${hostProfile?.firstName || ''} ${hostProfile?.lastName || ''}`.trim()}
                    onLoginRequired={(returnTo) => {
                      const target = returnTo || window.location.pathname;
                      window.location.href = `/login?returnTo=${encodeURIComponent(target)}`;
                    }}
                  />
                </div>
              )}
              {contestantId && isOwnContestant && (
                <div style={{ marginTop: spacing.md }}>
                  <ViewMyFansButton contestantId={contestantId} />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Competitions */}
        <ProfileCompetitions
          userId={hostProfile?.id}
          userEmail={hostProfile?.email}
          user={{ id: hostProfile?.id, email: hostProfile?.email }}
          isOwnProfile={!!onEdit}
          isPreview={isPreview}
          profile={{
            first_name: hostProfile?.firstName,
            last_name: hostProfile?.lastName,
            avatar_url: hostProfile?.avatarUrl,
            bio: hostProfile?.bio,
            city: hostProfile?.city,
          }}
        />

        {/* About */}
        {hostProfile.bio && (
          <>
            <div style={dividerStyle} />
            <div style={{ padding: `${sectionPadding} ${isMobile ? spacing.xxl : spacing.xxxl}` }}>
              <p style={{
                color: colors.text.secondary,
                fontSize: isMobile ? typography.fontSize.sm : typography.fontSize.md,
                lineHeight: '1.7',
              }}>
                {hostProfile.bio}
              </p>
            </div>
          </>
        )}


        {/* Photo Gallery */}
        {gallery.length > 0 && (
          <>
            <div style={dividerStyle} />
            <div style={{ padding: sectionPadding }}>
              <h3 style={{
                fontSize: isMobile ? typography.fontSize.lg : typography.fontSize.xl,
                fontWeight: typography.fontWeight.semibold,
                marginBottom: spacing.lg,
                display: 'flex',
                alignItems: 'center',
                gap: spacing.md
              }}>
                <Camera size={isMobile ? 18 : 20} style={{ color: colors.gold.primary }} /> Gallery
              </h3>
              <GalleryCarousel images={gallery.filter(Boolean)} isMobile={isMobile} />
            </div>
          </>
        )}

        {/* Bonus Votes + Video Prompts - only for own profile */}
        {onEdit && hostProfile?.id && (
          <div style={{ padding: `0 ${sectionPadding} ${spacing.md}` }}>
            <ProfileBonusVotes userId={hostProfile.id} userEmail={hostProfile.email} profile={hostProfile} />
          </div>
        )}

        {/* Social Links Footer */}
        {socialLinks.length > 0 && (
          <>
            <div style={dividerStyle} />
            <div style={{
              padding: `${spacing.lg} ${sectionPadding}`,
              display: 'flex',
              justifyContent: 'center',
              gap: spacing.md,
            }}>
              {socialLinks.map((link) => (
                <a
                  key={link.platform}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`${link.platform}: ${link.handle}`}
                  style={{
                    width: '40px',
                    height: '40px',
                    background: link.gradient || link.background,
                    borderRadius: borderRadius.full,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    textDecoration: 'none',
                  }}
                >
                  <link.Icon size={18} />
                </a>
              ))}
            </div>
          </>
        )}

      </Panel>

      <IntroVideoModal
        isOpen={introVideoOpen}
        onClose={() => setIntroVideoOpen(false)}
        videoUrl={hostProfile.introVideoUrl}
        posterUrl={hostProfile.avatarUrl}
      />
    </div>
  );
}

/**
 * "View My Fans" button — only rendered on a contestant's own profile.
 * Shows the current fan count and opens the fan list modal on click.
 */
function ViewMyFansButton({ contestantId }) {
  const [count, setCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!contestantId || !supabase) return;
    let cancelled = false;
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from('contestant_fans')
        .select('*', { count: 'exact', head: true })
        .eq('contestant_id', contestantId);
      if (cancelled) return;
      setCount(c || 0);
    };
    fetchCount();
    return () => { cancelled = true; };
  }, [contestantId]);

  return (
    <>
      <button
        onClick={() => setModalOpen(true)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: spacing.xs,
          padding: `${spacing.xs} ${spacing.md}`,
          background: 'rgba(212,175,55,0.15)',
          border: '1px solid rgba(212,175,55,0.3)',
          borderRadius: borderRadius.pill,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
          color: colors.gold.primary,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
      >
        <Users size={14} />
        View My Fans
        <span style={{
          marginLeft: '2px',
          fontSize: typography.fontSize.xs,
          opacity: 0.7,
        }}>
          {count.toLocaleString()}
        </span>
      </button>
      <ProfileFans
        contestantId={contestantId}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
