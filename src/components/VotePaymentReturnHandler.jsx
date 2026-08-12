import { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import * as Sentry from '@sentry/react';
import { Modal, VoteShareCard } from './ui';
import FanButton from './ui/FanButton';
import { colors, spacing, borderRadius, typography, gradients, shadows } from '../styles/theme';
import { getStripe, isStripeConfigured } from '../lib/stripe';
import { recordPaidVote } from '../lib/votes';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores';
import { useToast } from '../contexts/ToastContext';

const STRIPE_RETURN_PARAMS = ['payment_intent', 'payment_intent_client_secret', 'redirect_status', 'va'];

/**
 * Stripe redirect-based payment methods (Cash App Pay, Amazon Pay, etc.) send
 * the buyer off-site to authenticate, then redirect back to `return_url` with
 * `payment_intent_client_secret` + `redirect_status` query params. By that
 * point the VoteModal has unmounted and its `showSuccess` state is gone, so
 * the buyer never sees the share card. This handler runs at the app shell
 * level, detects the return, retrieves the PaymentIntent's metadata to learn
 * which contestant/vote count was bought, records the vote (idempotent —
 * webhook may have beaten us), and renders the same success popup the
 * VoteModal would have shown for an in-page card payment.
 */
export default function VotePaymentReturnHandler() {
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [successData, setSuccessData] = useState(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    if (!isStripeConfigured()) return;

    const params = new URLSearchParams(location.search);
    const clientSecret = params.get('payment_intent_client_secret');
    const redirectStatus = params.get('redirect_status');
    // Connected account the direct-charge PaymentIntent lives on (set by
    // PaymentCheckoutForm's return_url). Needed to retrieve it with the right
    // Stripe.js instance.
    const connectedAccountId = params.get('va');

    if (!clientSecret || !redirectStatus) return;

    handledRef.current = true;

    const stripParams = () => {
      const next = new URLSearchParams(location.search);
      STRIPE_RETURN_PARAMS.forEach((k) => next.delete(k));
      const search = next.toString();
      navigate(
        { pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash },
        { replace: true }
      );
    };

    if (redirectStatus === 'failed') {
      toast?.error?.('Payment was not completed. Please try again.');
      stripParams();
      return;
    }

    if (redirectStatus !== 'succeeded' && redirectStatus !== 'processing') {
      stripParams();
      return;
    }

    const run = async () => {
      try {
        const stripe = await getStripe(connectedAccountId);
        if (!stripe) {
          stripParams();
          return;
        }

        const { paymentIntent, error } = await stripe.retrievePaymentIntent(clientSecret);
        if (error || !paymentIntent) {
          stripParams();
          return;
        }

        const metadata = paymentIntent.metadata || {};
        const contestantId = metadata.contestant_id;
        const competitionId = metadata.competition_id;

        // Not one of our vote PaymentIntents — bail without showing anything.
        if (!contestantId || !competitionId) {
          stripParams();
          return;
        }

        if (paymentIntent.status !== 'succeeded' && paymentIntent.status !== 'processing') {
          if (paymentIntent.status === 'requires_payment_method') {
            toast?.error?.('Payment was not completed. Please try again.');
          }
          stripParams();
          return;
        }

        const isDoubleVoteDay = metadata.is_double_vote_day === 'true';
        const rawVoteCount = parseInt(metadata.vote_count, 10) || 1;
        const creditedVoteCount =
          parseInt(metadata.credited_vote_count, 10) ||
          (isDoubleVoteDay ? rawVoteCount * 2 : rawVoteCount);

        const { data: contestant } = await supabase
          .from('contestants')
          .select('id, name, avatar_url')
          .eq('id', contestantId)
          .maybeSingle();

        if (!contestant) {
          stripParams();
          return;
        }

        const { data: competition } = await supabase
          .from('competitions')
          .select('id, name, season')
          .eq('id', competitionId)
          .maybeSingle();

        // Mirror VoteModal.handlePaymentSuccess: authenticated voters get a
        // client-side write for instant feedback; anonymous voters rely on
        // the stripe-webhook so voter_email comes from billing details.
        if (isAuthenticated && user?.id && paymentIntent.status === 'succeeded') {
          await recordPaidVote({
            paymentIntentId: paymentIntent.id,
            competitionId,
            contestantId,
            voteCount: creditedVoteCount,
            amountPaid: (paymentIntent.amount || 0) / 100,
            taxAmount: (parseInt(metadata.tax_amount, 10) || 0) / 100,
            voterEmail: user?.email,
            isDoubleVote: isDoubleVoteDay,
          });
        }

        stripParams();

        setSuccessData({
          contestant,
          competition,
          votesAdded: creditedVoteCount,
          processing: paymentIntent.status === 'processing',
        });
      } catch (err) {
        Sentry.captureException(err, { tags: { stage: 'vote-payment-return' } });
        stripParams();
      }
    };

    run();
  }, [location.pathname, location.search, location.hash, navigate, toast, isAuthenticated, user?.id, user?.email]);

  if (!successData) return null;

  const { contestant, competition, votesAdded, processing } = successData;
  const handleClose = () => setSuccessData(null);

  return (
    <Modal isOpen onClose={handleClose} title="" maxWidth="380px" centered variant="gold">
      <div style={{ textAlign: 'center', padding: `${spacing.xl} ${spacing.lg} ${spacing.xxl}` }}>
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
            {contestant.avatar_url ? (
              <img
                src={contestant.avatar_url}
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

        <h2
          style={{
            fontSize: typography.fontSize.xl,
            fontWeight: typography.fontWeight.bold,
            color: colors.text.primary,
            marginBottom: spacing.xs,
          }}
        >
          {processing ? 'Payment Processing' : 'Vote Submitted!'}
        </h2>
        <p style={{ fontSize: typography.fontSize.md, color: colors.text.secondary, marginBottom: spacing.xl }}>
          {processing ? (
            <>
              Your payment is processing. We'll credit{' '}
              <span style={{ color: colors.gold.primary, fontWeight: typography.fontWeight.semibold }}>
                {contestant.name}
              </span>{' '}
              {votesAdded} {votesAdded > 1 ? 'votes' : 'vote'} once it clears.
            </>
          ) : (
            <>
              You gave{' '}
              <span style={{ color: colors.gold.primary, fontWeight: typography.fontWeight.semibold }}>
                {contestant.name}
              </span>{' '}
              {votesAdded} {votesAdded > 1 ? 'votes' : 'vote'}
            </>
          )}
        </p>

        {isAuthenticated && contestant?.id && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: spacing.xs,
              padding: spacing.md,
              background: 'rgba(212,175,55,0.08)',
              borderRadius: borderRadius.lg,
              marginBottom: spacing.md,
            }}
          >
            <p style={{ fontSize: typography.fontSize.sm, color: colors.text.secondary, margin: 0 }}>
              Follow {contestant.name?.split(' ')[0]}'s journey?
            </p>
            <FanButton contestantId={contestant.id} contestantName={contestant.name} />
            <p style={{ fontSize: typography.fontSize.xs, color: colors.text.muted, margin: 0 }}>
              Get weekly updates on their progress
            </p>
          </div>
        )}

        <VoteShareCard
          contestant={contestant}
          competition={competition || { name: 'Most Eligible' }}
          voteCount={votesAdded}
        />

        <button
          onClick={handleClose}
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
