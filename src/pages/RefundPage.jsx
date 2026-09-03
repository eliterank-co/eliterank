/**
 * RefundPage - Refund & Cancellation Policy
 *
 * Stripe (and most card networks) expect a clearly stated, publicly accessible
 * refund policy for a payments business. This documents what a buyer is
 * purchasing (votes — a digital good applied instantly), when purchases are
 * final, and the specific cases where EliteRank refunds automatically or on
 * request (e.g. the post-cutoff auto-refund from the paid-vote round guard).
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { colors, spacing, typography, borderRadius, transitions } from '../styles/theme';

const styles = {
  page: {
    minHeight: '100vh',
    background: colors.background.primary,
    color: colors.text.primary,
  },
  container: {
    maxWidth: '760px',
    margin: '0 auto',
    padding: `${spacing[8]} ${spacing[4]}`,
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: spacing[2],
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    marginBottom: spacing[8],
    transition: `color ${transitions.fast}`,
  },
  title: {
    fontSize: typography.fontSize['5xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.gold.primary,
    marginBottom: spacing[2],
  },
  updated: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    marginBottom: spacing[8],
  },
  section: {
    marginBottom: spacing[8],
  },
  h2: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[3],
  },
  p: {
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    marginBottom: spacing[3],
  },
  ul: {
    listStyle: 'disc',
    paddingLeft: spacing[6],
    color: colors.text.secondary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    marginBottom: spacing[3],
  },
  li: {
    marginBottom: spacing[2],
  },
  strong: {
    color: colors.text.primary,
    fontWeight: typography.fontWeight.semibold,
  },
  link: {
    color: colors.gold.primary,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  contactBox: {
    marginTop: spacing[3],
    padding: spacing[4],
    background: colors.background.card,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.primary}`,
  },
};

export default function RefundPage() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <button
          onClick={() => navigate('/')}
          style={styles.backLink}
          onMouseEnter={e => { e.currentTarget.style.color = colors.gold.primary; }}
          onMouseLeave={e => { e.currentTarget.style.color = colors.text.secondary; }}
        >
          <ArrowLeft size={16} />
          Back to EliteRank
        </button>

        <h1 style={styles.title}>Refund &amp; Cancellation Policy</h1>
        <p style={styles.updated}>Last Updated: June 13, 2026</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>1. What You Are Purchasing</h2>
          <p style={styles.p}>
            <span style={styles.strong}>Most Eligible LLC</span> ("EliteRank," "we," "us," or "our") operates an online
            platform at eliterank.co that runs social voting competitions. Members of the public can vote for
            contestants for free or <span style={styles.strong}>purchase additional votes</span>. Paid votes are a{' '}
            <span style={styles.strong}>digital good</span>: once a payment is confirmed, the votes are credited to the
            selected contestant's tally immediately and take effect in the live competition.
          </p>
          <p style={styles.p}>
            Vote pricing is shown at checkout before you pay. Where enabled, bulk vote bundles are discounted per the
            tiers displayed at the time of purchase.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. Paid Votes Are Generally Final</h2>
          <p style={styles.p}>
            Because votes are applied to a live competition the moment your payment is confirmed,{' '}
            <span style={styles.strong}>purchases of votes are generally non-refundable</span>. Voting is a voluntary
            contribution to a contestant's standing, not the purchase of a physical product or a guarantee of any
            outcome. Please review your contestant selection and vote quantity before completing checkout.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. When We Refund</h2>
          <p style={styles.p}>
            Despite Section 2, we will refund a vote purchase in the following circumstances:
          </p>
          <ul style={styles.ul}>
            <li style={styles.li}>
              <span style={styles.strong}>Payment confirmed after a voting round closed.</span> Votes are only
              counted while a round is open. If a payment is confirmed after the relevant round has already ended,
              those votes are not credited and the charge is <span style={styles.strong}>refunded in full</span> to
              your original payment method. If you don&rsquo;t see that refund within a few business days, email us at{' '}
              <a href="mailto:info@eliterank.co" style={styles.link}>info@eliterank.co</a> and we&rsquo;ll resolve it.
            </li>
            <li style={styles.li}>
              <span style={styles.strong}>Duplicate or erroneous charges.</span> If you were charged more than once for
              the same intended purchase, or charged in error, we refund the duplicate or erroneous amount.
            </li>
            <li style={styles.li}>
              <span style={styles.strong}>Technical failure.</span> If a payment is taken but, due to a verified
              technical error on our side, the corresponding votes are not credited, we will either credit the votes or
              refund the purchase.
            </li>
            <li style={styles.li}>
              <span style={styles.strong}>Unauthorized transactions.</span> If you believe a payment was made without
              your authorization, contact us promptly and we will investigate and, where confirmed, refund it.
            </li>
            <li style={styles.li}>
              <span style={styles.strong}>Where required by law.</span> Nothing in this policy limits any refund rights
              you have under applicable consumer-protection law.
            </li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. How to Request a Refund</h2>
          <p style={styles.p}>
            To request a refund or report a problem with a payment, email{' '}
            <a href="mailto:info@eliterank.co" style={styles.link}>info@eliterank.co</a> within{' '}
            <span style={styles.strong}>30 days</span> of the charge. Please include the email used at checkout, the
            approximate date and amount, the contestant or competition, and a short description of the issue. This
            information helps us locate the transaction quickly.
          </p>
          <p style={styles.p}>
            We aim to respond within <span style={styles.strong}>3 business days</span>. Approved refunds are issued to
            your <span style={styles.strong}>original payment method</span> and typically appear within{' '}
            <span style={styles.strong}>5&ndash;10 business days</span>, depending on your bank or card issuer.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. Chargebacks</h2>
          <p style={styles.p}>
            If you have a concern about a charge, please contact us first &mdash; we can usually resolve it faster than a
            bank dispute. Filing a chargeback for a legitimate, delivered purchase may result in restrictions on future
            participation. We respond to all disputes with transaction records.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>6. Sponsorships &amp; Event Tickets</h2>
          <p style={styles.p}>
            <span style={styles.strong}>Sponsorships</span> are governed by the separate written agreement between the
            sponsor and EliteRank (or the competition host); refund terms, if any, are set out there.{' '}
            <span style={styles.strong}>Event tickets</span>, where sold, are refundable if the event is canceled by the
            organizer; other ticket refunds are at the organizer's discretion unless required by law.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>7. Who Handles Refunds</h2>
          <p style={styles.p}>
            The merchant of record for a competition is its operator: <span style={styles.strong}>EliteRank</span> for
            competitions EliteRank operates directly (including Most Eligible), and the <span style={styles.strong}>
            third-party host</span> for host-run competitions. The operator is responsible for refunds, chargebacks,
            and payment disputes for its competition; for host-run competitions EliteRank acts only as a limited
            payment facilitator. Any amount EliteRank retains as a platform or service fee is non-refundable,
            including where the underlying purchase is refunded, except as required by law. A refund reduces the vote
            revenue on which a host&rsquo;s payout is calculated.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>8. Changes to This Policy</h2>
          <p style={styles.p}>
            We may update this Refund &amp; Cancellation Policy from time to time. We will post the revised policy with an
            updated "Last Updated" date. The policy in effect at the time of your purchase governs that purchase.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>9. Contact</h2>
          <p style={styles.p}>Questions about a payment or this policy? Contact us:</p>
          <div style={styles.contactBox}>
            <p style={{ ...styles.p, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, marginBottom: spacing[1] }}>Most Eligible LLC</p>
            <p style={{ ...styles.p, marginBottom: spacing[1] }}>doing business as EliteRank</p>
            <p style={{ ...styles.p, marginBottom: spacing[1] }}>Email: <a href="mailto:info@eliterank.co" style={styles.link}>info@eliterank.co</a></p>
            <p style={{ ...styles.p, marginBottom: 0 }}>
              Website: <a href="https://eliterank.co" style={styles.link}>eliterank.co</a>
            </p>
          </div>
        </section>

      </div>
    </div>
  );
}
