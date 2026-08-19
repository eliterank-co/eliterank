import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Heart, Loader, Check, Mail, TrendingUp, ArrowRight, Sparkles } from 'lucide-react';
import { colors, spacing, borderRadius, typography, gradients } from '../../../styles/theme';
import { VoteShareCard, Modal } from '../../../components/ui';
import { useSupabaseAuth, useLeaderboard, useFingerprint } from '../../../hooks';
import { useToast } from '../../../contexts/ToastContext';
import {
  hasUsedFreeVoteToday,
  submitFreeVote,
  submitAnonymousVote,
  createVotePaymentIntent,
} from '../../../lib/votes';
import { isDoubleVoteDayForCompetition } from '../../../lib/doubleVoteDay';
import {
  readAnonVoted,
  writeAnonVoted,
  getAnonVoteResetMs,
  formatResetIn,
} from '../../../lib/anonVoteLock';
import { calculateVotePrice } from '../../../types/competition';
import { getStripe, isStripeConfigured } from '../../../lib/stripe';
import VoteModal from '../../public-site/components/VoteModal';

const VOTE_PRESETS = [25, 100, 250];

// Show cents when a bundled total is fractional ($9.90) but keep round
// totals tidy ($10).
const priceFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const formatPrice = (amount) => priceFormatter.format(amount);

// Match the rest of the money on the card: "$21" for round, "$21.25" otherwise.
const totalFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * CompetitionCardVoting
 *
 * Inline voting panel rendered on a contestant's public profile. Paid
 * purchase is the primary CTA (three large tile presets + custom amount
 * + rank projection). Free daily vote is demoted to a small link at the
 * bottom.
 *
 * - Logged-in free vote: single click, uses submitFreeVote directly.
 * - Logged-out free vote: click expands an inline email+name form,
 *   routed through /api/cast-anonymous-vote (bot + rate-limit protected).
 * - Any paid vote CTA opens the existing VoteModal preloaded with the
 *   selected vote count, which handles Stripe checkout.
 * - In preview mode (host previewing voting phase), mutations are
 *   short-circuited with a "no vote was cast" toast.
 */
export default function CompetitionCardVoting({
  contestant,
  competition,
  currentRound,
  isPreview = false,
  // Optional — when the parent card already pulls the leaderboard for its
  // stats row, it can pass the same snapshot in so we don't double-fetch.
  leaderboard: leaderboardProp,
  // Optional — parent's hook to force-refresh the leaderboard after a
  // successful vote. Complements the realtime subscription so the count
  // also updates immediately on the voter's own screen when the socket
  // is throttled (background tab, reconnect).
  onVoteCast,
}) {
  const { user } = useSupabaseAuth();
  const toast = useToast();
  const { fingerprint } = useFingerprint();
  const competitionId = competition?.id;
  const contestantId = contestant?.id;
  const contestantName = contestant?.name || 'this contestant';
  const firstName = contestantName.split(' ')[0];
  const pricePerVote = Number(competition?.price_per_vote) || 1;
  const useBundler = !!competition?.use_price_bundler;

  const [selectedCount, setSelectedCount] = useState('');
  const [busy, setBusy] = useState(false);
  const [castSuccess, setCastSuccess] = useState(false);
  const [alreadyVoted, setAlreadyVoted] = useState(false);
  const [showFreeForm, setShowFreeForm] = useState(false);
  const [showVoteModal, setShowVoteModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  // True when today is a host-scheduled double-vote day for this competition.
  // Drives the modal's 2× indicator + receipt copy. The free-vote handler
  // refetches on click for freshness; this state exists for the paid-vote
  // modal which renders before any user interaction.
  const [isDoubleVoteDay, setIsDoubleVoteDay] = useState(false);
  // Pre-created PaymentIntent kicked off in the Send click handler so the
  // edge-function round-trip runs in parallel with the modal mounting.
  const [preloadedCheckout, setPreloadedCheckout] = useState({
    clientSecret: null,
    paymentIntentId: null,
    connectedAccountId: null,
    voteCount: null,
    // Server-authoritative charge amount in cents. Until this is set, any
    // displayed price is just a client-side estimate against possibly-stale
    // competition.price_per_vote. Once set, all downstream prices must come
    // from here so what the user sees matches what Stripe charges.
    amount: null,
  });
  const checkoutRequestRef = useRef(0);

  // Logged-out form state
  const [email, setEmail] = useState('');
  const [firstFormName, setFirstFormName] = useState('');
  const [lastFormName, setLastFormName] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [error, setError] = useState('');
  const mountedAtRef = useRef(Date.now());

  // Pull the current leaderboard snapshot so we can project what rank this
  // contestant would sit at after the purchase lands. If the parent passed
  // one in (parent card's stats row uses the same data), skip the fetch.
  // realtime:false — the projection is advisory, doesn't need live updates.
  const internalLeaderboard = useLeaderboard(
    leaderboardProp ? null : competitionId,
    { realtime: false },
  );
  const leaderboard = leaderboardProp || internalLeaderboard.contestants;

  useEffect(() => {
    if (!competitionId) return;
    // Anonymous voters: restore the per-device "already voted today" flag from
    // localStorage so we don't show the form to someone who'll just be
    // bounced by the fingerprint check on submit.
    if (!user?.id) {
      if (readAnonVoted(competitionId)) {
        setAlreadyVoted(true);
        setShowFreeForm(false);
      }
      return;
    }
    let cancelled = false;
    hasUsedFreeVoteToday(user.id, competitionId).then((used) => {
      if (!cancelled) setAlreadyVoted(!!used);
    });
    return () => { cancelled = true; };
  }, [user?.id, competitionId]);

  // Warm Stripe.js in the background so the checkout modal feels instant
  // when the user hits Send. Swallow failures — ad-blockers and flaky
  // networks shouldn't surface as unhandled rejections during warmup; the
  // real load attempt happens when the user opens the payment modal.
  useEffect(() => {
    if (isStripeConfigured()) {
      getStripe()?.catch(() => {});
    }
  }, []);

  // Resolve double-vote-day status once per competition so the modal can
  // surface the 2× indicator on open. The free-vote handler still fetches
  // fresh on click — this state is for render-time consumers only.
  useEffect(() => {
    if (!competitionId) return;
    let cancelled = false;
    isDoubleVoteDayForCompetition(competitionId).then((flag) => {
      if (!cancelled) setIsDoubleVoteDay(!!flag);
    });
    return () => { cancelled = true; };
  }, [competitionId]);

  const roundForModal = useMemo(() => {
    if (!currentRound) return null;
    return { ...currentRound, isActive: true };
  }, [currentRound]);

  const stopPropagation = (e) => { e.stopPropagation(); };

  // Current + projected rank for the "Moves X up N spots" preview.
  // Filters to active contestants only so this matches the rank shown
  // in the stat card (ProfileCompetitions.jsx rankStats).
  const rankProjection = useMemo(() => {
    const addedVotes = Number(selectedCount) || 0;
    if (!leaderboard?.length || !contestantId || addedVotes < 1) return null;

    // When the competition splits winners by gender, project the rank within
    // the contestant's own gender bucket — matching the public leaderboard and
    // finalize_voting_round. Gender is read off the leaderboard row so we
    // don't depend on the caller threading it through the `contestant` prop.
    const splitByGender = !!competition?.winners_split_by_gender;
    const me = leaderboard.find((c) => c.id === contestantId);
    const myGender = me?.gender ?? null;

    let active = leaderboard.filter((c) => c.status === 'active');
    if (splitByGender) active = active.filter((c) => c.gender === myGender);

    // Current rank: sort by votes desc, find this contestant's slot.
    const byVotes = [...active].sort(
      (a, b) => (b.votes || 0) - (a.votes || 0)
    );
    const currentIndex = byVotes.findIndex((c) => c.id === contestantId);
    if (currentIndex === -1) return null;

    // Projected rank: same sort, but with addedVotes applied to this
    // contestant only.
    const projected = active.map((c) =>
      c.id === contestantId
        ? { ...c, votes: (c.votes || 0) + addedVotes }
        : c
    );
    const sorted = projected.sort((a, b) => (b.votes || 0) - (a.votes || 0));
    const projectedIndex = sorted.findIndex((c) => c.id === contestantId);

    return {
      current: currentIndex + 1,
      projected: projectedIndex + 1,
      delta: currentIndex - projectedIndex,
    };
  }, [leaderboard, contestantId, selectedCount, competition?.winners_split_by_gender]);

  const handleTileClick = (count) => (e) => {
    e.stopPropagation();
    setSelectedCount(count);
  };

  const openBuyVotes = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (isPreview) {
      toast?.info?.('Preview mode — no payment was initiated.');
      return;
    }
    const voteCount = Number(selectedCount);
    if (!voteCount || voteCount < 1) return;

    // Open the modal immediately (user sees progress instantly) and fire
    // the PaymentIntent creation in parallel. When it resolves we push
    // clientSecret into the modal via a prop, skipping the modal's own
    // round-trip.
    const requestId = ++checkoutRequestRef.current;
    setPreloadedCheckout({ clientSecret: null, paymentIntentId: null, voteCount, amount: null });
    setShowVoteModal(true);

    const result = await createVotePaymentIntent({
      competitionId,
      contestantId,
      voteCount,
      voterEmail: user?.email,
    });

    // If the modal was closed (or another Send was clicked) while this
    // request was in flight, abandon the result.
    if (requestId !== checkoutRequestRef.current) return;

    if (result.success && result.clientSecret) {
      setPreloadedCheckout({
        clientSecret: result.clientSecret,
        paymentIntentId: result.paymentIntentId,
        connectedAccountId: result.connectedAccountId ?? null,
        voteCount,
        amount: result.amount ?? null,
        subtotal: result.subtotal ?? null,
        taxAmount: result.taxAmount ?? null,
        taxRatePct: result.taxRatePct ?? null,
        taxLabel: result.taxLabel ?? null,
        // Settlement currency (usd | cad) so the modal formats + adapts the
        // checkout (CA$ display, no billing-country field) for CAD even in this
        // pre-created-PaymentIntent flow, where the modal doesn't run its own
        // create-payment-intent call.
        currency: result.currency ?? null,
      });
    } else {
      setShowVoteModal(false);
      setPreloadedCheckout({ clientSecret: null, paymentIntentId: null, voteCount: null, amount: null });
      toast?.error?.(result.error || 'Could not start checkout.');
    }
  };

  const handleVoteModalClose = () => {
    checkoutRequestRef.current += 1;
    setPreloadedCheckout({ clientSecret: null, paymentIntentId: null, voteCount: null, amount: null });
    setShowVoteModal(false);
  };

  const handleFreeClick = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (user?.id) {
      handleAuthenticatedVote();
    } else {
      setShowFreeForm((prev) => !prev);
    }
  };

  const handleAuthenticatedVote = async () => {
    if (busy || alreadyVoted || !contestantId || !competitionId) return;

    if (isPreview) {
      setCastSuccess(true);
      setAlreadyVoted(true);
      setShowShareModal(true);
      toast?.info?.('Preview mode — no vote was cast.');
      return;
    }

    setBusy(true);
    setError('');
    const isDoubleVoteDay = await isDoubleVoteDayForCompetition(competitionId);
    const result = await submitFreeVote({
      userId: user.id,
      voterEmail: user.email,
      competitionId,
      contestantId,
      isDoubleVoteDay,
    });
    setBusy(false);

    if (result?.success) {
      setCastSuccess(true);
      setAlreadyVoted(true);
      setShowShareModal(true);
      toast?.success?.(`Vote cast for ${contestantName}!`);
      onVoteCast?.(result?.votesAdded);
    } else {
      setError(result?.error || 'Could not cast your vote.');
    }
  };

  const handleAnonymousVote = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (busy || !contestantId || !competitionId) return;

    if (isPreview) {
      setCastSuccess(true);
      setShowShareModal(true);
      toast?.info?.('Preview mode — no vote was cast.');
      return;
    }

    setBusy(true);
    setError('');
    const result = await submitAnonymousVote({
      email,
      firstName: firstFormName,
      lastName: lastFormName,
      competitionId,
      contestantId,
      mountedAt: mountedAtRef.current,
      company,
      fingerprint,
    });
    setBusy(false);

    if (result?.success) {
      setCastSuccess(true);
      setAlreadyVoted(true);
      writeAnonVoted(competitionId);
      setShowShareModal(true);
      toast?.success?.(`Vote cast for ${contestantName}!`);
      onVoteCast?.(result?.votesAdded);
    } else {
      // Server enforces 1 free vote per device per competition per day. Lock
      // the free-vote section so the voter can't keep resubmitting, and fire
      // an info toast — the silent form-collapse alone was getting missed
      // (voters reported thinking the vote went through). The gray reset
      // caption under the disabled button still shows the countdown.
      if (result?.code === 'ALREADY_VOTED') {
        setAlreadyVoted(true);
        setShowFreeForm(false);
        // Use the server's actual prior-vote timestamp so the localStorage
        // lock — and the toast countdown derived from it — reflects when
        // the vote really expires, not 24h-from-now.
        writeAnonVoted(competitionId, result?.prevVoteAt);
        const resetIn = formatResetIn(getAnonVoteResetMs(competitionId));
        // Say WHICH signal matched and how to reach a human — "already voted"
        // alone reads as a bug to someone who is sure they didn't vote (shared
        // Wi-Fi, a partner's phone, a returning device).
        toast?.info?.(
          resetIn
            ? `This device already used its free vote for this competition — it unlocks in ${resetIn}. Paid votes work anytime. If that's not right, email info@eliterank.co.`
            : `This device already used its free vote for this competition. Free votes reset 24h after your last one; paid votes work anytime. If that's not right, email info@eliterank.co.`
        );
      } else {
        setError(result?.error || 'Could not cast your vote.');
      }
    }
  };

  const total = calculateVotePrice(selectedCount || 0, useBundler, pricePerVote);
  const canSend = Number(selectedCount) >= 1 && !busy;

  return (
    <>
      <div
        onClick={stopPropagation}
        style={{
          marginTop: spacing.sm,
          padding: spacing.md,
          background: 'rgba(212,175,55,0.04)',
          border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: borderRadius.lg,
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.md,
        }}
      >
        <h4 style={{
          margin: 0,
          fontSize: typography.fontSize.base,
          fontWeight: typography.fontWeight.semibold,
          color: colors.text.primary,
          letterSpacing: typography.letterSpacing.tight,
        }}>
          {isPreview
            ? 'Preview — voting will be live here'
            : `Send votes to ${firstName}`}
        </h4>

        {/* Double-vote-day banner — single source of truth for the 2×
            cue. We deliberately don't repeat the math on every tile or in
            the CTA; one calm signal beats three loud ones. */}
        {isDoubleVoteDay && (
          <div style={{
            padding: `${spacing.xs} ${spacing.md}`,
            background: 'rgba(34,197,94,0.07)',
            border: `1px solid rgba(34,197,94,0.22)`,
            borderRadius: borderRadius.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
          }}>
            <Sparkles size={14} style={{ color: colors.status.success, flexShrink: 0 }} />
            <span style={{
              fontSize: typography.fontSize.sm,
              color: colors.text.primary,
              fontWeight: typography.fontWeight.semibold,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}>
              Double Vote Day · every vote counts 2× today
            </span>
          </div>
        )}

        {castSuccess && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
            padding: spacing.sm,
            color: colors.status.success,
            fontSize: typography.fontSize.sm,
          }}>
            <Check size={16} />
            <span>
              Vote cast! Come back tomorrow for another free vote or purchase votes at any time.
            </span>
          </div>
        )}

        {/* Paid vote UI — always visible so voters can still buy votes
            after using their free daily vote. */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: spacing.sm,
        }}>
          {VOTE_PRESETS.map((count) => (
            <PresetTile
              key={count}
              count={count}
              pricePerVote={pricePerVote}
              useBundler={useBundler}
              isDoubleVoteDay={isDoubleVoteDay}
              active={Number(selectedCount) === count}
              onClick={handleTileClick(count)}
            />
          ))}
        </div>

        {/* Custom amount — mirrors the preset tile layout: input on the
            left (typing flows left-to-right), live price on the right. */}
        <div style={{
          padding: `${spacing.sm} ${spacing.md}`,
          background: 'rgba(0,0,0,0.25)',
          border: `1px solid ${colors.border.primary}`,
          borderRadius: borderRadius.md,
          display: 'flex',
          alignItems: 'center',
          gap: spacing.sm,
        }}>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="1000"
            value={selectedCount}
            placeholder="Custom amount"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw === '') {
                setSelectedCount('');
                return;
              }
              const n = Math.max(1, Math.min(1000, parseInt(raw, 10) || 0));
              setSelectedCount(n);
            }}
            style={{
              minWidth: 0,
              // Reserve placeholder width when empty; once the user types,
              // shrink to fit so the doubled-count display can sit right
              // next to it instead of being pushed across the row.
              width: selectedCount ? `${String(selectedCount).length + 1}ch` : '14ch',
              padding: `${spacing.xs} 0`,
              background: 'transparent',
              border: 'none',
              // On a double day the typed value is the "before" and the
              // doubled count is the new primary — mute the input so the
              // doubled count gets visual priority.
              color: isDoubleVoteDay && Number(selectedCount) >= 1
                ? colors.text.muted
                : colors.text.primary,
              fontSize: typography.fontSize.base,
              fontWeight: typography.fontWeight.semibold,
              textAlign: 'left',
              outline: 'none',
            }}
          />
          {isDoubleVoteDay && Number(selectedCount) >= 1 ? (
            <span style={{
              flex: 1,
              display: 'flex',
              alignItems: 'baseline',
              gap: spacing.xs,
            }}>
              <span style={{
                fontSize: typography.fontSize.sm,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
              }}>
                {Number(selectedCount) * 2}
              </span>
              <span style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.muted,
              }}>
                votes
              </span>
            </span>
          ) : (
            <span style={{
              fontSize: typography.fontSize.xs,
              color: colors.text.muted,
              flex: 1,
            }}>
              votes
            </span>
          )}
          <span style={{
            fontSize: typography.fontSize.sm,
            fontWeight: typography.fontWeight.semibold,
            color: colors.text.muted,
          }}>
            {formatPrice(total)}
          </span>
        </div>

        {/* Rank projection */}
        {rankProjection && rankProjection.delta > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${spacing.sm} ${spacing.md}`,
            background: 'rgba(212,175,55,0.05)',
            border: `1px solid rgba(212,175,55,0.2)`,
            borderRadius: borderRadius.md,
            fontSize: typography.fontSize.sm,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, color: colors.text.secondary }}>
              <TrendingUp size={14} style={{ color: colors.gold.primary }} />
              <span>
                Moves {firstName}{' '}
                <strong style={{ color: colors.text.primary }}>
                  up {rankProjection.delta} {rankProjection.delta === 1 ? 'spot' : 'spots'}
                </strong>
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.xs, color: colors.text.muted }}>
              <span>#{rankProjection.current}</span>
              <ArrowRight size={12} />
              <strong style={{ color: colors.gold.primary }}>#{rankProjection.projected}</strong>
            </div>
          </div>
        )}

        {/* Primary CTA */}
        <button
          type="button"
          onClick={openBuyVotes}
          disabled={!canSend}
          style={{
            padding: `${spacing.md} ${spacing.md}`,
            background: canSend ? gradients.gold : 'rgba(212,175,55,0.2)',
            color: '#0a0a0f',
            border: 'none',
            borderRadius: borderRadius.md,
            fontSize: typography.fontSize.base,
            fontWeight: typography.fontWeight.bold,
            cursor: canSend ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            opacity: canSend ? 1 : 0.6,
          }}
        >
          Send {isDoubleVoteDay ? Number(selectedCount || 0) * 2 : (selectedCount || 0)} {Number(selectedCount) === 1 && !isDoubleVoteDay ? 'vote' : 'votes'} — {formatPrice(total)}
        </button>

        {/* Free-vote path — hide once the free vote has been successfully
            cast so the success banner above is the only confirmation. */}
        {!castSuccess && (
          <>
            {/* "or" divider + the free-vote button are hidden once the anon
                contact form is open — the form has its own submit CTA, so
                the outer button is redundant at that point. */}
            {!showFreeForm && (
              <>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: spacing.sm,
                  color: colors.text.muted,
                  fontSize: typography.fontSize.xs,
                  fontWeight: typography.fontWeight.semibold,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}>
                  <div style={{ flex: 1, height: '1px', background: colors.border.primary }} />
                  <span>or</span>
                  <div style={{ flex: 1, height: '1px', background: colors.border.primary }} />
                </div>

                <FreeVoteButton
                  alreadyVoted={alreadyVoted}
                  busy={busy}
                  showFreeForm={showFreeForm}
                  onClick={handleFreeClick}
                />

                {/* Anonymous voters: when the free vote is locked, surface the
                    countdown + the paid-vote alternative so they don't bounce. */}
                {alreadyVoted && !user?.id && (() => {
                  const resetIn = formatResetIn(getAnonVoteResetMs(competitionId));
                  return (
                    <p style={{
                      margin: 0,
                      fontSize: typography.fontSize.xs,
                      color: colors.text.muted,
                      textAlign: 'center',
                    }}>
                      Free vote resets in {resetIn || '24h'} — or send paid votes anytime.
                    </p>
                  );
                })()}
              </>
            )}

            {!user?.id && showFreeForm && (
              <AnonForm
                email={email}
                setEmail={setEmail}
                firstName={firstFormName}
                setFirstName={setFirstFormName}
                lastName={lastFormName}
                setLastName={setLastFormName}
                company={company}
                setCompany={setCompany}
                busy={busy}
                onSubmit={handleAnonymousVote}
              />
            )}
          </>
        )}

        {error && (
          <p style={{
            fontSize: typography.fontSize.xs,
            color: colors.status.error,
          }}>
            {error}
          </p>
        )}
      </div>

      {roundForModal && (
        <VoteModal
          isOpen={showVoteModal}
          onClose={handleVoteModalClose}
          contestant={{
            id: contestantId,
            name: contestant?.name,
            avatar_url: contestant?.avatarUrl || contestant?.avatar_url,
            votes: contestant?.votes,
          }}
          competitionId={competitionId}
          user={user}
          isAuthenticated={!!user?.id}
          onVoteSuccess={(creditedVotes) => {
            handleVoteModalClose();
            setShowShareModal(true);
            toast?.success?.('Votes purchased!');
            onVoteCast?.(creditedVotes);
          }}
          currentRound={roundForModal}
          initialVoteCount={Number(selectedCount) || 1}
          autoCheckout
          votePrice={competition?.price_per_vote}
          useBundler={competition?.use_price_bundler}
          forceDoubleVoteDay={isDoubleVoteDay}
          externalCheckout
          preloadedClientSecret={preloadedCheckout.clientSecret}
          preloadedPaymentIntentId={preloadedCheckout.paymentIntentId}
          preloadedConnectedAccountId={preloadedCheckout.connectedAccountId}
          serverAmount={preloadedCheckout.amount}
          serverSubtotal={preloadedCheckout.subtotal}
          serverTax={preloadedCheckout.taxAmount}
          serverTaxRatePct={preloadedCheckout.taxRatePct}
          serverTaxLabel={preloadedCheckout.taxLabel}
          currency={preloadedCheckout.currency || undefined}
        />
      )}

      <Modal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        maxWidth="420px"
        centered
      >
        <VoteShareCard
          contestant={contestant}
          competition={competition}
        />
      </Modal>
    </>
  );
}

function PresetTile({ count, pricePerVote, useBundler, isDoubleVoteDay, active, onClick }) {
  const total = calculateVotePrice(count, useBundler, pricePerVote);
  const save = Math.max(0, count * pricePerVote - total);
  // Only surface the savings when the delta is meaningful — hides the
  // noisy "save $4" on the 25-vote tile and keeps attention on the big
  // discounts (100 votes = save $30, 250 votes = save $125).
  const showSave = save >= 10;
  // Strikethrough pattern carries the double-day signal on the count
  // itself (struck-through original + bold doubled count) so the green
  // accent slot can stay reserved for the bundler savings only.
  const displayCount = isDoubleVoteDay ? count * 2 : count;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: '100%',
          padding: spacing.md,
          background: active ? 'rgba(212,175,55,0.12)' : 'rgba(0,0,0,0.25)',
          border: `1px solid ${active ? colors.gold.primary : colors.border.primary}`,
          borderRadius: borderRadius.md,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: spacing.sm,
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: spacing.xs }}>
          {isDoubleVoteDay && (
            <span style={{
              fontSize: typography.fontSize.lg,
              fontWeight: typography.fontWeight.semibold,
              color: colors.text.muted,
              textDecoration: 'line-through',
              textDecorationColor: 'rgba(255,255,255,0.45)',
              lineHeight: 1,
            }}>
              {count}
            </span>
          )}
          <span style={{
            fontSize: typography.fontSize['2xl'],
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            lineHeight: 1,
          }}>
            {displayCount}
          </span>
          <span style={{
            fontSize: typography.fontSize.sm,
            color: colors.text.muted,
          }}>
            votes
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
          <span style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: active ? colors.gold.primary : colors.text.primary,
            lineHeight: 1,
          }}>
            {totalFormatter.format(total)}
          </span>
          {showSave && (
            <span style={{
              fontSize: typography.fontSize.xs,
              color: colors.status.success,
              fontWeight: typography.fontWeight.semibold,
            }}>
              save {totalFormatter.format(save)}
            </span>
          )}
        </div>
      </button>
    </div>
  );
}

function FreeVoteButton({ alreadyVoted, busy, showFreeForm, onClick }) {
  // Treat the device as "used" for anonymous voters too — the server check
  // is per-fingerprint, not per-account.
  const used = alreadyVoted;

  const content = (() => {
    if (busy) return <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />;
    if (used) return (<><Check size={14} /> Free daily vote used</>);
    return (<><Check size={14} /> Use your 1 free daily vote</>);
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || used}
      aria-expanded={showFreeForm}
      style={{
        width: '100%',
        padding: `${spacing.sm} ${spacing.md}`,
        background: 'transparent',
        border: `1px solid ${used ? colors.border.primary : 'rgba(212,175,55,0.35)'}`,
        borderRadius: borderRadius.md,
        color: used ? colors.text.muted : colors.gold.primary,
        fontSize: typography.fontSize.sm,
        fontWeight: typography.fontWeight.semibold,
        cursor: busy || used ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.xs,
      }}
    >
      {content}
    </button>
  );
}

function AnonForm({
  email, setEmail,
  firstName, setFirstName,
  lastName, setLastName,
  company, setCompany,
  busy,
  onSubmit,
}) {
  const inputStyle = {
    flex: 1,
    minWidth: 0,
    padding: `${spacing.xs} ${spacing.sm}`,
    background: 'rgba(0,0,0,0.35)',
    border: `1px solid ${colors.border.primary}`,
    borderRadius: borderRadius.sm,
    color: colors.text.primary,
    fontSize: typography.fontSize.sm,
  };

  const canSubmit =
    !busy &&
    email.trim().length > 3 &&
    firstName.trim().length > 0 &&
    lastName.trim().length > 0;

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: spacing.sm }}
    >
      {/* Honeypot. Deliberately has NO name/id/placeholder: browser autofill
          maps fields by those tokens, and the previous name="company" made
          Chrome/Safari fill it with the voter's saved organization whenever
          they autofilled the visible fields (autocomplete="off" is ignored
          for recognized address tokens) — rejecting real voters as bots with
          "Invalid submission". Scripted bots fill every text input regardless
          of name, so the trap still catches them. */}
      <input
        type="text"
        tabIndex={-1}
        autoComplete="off"
        value={company}
        onChange={(e) => setCompany(e.target.value)}
        style={{ position: 'absolute', left: '-10000px', width: '1px', height: '1px', opacity: 0 }}
        aria-hidden="true"
      />

      <div style={{ display: 'flex', gap: spacing.xs }}>
        <input
          type="text"
          placeholder="First name"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          maxLength={60}
          style={inputStyle}
        />
        <input
          type="text"
          placeholder="Last name"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          maxLength={60}
          style={inputStyle}
        />
      </div>

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Mail size={14} style={{
          position: 'absolute',
          left: spacing.sm,
          color: colors.text.muted,
          pointerEvents: 'none',
        }} />
        <input
          type="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          maxLength={254}
          style={{ ...inputStyle, paddingLeft: '30px' }}
        />
      </div>

      <button
        type="submit"
        disabled={!canSubmit}
        style={{
          padding: `${spacing.sm} ${spacing.md}`,
          background: canSubmit ? gradients.gold : 'rgba(255,255,255,0.05)',
          color: canSubmit ? '#0a0a0f' : colors.text.muted,
          border: 'none',
          borderRadius: borderRadius.md,
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
          cursor: canSubmit ? 'pointer' : 'not-allowed',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        }}
      >
        {busy ? (
          <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} />
        ) : (
          <>
            <Heart size={14} /> Submit free vote
          </>
        )}
      </button>
    </form>
  );
}
