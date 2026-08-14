import React, { useState, useEffect, useRef, useMemo } from 'react';
import { DollarSign, Sparkles, LogIn, Check, Clock, Loader, Share2, Twitter, Facebook, Link2, CheckCircle, CreditCard, X, AlertCircle, RefreshCw } from 'lucide-react';
import * as Sentry from '@sentry/react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Modal, Button, Avatar, VoteShareCard } from '../../../components/ui';
import FanButton from '../../../components/ui/FanButton';
import { colors, spacing, borderRadius, typography, gradients, shadows } from '../../../styles/theme';
import { formatNumber } from '../../../utils/formatters';
import { VOTE_PRESETS } from '../../../constants';
import { calculateVotePrice } from '../../../types/competition';
import { hasUsedFreeVoteToday, submitFreeVote, getTodaysVote, getTimeUntilReset, createVotePaymentIntent, recordPaidVote } from '../../../lib/votes';
import { useToast } from '../../../contexts/ToastContext';
import { useIsPreview } from '../../../contexts/PublicCompetitionContext';
import { getStripe, isStripeConfigured } from '../../../lib/stripe';
import { avatarUrl } from '../../../lib/storageImage';

// Show $10 for round totals and $9.90 for fractional bundler prices. The
// shared formatCurrency truncates to whole dollars, which hides the discount.
// Currency-aware: US hosts charge USD, Ontario/CA hosts charge CAD, so the
// symbol must follow the competition's settlement currency rather than being
// hardcoded (a CAD charge would otherwise render with a bare "$").
const makePriceFormatter = (currency = 'USD') =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: (currency || 'USD').toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

export default function VoteModal({
  isOpen,
  onClose,
  contestant,
  voteCount,
  onVoteCountChange,
  forceDoubleVoteDay,
  isAuthenticated = false,
  onLogin,
  competitionId,
  user,
  onVoteSuccess,
  currentRound,
  initialVoteCount = 10,
  autoCheckout = false,
  votePrice = 1.00,
  useBundler = false,
  // Settlement currency for this competition's host (USD | CAD). Drives the
  // displayed price symbol; defaults to USD. The authoritative charge currency
  // still comes from create-payment-intent's response.
  currency = 'USD',
  // Optional — when the opener pre-creates the PaymentIntent (for speed),
  // set externalCheckout=true and pass the clientSecret as soon as it
  // resolves. The modal won't fire its own createVotePaymentIntent.
  externalCheckout = false,
  preloadedClientSecret = null,
  preloadedPaymentIntentId = null,
  // Connected account (host) the PaymentIntent was created on. Required to
  // confirm direct-charge PaymentIntents (Stripe Connect) — Stripe.js must be
  // initialized for this account.
  preloadedConnectedAccountId = null,
  // Server-authoritative charge amount in cents from create-payment-intent.
  // When provided, the modal uses this for every displayed price after the
  // PaymentIntent resolves so the user never sees a number that disagrees
  // with what Stripe will charge.
  serverAmount = null,
  // Server-authoritative tax breakdown (cents) for the pre-created PaymentIntent
  // flow, so the checkout can itemize e.g. HST alongside the preloaded total.
  serverSubtotal = null,
  serverTax = null,
  serverTaxRatePct = null,
  serverTaxLabel = null,
}) {
  const userId = user?.id;
  const toast = useToast();
  const isPreview = useIsPreview();
  const hasActiveRound = currentRound?.isActive && !isPreview;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [freeVoteUsed, setFreeVoteUsed] = useState(false);
  const [votedContestantId, setVotedContestantId] = useState(null);
  const [checkingVoteStatus, setCheckingVoteStatus] = useState(true);
  const [showSuccess, setShowSuccess] = useState(false);
  const [votesAdded, setVotesAdded] = useState(1);
  const [linkCopied, setLinkCopied] = useState(false);

  // Payment states
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [clientSecret, setClientSecret] = useState(null);
  const [paymentIntentId, setPaymentIntentId] = useState(null);
  // Connected account the PaymentIntent lives on (direct charge). Drives which
  // Stripe.js instance is used to confirm.
  const [connectedAccountId, setConnectedAccountId] = useState(preloadedConnectedAccountId);
  const [isCreatingPayment, setIsCreatingPayment] = useState(false);
  const [selectedVoteCount, setSelectedVoteCount] = useState(initialVoteCount);
  // Cents. Once set, replaces the client-side calculateVotePrice estimate
  // everywhere downstream. Null = no PaymentIntent has resolved yet.
  const [confirmedAmount, setConfirmedAmount] = useState(serverAmount);
  // Server-authoritative tax breakdown (cents) — populated alongside the
  // confirmed amount so the total can be itemized (e.g. HST). The base price is
  // tiered (price bundler), so the tax is always on the actual bundled subtotal.
  const [confirmedSubtotal, setConfirmedSubtotal] = useState(serverSubtotal);
  const [confirmedTax, setConfirmedTax] = useState(serverTax);
  const [taxRatePct, setTaxRatePct] = useState(serverTaxRatePct);
  const [taxLabel, setTaxLabel] = useState(serverTaxLabel);
  // Currency the price is displayed in. Starts from the competition prop and is
  // overwritten by the authoritative currency create-payment-intent returns.
  const [displayCurrency, setDisplayCurrency] = useState(currency);

  // Adopt the server amount whenever the opener pushes a fresh one in
  // (externalCheckout flow — the parent's createVotePaymentIntent landed).
  useEffect(() => {
    if (serverAmount != null) setConfirmedAmount(serverAmount);
    if (serverSubtotal != null) setConfirmedSubtotal(serverSubtotal);
    if (serverTax != null) setConfirmedTax(serverTax);
    if (serverTaxRatePct != null) setTaxRatePct(serverTaxRatePct);
    if (serverTaxLabel != null) setTaxLabel(serverTaxLabel);
  }, [serverAmount, serverSubtotal, serverTax, serverTaxRatePct, serverTaxLabel]);

  // Keep display currency in sync if the opener passes a new competition.
  useEffect(() => {
    if (currency) setDisplayCurrency(currency);
  }, [currency]);

  const formatPrice = useMemo(() => {
    const f = makePriceFormatter(displayCurrency);
    return (amount) => f.format(amount);
  }, [displayCurrency]);

  // Authoritative price the UI should show. Falls back to the client estimate
  // before any PaymentIntent has resolved (preset tiles, modal-open total).
  const displayedTotal =
    confirmedAmount != null
      ? confirmedAmount / 100
      : calculateVotePrice(selectedVoteCount, useBundler, votePrice);

  // Tax itemization (e.g. HST). Only known once the PaymentIntent resolves —
  // the base price is tiered, so the tax is always on the actual bundled
  // subtotal the server computed, never a flat estimate.
  const hasTaxBreakdown = confirmedTax != null && confirmedTax > 0;
  const displayedSubtotal = confirmedSubtotal != null ? confirmedSubtotal / 100 : null;
  const displayedTax = confirmedTax != null ? confirmedTax / 100 : null;
  const taxLineLabel = taxRatePct ? `${taxLabel || 'Tax'} (${taxRatePct}%)` : (taxLabel || 'Tax');

  // Sync when parent passes a new preset (e.g., opening modal with a chip selected)
  useEffect(() => {
    if (isOpen && initialVoteCount) setSelectedVoteCount(initialVoteCount);
  }, [isOpen, initialVoteCount]);

  const stripeConfigured = isStripeConfigured();

  // Stripe.js load failures (ad-blockers, network) are silent inside the
  // Elements provider — it just renders nothing. Track the load explicitly
  // so we can show a retry UI instead of an empty modal.
  const [stripeLoadFailed, setStripeLoadFailed] = useState(false);
  const [stripeRetryKey, setStripeRetryKey] = useState(0);

  // Reset states when modal opens/closes or contestant changes
  useEffect(() => {
    if (!isOpen) {
      setShowSuccess(false);
      setLinkCopied(false);
      setShowPaymentForm(false);
      setClientSecret(null);
      setPaymentIntentId(null);
      setConnectedAccountId(null);
      setSelectedVoteCount(10);
      setConfirmedAmount(null);
      setConfirmedSubtotal(null);
      setConfirmedTax(null);
      setStripeLoadFailed(false);
    }
  }, [isOpen]);

  // Pre-resolve Stripe.js when the payment form is about to render so
  // ad-blocker/network failures surface as a recoverable error instead of
  // an empty Elements provider. Distinct Sentry tag so this signal is
  // separable from the noisy warmup case.
  useEffect(() => {
    if (!showPaymentForm || !clientSecret) return;
    let cancelled = false;
    setStripeLoadFailed(false);
    const promise = getStripe(connectedAccountId);
    if (!promise) {
      setStripeLoadFailed(true);
      return;
    }
    promise.catch((err) => {
      if (cancelled) return;
      setStripeLoadFailed(true);
      Sentry.captureException(err, {
        tags: { stage: 'stripe-load-on-payment' },
        extra: {
          paymentIntentId,
          voteCount: selectedVoteCount,
          contestantId: contestant?.id,
          competitionId,
        },
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPaymentForm, clientSecret, connectedAccountId, stripeRetryKey]);

  const retryStripeLoad = () => {
    setStripeLoadFailed(false);
    setStripeRetryKey((k) => k + 1);
  };

  // Check if user has already used their free vote today
  useEffect(() => {
    const checkVoteStatus = async () => {
      if (!isOpen || !userId || !competitionId) {
        setCheckingVoteStatus(false);
        return;
      }

      setCheckingVoteStatus(true);
      try {
        const [hasVoted, votedFor] = await Promise.all([
          hasUsedFreeVoteToday(userId, competitionId),
          getTodaysVote(userId, competitionId),
        ]);
        setFreeVoteUsed(hasVoted);
        setVotedContestantId(votedFor);
      } catch (err) {
        console.error('Error checking vote status:', err);
      }
      setCheckingVoteStatus(false);
    };

    checkVoteStatus();
  }, [isOpen, userId, competitionId]);

  // Auto-initiate the Stripe purchase flow when the modal opens in
  // autoCheckout mode (invoked from the inline card's "Purchase" CTA).
  // Works for both authenticated and anonymous voters — Stripe collects
  // the billing email during checkout for the anonymous path.
  const autoCheckoutTriggered = useRef(false);
  // Bumped on every close so any in-flight PaymentIntent request can
  // tell it was issued by a previous session and discard its result.
  const requestVersionRef = useRef(0);
  useEffect(() => {
    if (!isOpen) {
      autoCheckoutTriggered.current = false;
      requestVersionRef.current += 1;
      return;
    }
    if (!autoCheckout || autoCheckoutTriggered.current) return;
    // If the opener is managing the PaymentIntent, never fire our own —
    // just wait for preloadedClientSecret to arrive via the effect below.
    if (externalCheckout) return;
    if (!hasActiveRound || !stripeConfigured) return;
    autoCheckoutTriggered.current = true;
    handleInitiatePurchase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, autoCheckout, hasActiveRound, stripeConfigured, externalCheckout]);

  // Hydrate local state the moment the opener's pre-created PaymentIntent
  // is ready so the payment-form branch renders without another trip.
  useEffect(() => {
    if (!isOpen || !preloadedClientSecret) return;
    setClientSecret(preloadedClientSecret);
    setPaymentIntentId(preloadedPaymentIntentId);
    setConnectedAccountId(preloadedConnectedAccountId);
    setShowPaymentForm(true);
  }, [isOpen, preloadedClientSecret, preloadedPaymentIntentId, preloadedConnectedAccountId]);

  // Handle free vote submission
  const handleFreeVote = async () => {
    if (!contestant || !userId || !competitionId || freeVoteUsed || isSubmitting) {
      return;
    }

    // Block voting if no active round
    if (!hasActiveRound) {
      toast.error('Voting is not currently active. Please wait for the next voting round.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await submitFreeVote({
        userId,
        voterEmail: user?.email,
        competitionId,
        contestantId: contestant.id,
        isDoubleVoteDay: forceDoubleVoteDay,
      });

      if (result.success) {
        setVotesAdded(result.votesAdded || 1);
        setFreeVoteUsed(true);
        setVotedContestantId(contestant.id);
        setShowSuccess(true);
        onVoteSuccess?.();
      } else {
        toast.error(result.error || 'Failed to submit vote');
      }
    } catch (err) {
      console.error('Error submitting vote:', err);
      toast.error('An unexpected error occurred');
    }

    setIsSubmitting(false);
  };

  // Handle initiating purchase
  const handleInitiatePurchase = async () => {
    if (!contestant || !competitionId || !selectedVoteCount || isCreatingPayment) {
      return;
    }

    if (!hasActiveRound) {
      toast.error('Voting is not currently active');
      return;
    }

    if (!stripeConfigured) {
      toast.error('Payment system is not configured');
      return;
    }

    setIsCreatingPayment(true);
    const requestVersion = requestVersionRef.current;

    try {
      const result = await createVotePaymentIntent({
        competitionId,
        contestantId: contestant.id,
        voteCount: selectedVoteCount,
        voterEmail: user?.email,
      });

      // Bail if the modal was closed while this request was in flight; the
      // PaymentIntent is orphaned but we don't want to poison next open.
      if (requestVersion !== requestVersionRef.current) return;

      if (result.success && result.clientSecret) {
        setClientSecret(result.clientSecret);
        setPaymentIntentId(result.paymentIntentId);
        setConnectedAccountId(result.connectedAccountId);
        if (result.amount != null) setConfirmedAmount(result.amount);
        if (result.subtotal != null) setConfirmedSubtotal(result.subtotal);
        if (result.taxAmount != null) setConfirmedTax(result.taxAmount);
        if (result.taxRatePct != null) setTaxRatePct(result.taxRatePct);
        if (result.taxLabel != null) setTaxLabel(result.taxLabel);
        if (result.currency) setDisplayCurrency(result.currency);
        setShowPaymentForm(true);
      } else {
        toast.error(result.error || 'Failed to create payment');
      }
    } catch (err) {
      console.error('Error initiating purchase:', err);
      if (requestVersion === requestVersionRef.current) {
        toast.error('An unexpected error occurred');
      }
    }

    if (requestVersion === requestVersionRef.current) {
      setIsCreatingPayment(false);
    }
  };

  // Handle successful payment
  const handlePaymentSuccess = async () => {
    // Pre-double the count for double-vote days so the values we write
    // here are correct regardless of whether the webhook gets a chance to
    // run. The webhook would compute the same numbers, but it short-
    // circuits the moment it sees an existing row matching this
    // payment_intent_id — so for authenticated voters this client write
    // is effectively the source of truth.
    const creditedVoteCount = forceDoubleVoteDay
      ? selectedVoteCount * 2
      : selectedVoteCount;

    // For authenticated voters we record the vote client-side for immediate
    // feedback; the webhook will dedup on payment_intent_id. For anonymous
    // voters we let the webhook be the source of truth so voter_email is
    // populated from Stripe's billing details instead of left null.
    if (userId) {
      const recorded = await recordPaidVote({
        paymentIntentId,
        competitionId,
        contestantId: contestant.id,
        voteCount: creditedVoteCount,
        amountPaid: displayedTotal,
        taxAmount: confirmedTax != null ? confirmedTax / 100 : 0,
        voterEmail: user?.email,
        isDoubleVote: !!forceDoubleVoteDay,
      });
      if (recorded && !recorded.success) {
        // The card is already charged; the stripe-webhook dedups on
        // payment_intent_id and remains the backstop writer, so don't block
        // the buyer — but this failure must reach Sentry, otherwise a
        // simultaneous webhook outage loses the vote with no signal anywhere.
        Sentry.captureException(
          new Error(`recordPaidVote failed: ${recorded.error || 'unknown'}`),
          {
            tags: { stage: 'record-paid-vote' },
            extra: {
              paymentIntentId,
              competitionId,
              contestantId: contestant?.id,
              voteCount: creditedVoteCount,
            },
          },
        );
      }
    }

    setVotesAdded(creditedVoteCount);
    setShowPaymentForm(false);
    setShowSuccess(true);
    onVoteSuccess?.(creditedVoteCount);
  };

  // Handle back from payment form
  const handleBackFromPayment = () => {
    setShowPaymentForm(false);
    setClientSecret(null);
    setPaymentIntentId(null);
    setConfirmedAmount(null);
    // In autoCheckout mode there's no vote-selector to fall back to — the
    // modal only exists to collect the card — so bail out of the whole modal.
    if (autoCheckout) {
      onClose();
    }
  };

  if (!contestant) return null;

  // Generate share URL for the contestant
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/competition/${competitionId}?contestant=${contestant.id}` : '';
  const shareText = `I just voted for ${contestant.name} in Most Eligible! Help them win by voting too! 🏆`;

  // Share handlers
  const handleShareTwitter = () => {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const handleShareFacebook = () => {
    const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
    window.open(url, '_blank', 'width=550,height=420');
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Native share (shows OS share sheet on mobile - Instagram, TikTok, Snapchat, etc.)
  const canNativeShare = typeof navigator !== 'undefined' && navigator.share;
  const handleNativeShare = async () => {
    if (!canNativeShare) return;
    try {
      await navigator.share({
        title: `Vote for ${contestant.name}`,
        text: shareText,
        url: shareUrl,
      });
    } catch (err) {
      // User cancelled or share failed - that's okay
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  };

  const handleCloseSuccess = () => {
    setShowSuccess(false);
    onClose();
  };

  // Auto-checkout loader: modal is opening via the inline card's Send CTA,
  // which means the user has already picked vote count + seen the total on
  // the button they clicked. Skip the full vote selector and render a
  // minimal loader while the Stripe PaymentIntent is being created.
  if (autoCheckout && isOpen && !showSuccess && !showPaymentForm) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="360px" centered hideCloseButton variant="gold">
        <div style={{ position: 'relative', padding: `${spacing.xxl} ${spacing.lg}` }}>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              position: 'absolute',
              top: spacing.sm,
              right: spacing.sm,
              background: 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: borderRadius.full,
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <X size={16} style={{ color: colors.text.secondary }} />
          </button>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.md,
            // Pre-allocate the eventual payment-form height so the modal
            // doesn't visibly grow & recenter when clientSecret arrives and
            // Stripe Elements loads in. Without this the buyer sees the
            // modal "zoom in" / shift up the page.
            minHeight: '420px',
          }}>
            <Loader size={24} style={{ color: colors.gold.primary, animation: 'spin 1s linear infinite' }} />
            <p style={{ fontSize: typography.fontSize.sm, color: colors.text.muted, margin: 0 }}>
              Verifying total &amp; preparing secure checkout…
            </p>
          </div>
        </div>
      </Modal>
    );
  }

  // Payment form screen — slim. The amount lives on the Pay button (which
  // Stripe controls), so no redundant confirmation header.
  if (showPaymentForm && clientSecret) {
    if (stripeLoadFailed) {
      return (
        <Modal isOpen={isOpen} onClose={handleBackFromPayment} title="" maxWidth="360px" centered hideCloseButton variant="gold">
          <div style={{ padding: `${spacing.xl} ${spacing.lg}`, textAlign: 'center' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: borderRadius.full,
                background: colors.status.errorMuted,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: `0 auto ${spacing.md}`,
              }}
            >
              <AlertCircle size={28} style={{ color: colors.status.error }} />
            </div>
            <h3
              style={{
                fontSize: typography.fontSize.lg,
                fontWeight: typography.fontWeight.semibold,
                color: colors.text.primary,
                margin: `0 0 ${spacing.sm}`,
              }}
            >
              Couldn't load payment form
            </h3>
            <p
              style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary,
                margin: `0 0 ${spacing.lg}`,
                lineHeight: 1.5,
              }}
            >
              Stripe was blocked from loading. This usually means an ad-blocker or strict privacy setting on this network. Try disabling it for this site, then retry.
            </p>
            <Button fullWidth size="lg" onClick={retryStripeLoad}>
              <RefreshCw size={16} />
              Retry
            </Button>
            <button
              onClick={handleBackFromPayment}
              style={{
                marginTop: spacing.sm,
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: colors.text.secondary,
                fontSize: typography.fontSize.sm,
                cursor: 'pointer',
                padding: spacing.sm,
              }}
            >
              Cancel
            </button>
          </div>
        </Modal>
      );
    }

    const stripePromise = getStripe(connectedAccountId);

    return (
      <Modal isOpen={isOpen} onClose={handleBackFromPayment} title="" maxWidth="360px" centered hideCloseButton variant="gold">
        {/* minHeight matches the auto-checkout loader so the modal frame
            stays the same size when transitioning loader → payment form.
            Without it the modal recenters as content grows, which the
            buyer perceives as the popup "moving" / "zooming in". */}
        <div style={{ display: 'flex', flexDirection: 'column', maxHeight: '85vh', minHeight: '420px' }}>
          {/* Minimal close row — no vote/price restatement */}
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: `${spacing.sm} ${spacing.sm} 0 ${spacing.sm}`,
          }}>
            <button
              onClick={handleBackFromPayment}
              aria-label="Close"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                borderRadius: borderRadius.full,
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={16} style={{ color: colors.text.secondary }} />
            </button>
          </div>

          {/* Stripe Elements — the PaymentElement collects the card and the
              Pay button below shows the amount, so nothing else is needed. */}
          <div style={{ flex: 1, overflowY: 'auto', padding: spacing.md }}>
            {stripePromise && (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  // Force en (US-style) formatting for CAD so Stripe's Pay
                  // button renders the amount as "CA$1.13" rather than a bare
                  // "$1.13", matching how the app labels CAD elsewhere. US
                  // competitions keep automatic (browser) locale.
                  locale: (displayCurrency || '').toUpperCase() === 'CAD' ? 'en' : 'auto',
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: '#d4af37',
                      colorBackground: '#18181b',
                      colorText: '#ffffff',
                      colorDanger: '#ef4444',
                      fontFamily: 'system-ui, -apple-system, sans-serif',
                      borderRadius: '8px',
                      spacingUnit: '3px',
                    },
                  },
                }}
              >
                <PaymentCheckoutForm
                  onSuccess={handlePaymentSuccess}
                  onCancel={handleBackFromPayment}
                  amount={displayedTotal}
                  currency={displayCurrency}
                  contestantName={contestant.name}
                  collectEmail={!isAuthenticated || !user?.email}
                  userEmail={user?.email}
                  connectedAccountId={connectedAccountId}
                />
              </Elements>
            )}
          </div>
        </div>
      </Modal>
    );
  }

  // Success confirmation screen
  if (showSuccess) {
    return (
      <Modal isOpen={isOpen} onClose={handleCloseSuccess} title="" maxWidth="380px" centered variant="gold">
        <div style={{ textAlign: 'center', padding: `${spacing.xl} ${spacing.lg} ${spacing.xxl}` }}>
          {/* Contestant image with success badge */}
          <div style={{ position: 'relative', display: 'inline-block', marginBottom: spacing.lg }}>
            <div
              style={{
                width: '90px',
                height: '90px',
                borderRadius: borderRadius.full,
                overflow: 'hidden',
                border: `3px solid ${colors.gold.primary}`,
                boxShadow: shadows.gold,
              }}
            >
              {contestant.avatar_url || contestant.avatarUrl ? (
                <img
                  src={avatarUrl(contestant.avatar_url || contestant.avatarUrl, 90)}
                  alt={contestant.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: gradients.gold,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: typography.fontSize.xxxl,
                    fontWeight: typography.fontWeight.bold,
                    color: '#0a0a0f',
                  }}
                >
                  {contestant.name?.charAt(0)}
                </div>
              )}
            </div>
            {/* Success checkmark badge */}
            <div
              style={{
                position: 'absolute',
                bottom: '-4px',
                right: '-4px',
                width: '32px',
                height: '32px',
                borderRadius: borderRadius.full,
                background: colors.status.success,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: `3px solid ${colors.background.card}`,
              }}
            >
              <Check size={18} style={{ color: 'white' }} />
            </div>
          </div>

          {/* Success message */}
          <h2
            style={{
              fontSize: typography.fontSize.xl,
              fontWeight: typography.fontWeight.bold,
              color: colors.text.primary,
              marginBottom: spacing.xs,
            }}
          >
            Vote Submitted!
          </h2>
          <p style={{ fontSize: typography.fontSize.md, color: colors.text.secondary, marginBottom: spacing.xl }}>
            You gave <span style={{ color: colors.gold.primary, fontWeight: typography.fontWeight.semibold }}>{contestant.name}</span> {votesAdded} {votesAdded > 1 ? 'votes' : 'vote'}
          </p>

          {/* Become a Fan prompt for logged-in users */}
          {isAuthenticated && contestant?.id && (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: spacing.xs,
              padding: spacing.md,
              background: 'rgba(212,175,55,0.08)',
              borderRadius: borderRadius.lg,
              marginBottom: spacing.md,
            }}>
              <p style={{
                fontSize: typography.fontSize.sm,
                color: colors.text.secondary,
                margin: 0,
              }}>
                Follow {contestant.name?.split(' ')[0]}'s journey?
              </p>
              <FanButton
                contestantId={contestant.id}
                contestantName={contestant.name}
              />
              <p style={{
                fontSize: typography.fontSize.xs,
                color: colors.text.muted,
                margin: 0,
              }}>
                Get weekly updates on their progress
              </p>
            </div>
          )}

          {/* Share card */}
          <VoteShareCard
            contestant={contestant}
            competition={{ name: 'Most Eligible' }}
            voteCount={votesAdded}
          />

          {/* Done button */}
          <button
            onClick={handleCloseSuccess}
            style={{
              width: '100%',
              padding: spacing.md,
              background: 'transparent',
              border: `1px solid ${colors.border.light}`,
              borderRadius: borderRadius.lg,
              color: colors.text.secondary,
              fontSize: typography.fontSize.md,
              fontWeight: typography.fontWeight.medium,
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </Modal>
    );
  }

  const effectiveVotes = forceDoubleVoteDay ? voteCount * 2 : voteCount;
  const freeVoteValue = forceDoubleVoteDay ? 2 : 1;
  const alreadyVotedForThis = votedContestantId === contestant.id;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cast Your Vote" maxWidth="360px" centered variant="gold">
      {/* Double Vote Day Banner - Compact */}
      {forceDoubleVoteDay && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(251,191,36,0.1))',
            border: `1px solid rgba(212,175,55,0.4)`,
            borderRadius: borderRadius.md,
            padding: `${spacing.sm} ${spacing.md}`,
            marginBottom: spacing.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
          }}
        >
          <Sparkles size={16} style={{ color: colors.gold.primary, flexShrink: 0 }} />
          <div>
            <p style={{ color: colors.gold.primary, fontWeight: typography.fontWeight.bold, fontSize: typography.fontSize.sm }}>
              DOUBLE VOTE DAY - All votes count 2x!
            </p>
          </div>
        </div>
      )}

      {/* Already voted banner - only show for authenticated users */}
      {isAuthenticated && freeVoteUsed && alreadyVotedForThis && (
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))',
            border: `1px solid rgba(34,197,94,0.3)`,
            borderRadius: borderRadius.md,
            padding: `${spacing.sm} ${spacing.md}`,
            marginBottom: spacing.md,
            display: 'flex',
            alignItems: 'center',
            gap: spacing.sm,
          }}
        >
          <Check size={16} style={{ color: colors.status.success, flexShrink: 0 }} />
          <p style={{ color: colors.status.success, fontWeight: typography.fontWeight.semibold, fontSize: typography.fontSize.xs }}>
            You voted for {contestant.name} today!
          </p>
        </div>
      )}

      {/* Contestant Preview - Compact */}
      <div style={{ textAlign: 'center', marginBottom: spacing.lg }}>
        <Avatar name={contestant.name} src={contestant.avatarUrl || contestant.avatar_url} size={64} style={{ margin: '0 auto 8px' }} />
        <h3 style={{ fontSize: typography.fontSize.lg, fontWeight: typography.fontWeight.semibold, marginBottom: '2px' }}>
          {contestant.name}
        </h3>
        <p style={{ color: colors.gold.primary, fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold }}>
          {formatNumber(contestant.votes || 0)} votes
        </p>
      </div>

      {/* Free Vote Section - Compact (hidden when autoCheckout so the
          modal feels like a dedicated purchase flow when opened from the
          inline card's "Purchase" CTA). */}
      {!autoCheckout && (
      <div style={{ marginBottom: spacing.md }}>
        {!isAuthenticated ? (
          <>
            <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs, marginBottom: spacing.sm, textAlign: 'center' }}>
              Sign in for a <span style={{ color: colors.status.success, fontWeight: typography.fontWeight.semibold }}>free daily vote</span>
              {forceDoubleVoteDay && <span style={{ color: colors.status.success }}> (2x!)</span>}
            </p>
            <Button
              variant="approve"
              fullWidth
              size="lg"
              onClick={onLogin}
              style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.1))',
                borderColor: 'rgba(34,197,94,0.4)',
                color: colors.status.success,
                padding: `${spacing.sm} ${spacing.md}`,
              }}
            >
              <LogIn size={16} />
              Sign In for Free Vote
            </Button>
          </>
        ) : (
          <>
            <p style={{ color: colors.text.secondary, fontSize: typography.fontSize.xs, marginBottom: spacing.sm, textAlign: 'center' }}>
              {!hasActiveRound ? (
                <>
                  <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Voting is not currently active
                </>
              ) : freeVoteUsed ? (
                <>
                  <Clock size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                  Free vote resets in {getTimeUntilReset()}
                </>
              ) : (
                <>
                  Use your <span style={{ color: colors.status.success, fontWeight: typography.fontWeight.semibold }}>free daily vote</span>
                  {forceDoubleVoteDay && <span style={{ color: colors.status.success }}> (2x!)</span>}
                </>
              )}
            </p>

            <Button
              variant="approve"
              fullWidth
              size="lg"
              onClick={handleFreeVote}
              disabled={!hasActiveRound || freeVoteUsed || isSubmitting || checkingVoteStatus}
              style={{
                background: (!hasActiveRound || freeVoteUsed)
                  ? 'rgba(255,255,255,0.05)'
                  : 'linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.1))',
                borderColor: (!hasActiveRound || freeVoteUsed) ? 'rgba(255,255,255,0.1)' : 'rgba(34,197,94,0.4)',
                color: (!hasActiveRound || freeVoteUsed) ? colors.text.muted : colors.status.success,
                cursor: (!hasActiveRound || freeVoteUsed) ? 'not-allowed' : 'pointer',
                padding: `${spacing.sm} ${spacing.md}`,
              }}
            >
              {checkingVoteStatus ? (
                <>
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Checking...
                </>
              ) : !hasActiveRound ? (
                <>
                  <Clock size={16} />
                  Voting Not Active
                </>
              ) : isSubmitting ? (
                <>
                  <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Submitting...
                </>
              ) : freeVoteUsed ? (
                <>
                  <Check size={16} />
                  Free Vote Used Today
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Use Free Daily Vote (+{freeVoteValue})
                </>
              )}
            </Button>
          </>
        )}
      </div>
      )}

      {/* Divider (hidden in autoCheckout since free-vote section is gone) */}
      {!autoCheckout && (
      <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
        <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>or buy votes</span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.1)' }} />
      </div>
      )}

      {/* Vote Count Selector - Compact */}
      <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md }}>
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: spacing.sm }}>
          {VOTE_PRESETS.map((num) => (
            <button
              key={num}
              onClick={() => setSelectedVoteCount(num)}
              disabled={!stripeConfigured || !hasActiveRound}
              style={{
                padding: '8px 12px',
                borderRadius: borderRadius.md,
                border: 'none',
                background: selectedVoteCount === num ? colors.gold.primary : 'rgba(255,255,255,0.05)',
                color: selectedVoteCount === num ? '#0a0a0f' : colors.text.secondary,
                fontWeight: typography.fontWeight.semibold,
                fontSize: typography.fontSize.base,
                cursor: (!stripeConfigured || !hasActiveRound) ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: (!stripeConfigured || !hasActiveRound) ? 0.5 : 1,
                minWidth: '44px',
              }}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Total Display - Compact (itemized when tax applies, e.g. HST) */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            padding: `${spacing.sm} ${spacing.md}`,
            background: forceDoubleVoteDay ? 'linear-gradient(135deg, rgba(212,175,55,0.2), rgba(34,197,94,0.1))' : 'rgba(212,175,55,0.15)',
            borderRadius: borderRadius.md,
            border: `1px solid ${forceDoubleVoteDay ? 'rgba(34,197,94,0.3)' : 'rgba(212,175,55,0.2)'}`,
          }}
        >
          {hasTaxBreakdown && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>Subtotal</span>
                <span style={{ color: colors.text.light, fontSize: typography.fontSize.sm }}>{formatPrice(displayedSubtotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: colors.text.muted, fontSize: typography.fontSize.xs }}>{taxLineLabel}</span>
                <span style={{ color: colors.text.light, fontSize: typography.fontSize.sm }}>{formatPrice(displayedTax)}</span>
              </div>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: colors.text.light, fontSize: typography.fontSize.sm }}>
              Total{forceDoubleVoteDay && <span style={{ color: colors.status.success, marginLeft: '4px' }}>(2x)</span>}
            </span>
            <span style={{ fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.gold.primary }}>
              {isCreatingPayment && confirmedAmount == null
                ? 'Verifying price…'
                : formatPrice(displayedTotal)}
              {forceDoubleVoteDay && (
                <span style={{ color: colors.status.success, fontSize: typography.fontSize.xs, marginLeft: '4px' }}>
                  = {formatNumber(selectedVoteCount * 2)}
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Purchase Button - Compact */}
      <Button
        fullWidth
        size="lg"
        icon={isCreatingPayment ? Loader : CreditCard}
        onClick={handleInitiatePurchase}
        disabled={!stripeConfigured || !hasActiveRound || isCreatingPayment}
        style={{
          background: (!stripeConfigured || !hasActiveRound) ? 'rgba(212,175,55,0.1)' : gradients.gold,
          borderColor: 'rgba(212,175,55,0.3)',
          color: (!stripeConfigured || !hasActiveRound) ? colors.text.muted : '#0a0a0f',
          cursor: (!stripeConfigured || !hasActiveRound) ? 'not-allowed' : 'pointer',
          opacity: (!stripeConfigured || !hasActiveRound) ? 0.5 : 1,
          padding: `${spacing.sm} ${spacing.md}`,
        }}
      >
        {isCreatingPayment ? (
          <>
            <span style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
            Processing...
          </>
        ) : !stripeConfigured ? (
          'Payment Not Configured'
        ) : !hasActiveRound ? (
          'Voting Not Active'
        ) : (
          `Buy ${selectedVoteCount} Votes - ${formatPrice(displayedTotal)}`
        )}
      </Button>

      {/* Spin animation style */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Modal>
  );
}

/**
 * Payment checkout form using Stripe Elements
 */
export function PaymentCheckoutForm({ onSuccess, onCancel, amount, currency = 'USD', contestantName, collectEmail = false, userEmail = null, connectedAccountId = null }) {
  const stripe = useStripe();
  const elements = useElements();
  const formatPrice = useMemo(() => {
    const f = makePriceFormatter(currency);
    return (a) => f.format(a);
  }, [currency]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  // Every paid vote purchase requires an explicit point-of-sale acknowledgment
  // that the purchase is non-refundable and does not guarantee a win. Asked on
  // each purchase — no per-browser tracking, cookies, or stored flags.
  const [acknowledged, setAcknowledged] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    if (!acknowledged) {
      setErrorMessage('Please confirm you understand that vote purchases are non-refundable.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // For redirect-based methods (Cash App Pay, etc.) the buyer leaves and
      // returns to this URL. Carry the connected account id (`va`) so the
      // return handler can retrieve the direct-charge PaymentIntent with the
      // right Stripe.js instance.
      const returnUrl = (() => {
        if (!connectedAccountId) return window.location.href;
        const u = new URL(window.location.href);
        u.searchParams.set('va', connectedAccountId);
        return u.toString();
      })();

      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: returnUrl, // Fallback, but we handle redirect: 'if_required'
          // When collectEmail is false (authenticated user), we told Stripe not to collect
          // email in the form, so we must provide it here
          ...(!collectEmail && userEmail ? {
            payment_method_data: {
              billing_details: {
                email: userEmail,
              },
            },
          } : {}),
        },
        redirect: 'if_required',
      });

      if (error) {
        setErrorMessage(error.message);
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {        onSuccess();
      } else if (paymentIntent && paymentIntent.status === 'processing') {
        // Payment is processing, show appropriate message
        setErrorMessage('Payment is processing. Please wait...');
      } else {
        setErrorMessage('Something went wrong. Please try again.');
      }
    } catch (err) {
      console.error('Payment error:', err);
      setErrorMessage('An unexpected error occurred.');
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement
        options={{
          layout: 'tabs',
          // For anonymous buyers, force email collection so the webhook
          // can attribute the paid vote without us prompting for it
          // separately on the card.
          fields: collectEmail ? { billingDetails: 'auto' } : { billingDetails: { email: 'never' } },
          // For CAD (Canadian host account) Stripe shows a billing Country
          // field; default it to Canada so it doesn't geo-default to the
          // buyer's location (e.g. "Netherlands"). This is just a pre-filled
          // default the buyer can change — it doesn't require supplying the
          // address at confirmation the way `address: 'never'` did.
          ...((currency || '').toUpperCase() === 'CAD'
            ? { defaultValues: { billingDetails: { address: { country: 'CA' } } } }
            : {}),
        }}
      />

      {errorMessage && (
        <div
          style={{
            marginTop: spacing.md,
            padding: spacing.md,
            background: 'rgba(239, 68, 68, 0.1)',
            borderRadius: borderRadius.md,
            border: '1px solid rgba(239, 68, 68, 0.3)',
            color: '#ef4444',
            fontSize: typography.fontSize.sm,
          }}
        >
          {errorMessage}
        </div>
      )}

      <label
        style={{
          display: 'flex',
          gap: spacing.sm,
          alignItems: 'flex-start',
          marginTop: spacing.md,
          padding: spacing.md,
          background: 'rgba(212,175,55,0.06)',
          border: '1px solid rgba(212,175,55,0.3)',
          borderRadius: borderRadius.md,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          aria-label="Acknowledge that vote purchases are non-refundable and do not guarantee a win"
          style={{ marginTop: '2px', width: '16px', height: '16px', accentColor: '#d4af37', flex: 'none', cursor: 'pointer' }}
        />
        <span style={{ fontSize: typography.fontSize.xs, color: colors.text.secondary, lineHeight: 1.45 }}>
          I understand this purchase is <strong style={{ color: colors.text.primary }}>final and non-refundable</strong>, and that
          buying votes <strong style={{ color: colors.text.primary }}>does not guarantee</strong> that{' '}
          {contestantName || 'my contestant'} will win, place, or advance in the competition.
        </span>
      </label>

      <button
        type="submit"
        disabled={!stripe || isProcessing || (!acknowledged)}
        style={{
          width: '100%',
          marginTop: spacing.md,
          padding: spacing.sm,
          background: isProcessing || (!acknowledged) ? 'rgba(212,175,55,0.5)' : gradients.gold,
          border: 'none',
          borderRadius: borderRadius.md,
          color: '#0a0a0f',
          fontSize: typography.fontSize.sm,
          fontWeight: typography.fontWeight.semibold,
          cursor: isProcessing || (!acknowledged) ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: spacing.xs,
        }}
      >
        {isProcessing ? (
          <>
            <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Processing...
          </>
        ) : (
          <>
            <CreditCard size={16} />
            Pay {formatPrice(amount)}
          </>
        )}
      </button>

      <p
        style={{
          marginTop: spacing.sm,
          textAlign: 'center',
          fontSize: '10px',
          color: colors.text.muted,
        }}
      >
        Secure payment by Stripe
      </p>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </form>
  );
}
