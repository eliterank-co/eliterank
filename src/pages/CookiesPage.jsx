/**
 * CookiesPage - Cookie Policy
 *
 * Lists the actual cookies / local storage / fingerprint identifiers EliteRank
 * uses today.
 *
 * A consent banner / preferences UI is not currently shipped. When one lands,
 * re-introduce the "Manage cookie preferences" button here (calling
 * window.openCookiePreferences) and re-add the consent-preferences cookie to
 * the essential cookies table below.
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
  h3: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: spacing[2],
    marginTop: spacing[5],
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
  tableWrap: {
    overflowX: 'auto',
    marginBottom: spacing[4],
    border: `1px solid ${colors.border.primary}`,
    borderRadius: borderRadius.lg,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: typography.fontSize.sm,
  },
  th: {
    textAlign: 'left',
    padding: `${spacing[2]} ${spacing[3]}`,
    background: colors.background.card,
    color: colors.text.primary,
    fontWeight: typography.fontWeight.semibold,
    borderBottom: `1px solid ${colors.border.primary}`,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: `${spacing[2]} ${spacing[3]}`,
    color: colors.text.secondary,
    borderBottom: `1px solid ${colors.border.secondary}`,
    verticalAlign: 'top',
    lineHeight: typography.lineHeight.relaxed,
  },
  tdMono: {
    fontFamily: typography.fontFamily.mono,
    color: colors.text.primary,
    whiteSpace: 'nowrap',
  },
  contactBox: {
    marginTop: spacing[3],
    padding: spacing[4],
    background: colors.background.card,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.primary}`,
  },
};

function CookieTable({ rows }) {
  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Provider</th>
            <th style={styles.th}>Purpose</th>
            <th style={styles.th}>Expiration</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.name}>
              <td style={{ ...styles.td, ...styles.tdMono }}>{r.name}</td>
              <td style={styles.td}>{r.provider}</td>
              <td style={styles.td}>{r.purpose}</td>
              <td style={styles.td}>{r.expiration}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const essential = [
  { name: 'sb-*-auth-token', provider: 'Supabase', purpose: 'Maintains your authenticated session and keeps you signed in.', expiration: '1 hour (rolling refresh) / up to 1 year' },
  { name: 'sb-*-auth-token-code-verifier', provider: 'Supabase', purpose: 'Protects the OAuth / PKCE login flow against interception.', expiration: 'Session' },
  { name: 'eliterank-anon-voted-v2-*', provider: 'EliteRank (localStorage)', purpose: 'Tracks anonymous votes already cast so the same person is not double-charged the free vote credit.', expiration: 'Persistent until cleared' },
  { name: 'chunk-error-reload', provider: 'EliteRank (sessionStorage)', purpose: 'Prevents an infinite reload loop when a deployment changes JS chunk hashes mid-session.', expiration: 'Session' },
];

const functional = [
  { name: 'visitorId (browser fingerprint)', provider: 'FingerprintJS', purpose: 'Generates a stable browser identifier from publicly readable browser characteristics to detect duplicate accounts and fraudulent voting. Not a traditional cookie.', expiration: 'Re-derived per visit' },
];

const analytics = [
  { name: '_vercel_speed_insights', provider: 'Vercel', purpose: 'Collects anonymized page-load performance metrics so we can keep the Service fast.', expiration: 'Session' },
];

const errorMonitoring = [
  { name: 'sentry-trace / baggage', provider: 'Sentry', purpose: 'Sent as request headers to correlate errors and performance traces across the front end and back end. Not stored on your device.', expiration: 'Per request' },
];

export default function CookiesPage() {
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

        <h1 style={styles.title}>Cookie Policy</h1>
        <p style={styles.updated}>Last Updated: September 18, 2026</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>1. About This Policy</h2>
          <p style={styles.p}>
            This Cookie Policy explains how <span style={styles.strong}>Most Eligible LLC</span> ("EliteRank,"
            "we," "us," or "our") uses cookies and similar technologies when you visit eliterank.co or use our
            services (collectively, the "Service"). This Cookie Policy supplements our{' '}
            <a onClick={() => navigate('/privacy')} style={styles.link}>Privacy Policy</a>.
          </p>
          <p style={styles.p}>
            We use the cookies and similar technologies described in this Policy. Strictly necessary technologies
            are required for the Service to work and are used on the basis of our legitimate interests in operating
            a secure, functional service. We do not currently set advertising or marketing cookies that require
            consent. If we add technologies that require consent, we will introduce a consent banner, request your
            consent before setting them, and update this Policy. You can also control cookies through your browser
            settings as described in Section 5.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. What Are Cookies and Similar Technologies?</h2>
          <p style={styles.p}>
            <span style={styles.strong}>Cookies</span> are small text files placed on your device when you visit a
            website. They let websites remember your actions and preferences (such as login, language, and other
            display preferences) so you don't have to re-enter them on every visit.
          </p>
          <p style={styles.p}>
            Cookies can be <span style={styles.strong}>session</span> (deleted when you close the browser) or{' '}
            <span style={styles.strong}>persistent</span> (kept until they expire or you delete them). They can also
            be <span style={styles.strong}>first-party</span> (set by EliteRank) or <span style={styles.strong}>
            third-party</span> (set by a service we use).
          </p>
          <p style={styles.p}>
            We also use closely related technologies including:
          </p>
          <ul style={styles.ul}>
            <li style={styles.li}><span style={styles.strong}>HTML5 local storage and sessionStorage</span> &mdash; key/value storage in your browser used for purposes similar to cookies;</li>
            <li style={styles.li}><span style={styles.strong}>Browser fingerprinting</span> &mdash; a derived identifier based on publicly readable browser characteristics, used for fraud prevention only;</li>
            <li style={styles.li}><span style={styles.strong}>Web beacons / pixels</span> &mdash; small images used to measure email delivery and open rates for transactional messages;</li>
            <li style={styles.li}><span style={styles.strong}>SDKs and embedded scripts</span> &mdash; from our service providers (such as Stripe and Sentry) that may set their own cookies when their features are used.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. How We Use Cookies</h2>

          <h3 style={styles.h3}>3.1 Strictly Necessary (Essential)</h3>
          <p style={styles.p}>
            These cookies and storage entries are required for the Service to function and cannot be disabled in our
            systems. They are usually set in response to actions you take, such as signing in, voting, or setting
            preferences.
          </p>
          <CookieTable rows={essential} />

          <h3 style={styles.h3}>3.2 Functional / Fraud Prevention</h3>
          <p style={styles.p}>
            These technologies protect the integrity of competitions by detecting duplicate accounts and abusive
            voting patterns. They are not used for advertising and are not shared with third parties for marketing
            purposes. Because they are used for fraud prevention and platform security rather than advertising, we
            rely on our legitimate interests to operate them. Blocking the underlying browser-fingerprint script
            through your browser or an extension may limit your ability to participate in certain voting flows.
          </p>
          <CookieTable rows={functional} />

          <h3 style={styles.h3}>3.3 Analytics &amp; Performance</h3>
          <p style={styles.p}>
            These cookies and signals collect anonymized information about how visitors use the Service so we can
            measure performance and improve features.
          </p>
          <CookieTable rows={analytics} />

          <h3 style={styles.h3}>3.4 Error and Performance Monitoring</h3>
          <p style={styles.p}>
            Headers used by Sentry to correlate errors and traces. These are sent only as part of normal requests and
            are not stored on your device.
          </p>
          <CookieTable rows={errorMonitoring} />

          <h3 style={styles.h3}>3.5 Marketing / Advertising</h3>
          <p style={styles.p}>
            <span style={styles.strong}>We do not currently use marketing or advertising cookies on the Service.</span>{' '}
            If we add any in the future, we will update this Cookie Policy and request your consent where required by
            law before setting them.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. Third-Party Cookies</h2>
          <p style={styles.p}>
            Some of our service providers may set their own cookies when their features are loaded on the Service.
            Their cookies are governed by their own privacy policies:
          </p>
          <ul style={styles.ul}>
            <li style={styles.li}><span style={styles.strong}>Stripe</span> (payments &mdash; only when you open the checkout flow): <a href="https://stripe.com/cookies-policy/legal" target="_blank" rel="noopener noreferrer" style={styles.link}>stripe.com/cookies-policy/legal</a></li>
            <li style={styles.li}><span style={styles.strong}>Supabase</span> (auth and storage): <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={styles.link}>supabase.com/privacy</a></li>
            <li style={styles.li}><span style={styles.strong}>Vercel</span> (hosting and performance): <a href="https://vercel.com/legal/privacy-policy" target="_blank" rel="noopener noreferrer" style={styles.link}>vercel.com/legal/privacy-policy</a></li>
            <li style={styles.li}><span style={styles.strong}>OneSignal</span> (email / push delivery): <a href="https://onesignal.com/privacy_policy" target="_blank" rel="noopener noreferrer" style={styles.link}>onesignal.com/privacy_policy</a></li>
            <li style={styles.li}><span style={styles.strong}>Sentry</span> (error monitoring): <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer" style={styles.link}>sentry.io/privacy</a></li>
            <li style={styles.li}><span style={styles.strong}>FingerprintJS</span> (fraud prevention): <a href="https://fingerprint.com/privacy-policy/" target="_blank" rel="noopener noreferrer" style={styles.link}>fingerprint.com/privacy-policy</a></li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. Managing Your Cookie Preferences</h2>
          <p style={styles.p}>
            You can control cookies in your browser settings. Disabling essential cookies may prevent parts of the
            Service from functioning. Browser-level instructions:
          </p>
          <ul style={styles.ul}>
            <li style={styles.li}><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" style={styles.link}>Google Chrome</a></li>
            <li style={styles.li}><a href="https://support.mozilla.org/en-US/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer" style={styles.link}>Mozilla Firefox</a></li>
            <li style={styles.li}><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471" target="_blank" rel="noopener noreferrer" style={styles.link}>Apple Safari</a></li>
            <li style={styles.li}><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer" style={styles.link}>Microsoft Edge</a></li>
          </ul>
          <p style={styles.p}>
            We do not sell personal information and do not share it for cross-context behavioral advertising, so
            there is no "Do Not Sell or Share My Personal Information" opt-out to exercise. Where required by
            applicable law, we treat a Global Privacy Control (GPC) browser signal as a valid opt-out request and,
            where required, will confirm that it has been honored. See our{' '}
            <a onClick={() => navigate('/privacy')} style={styles.link}>Privacy Policy</a> for more information
            about your choices and rights.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>6. Changes to This Cookie Policy</h2>
          <p style={styles.p}>
            We may update this Cookie Policy from time to time to reflect changes in our practices, the cookies we
            use, or for other operational, legal, or regulatory reasons. We will post the revised Cookie Policy with
            an updated "Last Updated" date. Please review it periodically.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>7. Contact</h2>
          <p style={styles.p}>Questions about this Cookie Policy? Contact us:</p>
          <div style={styles.contactBox}>
            <p style={{ ...styles.p, fontWeight: typography.fontWeight.semibold, color: colors.text.primary, marginBottom: spacing[1] }}>Most Eligible LLC</p>
            <p style={{ ...styles.p, marginBottom: spacing[1] }}>c/o Registered Agent</p>
            <p style={{ ...styles.p, marginBottom: spacing[1] }}>1 W Old State Capitol Plaza, Suite 805</p>
            <p style={{ ...styles.p, marginBottom: spacing[1] }}>Springfield, IL 62701</p>
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
