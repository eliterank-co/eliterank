/**
 * AcceptableUsePage - Acceptable Use & Community Guidelines
 *
 * The conduct baseline that supplements the Terms of Use and the Contest Terms
 * & Conditions. The Terms of Use and the Contest Terms & Conditions both
 * incorporate this policy by reference.
 *
 * Operator of record: Most Eligible LLC (Illinois, USA).
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
  pAllCaps: {
    color: colors.text.primary,
    fontSize: typography.fontSize.base,
    lineHeight: typography.lineHeight.relaxed,
    marginBottom: spacing[3],
    fontWeight: typography.fontWeight.semibold,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
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
  callout: {
    padding: spacing[4],
    background: colors.background.card,
    border: `1px solid ${colors.border.primary}`,
    borderRadius: borderRadius.lg,
    marginBottom: spacing[4],
  },
  contactBox: {
    marginTop: spacing[3],
    padding: spacing[4],
    background: colors.background.card,
    borderRadius: borderRadius.lg,
    border: `1px solid ${colors.border.primary}`,
  },
};

export default function AcceptableUsePage() {
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

        <h1 style={styles.title}>Acceptable Use &amp; Community Guidelines</h1>
        <p style={styles.updated}>Last Updated: September 18, 2026</p>

        <section style={styles.section}>
          <h2 style={styles.h2}>1. About This Policy</h2>
          <p style={styles.p}>
            This Acceptable Use &amp; Community Guidelines policy (this "Policy") describes the conduct
            required of everyone who uses the EliteRank platform operated by{' '}
            <span style={styles.strong}>Most Eligible LLC</span> ("EliteRank," "we," "us," or "our"). It
            supplements, and is incorporated into, our{' '}
            <a onClick={() => navigate('/terms')} style={styles.link}>Terms of Use</a>, our{' '}
            <a onClick={() => navigate('/contest-terms')} style={styles.link}>Contest Terms &amp; Conditions</a>, and
            our competition Official Rules.
          </p>
          <p style={styles.p}>
            Our goal is to keep EliteRank a fair, safe, and respectful place to celebrate people. You are
            responsible for reading and following this Policy. If you do not agree with it, do not use the
            Service.
          </p>
          <p style={styles.p}>
            We may update this Policy from time to time. We will post the revised Policy with a new "Last
            Updated" date. Your continued use of the Service after changes take effect constitutes acceptance.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>2. Who This Policy Applies To</h2>
          <p style={styles.p}>This Policy applies to all users of the Service, including:</p>
          <ul style={styles.ul}>
            <li style={styles.li}><span style={styles.strong}>Contestants</span> who are nominated or enter a competition;</li>
            <li style={styles.li}><span style={styles.strong}>Voters</span> who cast free or paid votes;</li>
            <li style={styles.li}><span style={styles.strong}>Hosts and Organizers</span> who create or operate competitions;</li>
            <li style={styles.li}><span style={styles.strong}>Judges</span> who score contestants; and</li>
            <li style={styles.li}>visitors and any other person who accesses the Service.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>3. Prohibited Content</h2>
          <p style={styles.p}>
            You may not upload, post, submit, or share content that, in our sole judgment:
          </p>
          <ul style={styles.ul}>
            <li style={styles.li}>is unlawful, fraudulent, or promotes illegal activity;</li>
            <li style={styles.li}>is sexually explicit, depicts minors in a sexual manner, or sexualizes any person;</li>
            <li style={styles.li}>is hateful, discriminatory, or promotes violence against any individual or group based on race, ethnicity, national origin, religion, disability, age, sex, gender identity, or sexual orientation;</li>
            <li style={styles.li}>harasses, threatens, bullies, defames, stalks, or intimidates any person;</li>
            <li style={styles.li}>is deceptive or misleading, including fake profiles, impersonation, or misrepresentation of identity or affiliation;</li>
            <li style={styles.li}>infringes or violates another person's intellectual-property, privacy, publicity, or other rights;</li>
            <li style={styles.li}>depicts another person without that person's consent where consent is required;</li>
            <li style={styles.li}>contains malware, phishing, spyware, or any other harmful code or link; or</li>
            <li style={styles.li}>is otherwise objectionable or inconsistent with the purpose of the Service.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>4. Prohibited Conduct</h2>
          <p style={styles.p}>You agree not to, and not to attempt to:</p>
          <ul style={styles.ul}>
            <li style={styles.li}>use the Service for any unlawful, fraudulent, or harmful purpose;</li>
            <li style={styles.li}>harass, threaten, defame, stalk, dox, or harm any other user;</li>
            <li style={styles.li}>impersonate any person or misrepresent your affiliation with any person or entity;</li>
            <li style={styles.li}>create multiple accounts or use a false identity to influence a competition;</li>
            <li style={styles.li}>probe, scan, or test the vulnerability of the Service, attempt to bypass any security or access control, or interfere with the Service's normal operation;</li>
            <li style={styles.li}>introduce viruses, worms, or other malicious code into the Service;</li>
            <li style={styles.li}>use automated scrapers, crawlers, or harvesters to access the Service except as expressly permitted by a robots.txt file;</li>
            <li style={styles.li}>harvest, collect, or misuse other users' personal information without authorization;</li>
            <li style={styles.li}>reverse engineer, decompile, or attempt to derive the source code of the Service, except where applicable law expressly permits;</li>
            <li style={styles.li}>use the Service to send unsolicited commercial messages, spam, or chain mail; or</li>
            <li style={styles.li}>help anyone else do any of the above.</li>
          </ul>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>5. Competition &amp; Voting Integrity</h2>
          <div style={styles.callout}>
            <p style={{ ...styles.p, marginBottom: 0 }}>
              Every competition on EliteRank is a contest of skill, and every vote must reflect genuine public
              support. Manipulating a competition undermines the contestants and the community, and is one of the
              most serious violations of this Policy.
            </p>
          </div>
          <p style={styles.p}>The following are prohibited:</p>
          <ul style={styles.ul}>
            <li style={styles.li}>votes generated by automated means (bots, scripts, or automated tools) or through fraudulent or stolen payment instruments;</li>
            <li style={styles.li}>votes followed by chargebacks, refunds, or payment reversals intended to avoid payment;</li>
            <li style={styles.li}>votes cast through multiple accounts, false identities, or any circumvention of one-person-one-account controls;</li>
            <li style={styles.li}>coordinated vote-buying outside the Platform's official vote-purchase flow;</li>
            <li style={styles.li}><span style={styles.strong}>a contestant purchasing votes for their own entry</span>, directly or indirectly, including through an account or payment method they control or through family members, household members, employees, contractors, or anyone acting at their direction or with their funding;</li>
            <li style={styles.li}>colluding with judges, sponsors, or other users to predetermine an outcome, or attempting to bribe or improperly influence a judge;</li>
            <li style={styles.li}>submitting an entry on behalf of another person without that person's consent, or entering a person who is ineligible; and</li>
            <li style={styles.li}>any other manner of casting or acquiring votes or influencing a competition not expressly permitted by the Contest Terms &amp; Conditions or the competition's Official Rules.</li>
          </ul>
          <p style={styles.p}>
            Detection methods may include payment-instrument matching, device fingerprinting, account-linkage
            analysis, and review of payment-processor receipts. See the{' '}
            <a onClick={() => navigate('/contest-terms')} style={styles.link}>Contest Terms &amp; Conditions</a>{' '}
            (Section 5.5) for the full anti-fraud terms.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>6. Enforcement</h2>
          <p style={styles.p}>
            We want to address problems proportionately and consistently. Depending on the nature and severity of
            the violation, and whether it is a repeat offense, we may take any of the following actions:
          </p>
          <ul style={styles.ul}>
            <li style={styles.li}><span style={styles.strong}>Notice or warning</span> — a request to correct the behavior;</li>
            <li style={styles.li}><span style={styles.strong}>Content action</span> — removal of or refusal to display content, and restriction of certain features;</li>
            <li style={styles.li}><span style={styles.strong}>Vote and ranking action</span> — voiding votes, reversing rankings, or adjusting a competition outcome;</li>
            <li style={styles.li}><span style={styles.strong}>Disqualification</span> — disqualifying a contestant or withholding a prize;</li>
            <li style={styles.li}><span style={styles.strong}>Suspension or termination</span> — suspending or terminating an account, with or without notice;</li>
            <li style={styles.li}><span style={styles.strong}>Host action</span> — withholding publication, unpublishing, suspending, or removing a competition or Host; and</li>
            <li style={styles.li}><span style={styles.strong}>Legal action</span> — reporting to law enforcement or taking legal steps where appropriate.</li>
          </ul>
          <p style={styles.p}>
            For serious violations — including fraud, vote manipulation, harassment, threats, sexual content
            involving minors, or illegal activity — we may act immediately and permanently, without a prior
            warning.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>7. Reporting a Violation</h2>
          <p style={styles.p}>
            If you believe content or conduct on the Service violates this Policy, contact us at{' '}
            <a href="mailto:info@eliterank.co" style={styles.link}>info@eliterank.co</a> with enough detail for us
            to investigate (what happened, where, when, and any supporting evidence). We review reports and take
            action we consider appropriate, but we may not be able to share the outcome of every investigation.
          </p>
          <p style={styles.p}>
            If you believe a report about you was made in error, you may respond using the same contact address.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>8. Appeals</h2>
          <p style={styles.p}>
            If we suspend or terminate your account or disqualify your entry, you may request a review by emailing{' '}
            <a href="mailto:info@eliterank.co" style={styles.link}>info@eliterank.co</a> within{' '}
            <span style={styles.strong}>thirty (30) days</span>, explaining why you believe the decision was
            mistaken. We will review the decision and the relevant records and respond within a reasonable time.
            Where a competition has already concluded or a prize has already been awarded or delivered, an appeal
            may not be able to change the outcome.
          </p>
          <p style={styles.p}>
            Appeals do not suspend the effect of an enforcement action unless we say otherwise, and our decisions on
            appeal are final except where applicable law provides otherwise.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>9. Law Enforcement</h2>
          <p style={styles.p}>
            We may preserve and disclose information as required by law or as described in our{' '}
            <a onClick={() => navigate('/privacy')} style={styles.link}>Privacy Policy</a>, including to comply
            with a subpoena, court order, or other lawful request, or to protect the rights, property, or safety of
            EliteRank, our users, or the public.
          </p>
        </section>

        <section style={styles.section}>
          <h2 style={styles.h2}>10. Contact</h2>
          <p style={styles.p}>Questions about this Policy or a decision made under it? Contact us:</p>
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
