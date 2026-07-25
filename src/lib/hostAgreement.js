import { supabase } from './supabase';

/**
 * Promoter / Master (Host) Agreement.
 *
 * The Sponsor-of-record ORGANIZATION must accept this agreement BEFORE it can
 * connect Stripe, and acceptance (current version) + Stripe verification are
 * both required before a competition can be published (§ host onboarding flow).
 *
 * Acceptance is recorded org-level, versioned, hashed and timestamped via the
 * `accept_master_agreement` RPC (migration 083). We store a SHA-256 hash of the
 * EXACT text below so we can always prove which wording was agreed to.
 *
 * This is the FINALIZED agreement text (inserted from the approved EliteRank
 * Host Agreement, 2026-06). BUMP `HOST_AGREEMENT_VERSION` whenever the text
 * changes (a new version forces hosts to re-accept and re-gates publishing
 * until they do).
 *
 * ⚠️ DOC-AHEAD-OF-PRODUCT (tracked in #590): some clauses still describe behavior
 * the platform does not fully perform yet. Keep them in sync as the product
 * catches up:
 *   • §5.6 — human winner confirmation → product auto-crowns today (#581)
 *   • §13.1 — refund assistance       → refunds are manual today (#587), self-hedged
 * §9.3 now describes the UNIFORM ROLLING PAYOUT DELAY that connect-onboard actually
 * applies (HOST_PAYOUT_DELAY_DAYS, default 14) to new and existing accounts, so it
 * is no longer doc-ahead. The discretionary payout-pause + reserve model (former
 * §9.3/§13.3) was removed in 2026-07-v1.
 */

export const HOST_AGREEMENT_VERSION = '2026-07-v1';

export const HOST_AGREEMENT_TITLE = 'EliteRank Host Agreement';

export const HOST_AGREEMENT_BODY = `EliteRank Host Agreement
Organizer / Promoter Agreement — accepted by an Organization before its competitions are published

This Host Agreement (the "Agreement") is between Most Eligible LLC, doing business as EliteRank ("EliteRank," "we," "us"), and the organization or individual that accepts it (the "Organizer," "you"). It governs your use of the EliteRank platform to create, configure, publish, and operate competitions. By accepting this Agreement electronically, you agree to be bound by it. No competition you create will be published to the public until (a) this Agreement is accepted, (b) your identity has been verified, and (c) the competition's Official Rules have been accepted.

Background
A. EliteRank operates a technology platform providing the software and administrative infrastructure that lets organizers run skill-based competitions with public voting.
B. EliteRank is a neutral technology and administration provider. It is not the sponsor, promoter, operator, or host of any competition, is not a party to any prize, and does not award, fund, fulfill, or guarantee any prize.
C. The Organizer wishes to use the platform to create and operate one or more competitions and is the sponsor and promoter of record for each one.
D. The parties therefore agree as follows.

1. Definitions
"Platform" means the EliteRank website, applications, APIs, and related services.
"Competition" means a contest the Organizer configures and operates on the Platform.
"Organizer / Sponsor of Record" means the legal entity or individual that creates and operates a Competition and is solely responsible for it. Where the Organizer is an organization, this Agreement binds the organization; individuals it assigns to operate Competitions act under the organization's authority and this Agreement and are not separate sponsors of record.
"Contestant" means an individual who enters, or is nominated into, a Competition.
"Voter" means a person who casts a free or paid vote.
"Prize Sponsor" means a third party that furnishes a prize for a Competition.
"Prize" means any award offered to a winner of a Competition.
"Determining Round" means the round in which the winner(s) of a Competition are finally determined.
"AMOE" means a genuine free alternate method of voting of equal weight to a paid vote.
"Official Rules" means the rules for a Competition assembled through the Platform and accepted by the Organizer.
"Platform Fee" means the fee EliteRank charges as set out in the then-current fee schedule.

2. The Platform's Role — Infrastructure Only
2.1 EliteRank provides competition infrastructure only. EliteRank is a technology and administration provider and is not the sponsor, promoter, operator, host, or organizer of any Competition.
2.2 Prize sourcing, fulfillment, delivery, and any associated tax-reporting obligations (including IRS Form 1099 or equivalents) are the sole responsibility of the Organizer and/or the Prize Sponsors. EliteRank is not a payor, fulfillment agent, escrow, or party to any Prize, and does not hold, fund, deliver, or guarantee any Prize.
2.3 EliteRank does not determine the winner of any Competition. The Organizer operates the judging and confirms the winner (clause 5).
2.4 EliteRank may provide tools (for example, rules assembly, anti-fraud, tax calculation, and payment processing through third parties). Providing a tool does not make EliteRank responsible for the underlying obligation, which remains the Organizer's.
2.5 The Platform provides certain controls that support lawful operation — including age confirmation collected by attestation at signup and entry, structural configuration checks designed to support the integrity requirements in clause 5, and, where enabled, tax-calculation tooling. These controls do not make EliteRank the operator of any Competition, do not transfer to EliteRank any responsibility allocated to the Organizer, and are not a guarantee that a given Competition complies with all applicable law. EliteRank does not screen or block participants by jurisdiction; responsibility for lawful participation rests with the Organizer (clause 10.2).

3. Organizer as Sponsor of Record
3.1 The Organizer is the sponsor and promoter of record for each Competition it creates and is solely legally responsible for that Competition, including its lawful operation, its prizes, its contestants, and all communications and obligations to contestants, voters, and winners.
3.2 Where the Organizer is an organization, qualification and verification occur once at the organization level. The organization may assign individuals to operate Competitions; those individuals must be verified members of the organization, act under the organization's authority and this Agreement, and are not separate sponsors of record. The Organizer is fully responsible and liable for the acts and omissions of every individual it assigns, as if they were the Organizer's own, and the Platform records which individual takes each material action.
3.3 Presenting or prize sponsors named in a Competition are not the sponsor of record and do not assume the Organizer's responsibilities, except that a Prize Sponsor is responsible for the Prize it furnishes (clause 7).

4. Eligibility, Identity Verification & Publication Gate
4.1 Before any Competition is published, the Organizer must (a) accept this Agreement; (b) complete identity and business verification through our payments partner, Stripe ("KYC"); and (c) accept the Competition's Official Rules.
4.2 Identity and tax information are collected and held by Stripe. EliteRank stores only verification status and does not store raw government identifiers (such as SSN or EIN). Failure to complete or maintain verification means the Organizer may not publish or operate Competitions.
4.3 EliteRank may decline, suspend, or remove any Organizer or Competition that does not meet these requirements or this Agreement.

5. Competition Structure & Integrity Requirements
5.1 Skill-based determination. Each Competition must be a genuine contest of skill in which a panel of judges controls at least sixty percent (60%) of the Determining Round. The winner must be determined by the judging structure, not by chance.
5.2 Effect of votes. The judging panel controls the determining result for all Contestants. Public votes may influence, but must not control, the Determining Round, and cannot by themselves move any Contestant from winner to non-winner or vice versa.
5.3 Free alternate method. Any Competition that offers paid voting must also offer a genuine, equally-weighted free method of voting (AMOE).
5.4 Minimum age. Contestants must be at least eighteen (18) years old.
5.5 Photo and approval. Each entry includes a photo, and the Organizer reviews and approves which Contestants are accepted.
5.6 Human winner confirmation. A human acting for the Organizer confirms the winner; winners are never automatically crowned by the Platform.
5.7 No misrepresentation. The Organizer must not misrepresent the nature of a Competition, the role of votes, the prizes, or the basis or odds of winning.
5.8 Records. The Platform retains the judging record (panel, criteria, scores, and winner confirmation) as a byproduct of operation; the Organizer must not circumvent or falsify it.

6. Official Rules & Disclosure
6.1 Each Competition's Official Rules are assembled through the Platform and must be accepted by the Organizer before publication; acceptance is recorded with a timestamp.
6.2 The Organizer is responsible for the accuracy of all Competition details it provides, including prize descriptions and approximate values, eligibility, dates, and the winner-determination method.
6.3 The Organizer must make all disclosures required by applicable law, including the number and approximate value of prizes, the basis on which the winner is determined, the contest dates, and eligibility.

7. Prizes
7.1 Prizes are furnished and fulfilled by Prize Sponsors and/or by the Organizer — never by EliteRank. The typical model is that a Prize Sponsor furnishes a Prize and delivers it directly to the winner.
7.2 Layered prize responsibility. The Organizer warrants that all advertised prizes are real, accurately described, and lawfully offered. As between the parties to a Prize: a Prize Sponsor that furnishes a Prize is responsible for furnishing, delivering, and reporting that Prize; and the Organizer, as sponsor of record, is accountable to the winner for ensuring the advertised Prize is in fact delivered (whether by itself or by its Prize Sponsor). A winner may therefore look to the furnishing Prize Sponsor and/or the Organizer for a Prize; the winner may not look to EliteRank, which is not in the prize chain (clause 2.2).
7.3 EliteRank does not hold, fund, deliver, escrow, or guarantee any Prize, and is not liable for any Prize that is not delivered, is misdescribed, or is unlawful.
7.4 "No cash value," non-transferability, and similar designations are contractual restrictions on the winner and do not affect tax treatment.

8. Taxes
8.1 The party that furnishes each Prize — typically the Prize Sponsor, or the Organizer for a Prize it adds — is responsible for that Prize's tax reporting and withholding, including issuing IRS Form 1099 (or equivalents) where required and determining fair market value. EliteRank is never the payor and bears no prize tax-reporting obligation. (For U.S. prizes awarded after December 31, 2025, the 1099-MISC prize-reporting threshold is $2,000; it is $600 for 2025 prizes.)
8.2 Transaction taxes on vote revenue — U.S. sales/use tax, Canadian GST/HST (and provincial equivalents), and, for other non-U.S. voters, VAT/GST (for example, EU OSS, UK VAT, and Australia GST) — are the Organizer's responsibility as merchant of record. EliteRank may provide tax-calculation tooling (such as Stripe Tax) to assist, but the obligation remains the Organizer's.
8.3 Winners may owe tax on prizes regardless of any designation. The Organizer and/or Prize Sponsor, not EliteRank, addresses any winner tax reporting.

9. Payments, Fees, Reserves & Chargebacks
9.1 Payments are processed by Stripe under the Organizer's connected account. The Organizer is the merchant of record, and funds settle to the Organizer's account.
9.2 EliteRank charges the Platform Fee set out in the then-current fee schedule. As of the Effective Date, the Platform Fee is fifteen percent (15%) of vote revenue (the Organizer keeps 85%). Stripe processing fees are separate. The Platform Fee that applies to a Competition is fixed when that Competition is published and will not change while it is live or in progress. EliteRank may update the fee schedule on notice, but any change applies only to Competitions the Organizer publishes after the change takes effect, and EliteRank will notify the Organizer of the change beforehand (see also clause 21.2).
9.3 The Organizer is responsible for all chargebacks, refunds, and disputes arising from its Competitions. All connected accounts are subject to a standard, uniform payout delay disclosed on the Platform: each charge is held in the Organizer's own Stripe balance for a fixed period after it settles before Stripe releases it to the Organizer's bank on a rolling basis. This delay is applied identically to every Organizer, is not set case-by-case, and exists so that funds remain available to cover the refunds and disputes the Organizer is responsible for under clause 13. Funds remain in the Organizer's own connected-account balance at all times; EliteRank does not take custody of, escrow, or hold Organizer funds. The Organizer remains responsible for maintaining sufficient balance to cover chargebacks, refunds, and disputes.
9.4 EliteRank is not responsible for the Organizer's revenue or payouts, or for any reserve or hold applied by Stripe.

10. Territory & Jurisdictional Compliance
10.1 Competitions and Contestants are currently supported in the United States and in the province of Ontario, Canada. Contestant eligibility (including residency) is collected by attestation; the Organizer is responsible for confirming eligibility and must disqualify any Contestant later found ineligible. For any Competition open to residents of Canada, a mathematical skill-testing question must be correctly answered by a Canadian resident before any prize is awarded, as required by Canadian law; this is provided through the Platform's Official Rules, and the Organizer is responsible for honoring it.
10.2 Voters may participate (free or paid) from outside the United States. The Organizer must not solicit or accept participation where prohibited by law, and all Competitions are void where prohibited. EliteRank does not warrant that participation is lawful in any particular jurisdiction.
10.3 The Organizer must comply with the laws of each jurisdiction in which it offers a Competition or solicits participation. Operating a Competition for contestants outside the supported countries is not supported and is undertaken at the Organizer's own risk.

11. Data, Privacy & Communications
11.1 The Organizer may receive contestant and voter contact information generated through its Competitions. With respect to that information, the Organizer is an independent controller and is solely responsible for its lawful collection, use, storage, and any marketing.
11.2 The Organizer must comply with all applicable privacy and anti-spam laws, including CAN-SPAM (U.S.), Canada's Anti-Spam Legislation (CASL) and PIPEDA (Canada), the GDPR / UK GDPR (EU/UK), and other applicable anti-spam and privacy laws for any non-U.S. individuals, and must obtain any consent those laws require before marketing.
11.3 The Organizer must handle contestant photographs and any biometric data in compliance with applicable law (including the Illinois Biometric Information Privacy Act, where applicable) and obtain all required consents.
11.4 The Organizer must honor data-subject and consumer requests as required by law and cooperate with EliteRank on any privacy request relating to its Competitions.
11.5 Voters and contestants are also governed by the Platform's participant-facing terms (including the Voter Terms and each Competition's Official Rules). The Organizer must not, in any Competition or communication, contradict those terms, misstate how votes work or what a vote buys, or contravene applicable consumer-protection law.

12. Organizer Conduct & Integrity
12.1 The Organizer must operate Competitions honestly and must not manipulate, rig, or falsify judging or voting, create fake entries or votes, or otherwise misuse the Platform.
12.2 The Organizer must not use the EliteRank name or marks, or any other party's name, in a misleading way, and must not impersonate any organization.
12.3 The Organizer must cooperate with EliteRank's anti-fraud, compliance, and trust-and-safety processes.

13. Cancellation, Non-Fulfillment & Abandonment
13.1 Cancellation & refunds. If a Competition is canceled before completion, is materially altered, or fails to run as published, the Organizer must promptly refund all paid votes for that Competition. Refunds are issued through Stripe from the Organizer's connected-account balance, including amounts still held under the uniform payout delay in clause 9.3. Because that delay holds only a rolling window and earlier funds may already have been paid out to the Organizer, the Organizer must maintain sufficient balance to refund all paid votes. As merchant of record, the Organizer is responsible for effecting refunds; EliteRank may assist operationally but provides no automated refund mechanism and does not fund refunds from its own assets. Free votes and AMOE entries involve no payment and are not refundable. Affected contestants and voters must be notified.
13.2 No winner where integrity fails. If the integrity of a Competition cannot reasonably be assured, no winner will be declared and paid votes will be refunded as in clause 13.1.
13.3 Abandonment. If the Organizer abandons a Competition or fails to complete it and crown its winner(s) as published, EliteRank may, as a remedy for that failure: pause or suspend further payouts to the Organizer's connected account; decline to declare a winner; remove the Competition; issue or require refunds of paid votes from the Organizer's connected-account balance; and suspend or ban the Organizer. These are remedies for a failure to run the Competition as published; they are not routine controls over the Organizer's funds, which settle to and remain in the Organizer's own account under clause 9. Prize sourcing, delivery, and fulfillment remain solely the responsibility of the Organizer and its Prize Sponsors under clauses 2.2 and 7 and are addressed there and under clause 16 — not by this clause.
13.4 The Organizer remains responsible to contestants, voters, and winners for its Competitions. EliteRank's remedies are in addition to, not in place of, the Organizer's obligations, and EliteRank's ability to effect a refund does not make it the party responsible for the refund.

14. Suspension, Removal & Publication Control
14.1 Publication of any Competition is conditioned on clauses 4 through 6. EliteRank may withhold publication of, unpublish, suspend, or remove any Competition or Organizer that violates this Agreement, applicable law, or the integrity requirements — with or without notice where needed to prevent harm.
14.2 EliteRank may modify or discontinue the Platform or any feature.

15. Representations & Warranties
15.1 The Organizer represents and warrants that: (a) it has authority to enter this Agreement and operate its Competitions; (b) it and its Competitions comply with all applicable laws; (c) all prizes are real, lawful, and will be delivered; (d) all information it provides is accurate and not misleading; and (e) it holds all rights and consents needed for the content, names, images, and data it uses.

16. Indemnification
16.1 The Organizer will defend, indemnify, and hold harmless EliteRank and its affiliates, officers, and agents from any claim, loss, liability, tax, penalty, or expense (including reasonable legal fees) arising out of or relating to: its Competitions; its prizes (including non-delivery, misdescription, and tax reporting); its contestants, voters, and winners; its communications and data practices; its breach of this Agreement; or its violation of law or third-party rights.

17. Disclaimers
17.1 The Platform is provided "as is" and "as available." To the maximum extent permitted by law, EliteRank disclaims all warranties, including merchantability, fitness for a particular purpose, and non-infringement.
17.2 EliteRank does not guarantee any level of audience, votes, revenue, entries, or outcome for any Competition. Any estimates or illustrations are not promises.

18. Limitation of Liability
18.1 To the maximum extent permitted by law, EliteRank will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits, revenue, or data.
18.2 EliteRank's total liability arising out of or relating to this Agreement will not exceed the greater of (a) the total Platform Fees the Organizer paid to EliteRank in the three (3) months before the event giving rise to the claim, or (b) USD $100.
18.3 Carve-outs. The limitation in clause 18.2 does not apply to: the Organizer's indemnification obligations (clause 16); amounts the Organizer owes EliteRank (including fees, chargebacks, and reserves); either party's breach of confidentiality or infringement of the other's intellectual property; or liability arising from a party's gross negligence, willful misconduct, or fraud. Nothing in this Agreement excludes liability that cannot be excluded under applicable law.

19. Dispute Resolution & Governing Law
19.1 This Agreement is governed by the laws of the State of Illinois, without regard to its conflict-of-laws rules.
19.2 Any dispute arising out of or relating to this Agreement will be resolved by binding arbitration administered by the American Arbitration Association under its Commercial Arbitration Rules, seated in Chicago, Illinois, on an individual basis. Each party waives any right to participate in a class, collective, or representative action. Either party may bring an individual claim in small-claims court where it qualifies.

20. Term & Termination
20.1 This Agreement applies from acceptance and continues until terminated. Either party may terminate on notice; EliteRank may suspend or terminate immediately for breach, fraud, or legal risk.
20.2 Termination does not relieve the Organizer of obligations accrued before termination (including prize delivery, taxes, chargebacks, and indemnities). Clauses that by their nature should survive (including 2, 7, 8, 16, 17, 18, and 19) survive termination.

21. Miscellaneous
21.1 Entire agreement. This Agreement, together with the then-current fee schedule and the Official Rules (each incorporated by reference), is the entire agreement on its subject matter.
21.2 Changes. EliteRank may update this Agreement. For material changes, EliteRank will give at least thirty (30) days' notice, and the Organizer may terminate before the change takes effect; continued use of the Platform after the effective date constitutes acceptance.
21.3 Assignment. The Organizer may not assign this Agreement without EliteRank's consent; EliteRank may assign it to an affiliate or successor.
21.4 Relationship. The parties are independent contractors; nothing creates a partnership, agency, or joint venture.
21.5 Severability. If any provision is unenforceable, the remaining provisions stay in effect.
21.6 Electronic acceptance. Clicking to accept on the Platform, with a recorded timestamp, constitutes the Organizer's binding signature.
21.7 Notices. Notices to EliteRank must be sent to Most Eligible LLC, d/b/a EliteRank, Attn: Legal, at the mailing address and email designated for legal notices on the Platform. Notices to the Organizer will be sent to the contact details on the Organizer's account. Notice is effective on receipt.

Acceptance
By clicking to accept, the person accepting represents that they are authorized to bind the Organizer, and the Organizer agrees to this Agreement.`;

/**
 * Compute the SHA-256 hex digest of the agreement text. Used to bind an
 * acceptance to the exact wording the host saw.
 */
export async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Whether an org has accepted the CURRENT agreement version. Takes either the
 * raw org row (master_agreement_version) or the dashboard's mapped agreement
 * object ({ version }).
 */
export function hasAcceptedCurrentAgreement(orgOrAgreement) {
  const version =
    orgOrAgreement?.master_agreement_version ?? orgOrAgreement?.version ?? null;
  return version === HOST_AGREEMENT_VERSION;
}

/**
 * Record acceptance of the current agreement for an organization. Computes the
 * hash of the exact text and calls the `accept_master_agreement` RPC, which
 * authorizes the caller (owner / host / co-host) and writes the audit row +
 * org snapshot atomically. Returns the updated organization row.
 */
export async function acceptHostAgreement(organizationId) {
  if (!organizationId) throw new Error('No organization to accept for.');
  const hash = await sha256Hex(HOST_AGREEMENT_BODY);
  const { data, error } = await supabase.rpc('accept_master_agreement', {
    p_organization_id: organizationId,
    p_version: HOST_AGREEMENT_VERSION,
    p_hash: hash,
    p_user_agent:
      typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 400) : null,
  });
  if (error) throw error;
  return data;
}
