# Host Agreement v2026-07-v1 — contract vs. what the code does

Reconciliation of two external documents against this repo:

- `HostAgreement_RCCB_comments_8.11.26.docx` — Evan Davis (RCCB) markup, 11 Aug 2026, two comments
- `EliteRank_Host_Agreement_Clause5_Memo.docx` — business-team memo responding to the clause 5.1 comment

Checked at commit `80ac46c`. Live database contents were **not** queried — everything below
describes the code as committed. Confirm the configuration of specific live competitions against
production before relying on it.

The marked-up text is live: `HOST_AGREEMENT_VERSION = '2026-07-v1'` in `src/lib/hostAgreement.js`
is the exact text RCCB redlined, served in-app and being accepted by hosts now. Every clause quoted
below was compared against that file and matches character for character. Accepting any redline
means bumping the constant, which by design forces every existing host to re-accept and re-gates
publishing until they do.

Related issues: #653, #590, #588, #589, #587, #586, #585, #584, #581, #531.

---

## 1. Headline

### 1.1 Entry fees do not exist — the memo's most exposed section is about an unbuilt feature

Memo §6.3 (Arizona / Florida / Maryland / Canada s. 206(1)(e)) and §7.1 (the prize-funding covenant
the memo calls the single most important structural fix) all rest on judged competitions charging
contestants an entry fee. There is no `entry_fee` column and no fee in the payment path.
`src/lib/officialRules.js:40-56` says so:

> "PURE-JUDGE competitions with a CONTESTANT ENTRY FEE (paid on acceptance). Decided product
> direction… **NOT built yet (no entry_fee field; `create-payment-intent` is vote-only)**…
> ⚠️ Lottery analysis (issue #531) MUST be redone first."

§6.3 is therefore a design review of unshipped work, not a description of live exposure. The memo's
stated premise ("a judge-only competition requires a contestant entry fee") should be corrected
before Evan drafts against it.

### 1.2 Comment 47 is right, and the breach is universal rather than occasional

`voting_rounds.judge_weight` is `NOT NULL DEFAULT 0 CHECK (judge_weight BETWEEN 0 AND 100)`
(`supabase/migrations/070_judging_system.sql:23-25`), and `competitions.selection_criteria`
defaults to `'votes'`. Pure public vote is the platform default and what the live competitions run.
Every one of them breaches clause 5.1 on publish.

### 1.3 For the competitions live today, EliteRank is the operator and merchant of record

Neither document addresses this. `supabase/migrations/20260628140000_105_managed_organizations.sql`:

> "Some competitions are run by the platform company itself (e.g. Most Eligible). For these, the
> legal Host Agreement is **signed off-platform** and payouts settle to the **company's own Stripe
> account**… Competitions under a managed org **bypass the agreement-signed and Stripe-KYC launch
> gates**."

`is_managed` is backfilled `true` for every org matching `%most eligible%` or `%elite%rank%`, and
migration 120 records that all three currently-live competitions are Most Eligible ones. On the live
estate the Organizer is EliteRank, funds settle to EliteRank's balance, and the sponsor-of-record
separation the agreement is built on describes the third-party case only. This undercuts Background
B and clauses 2.1, 2.2, 9.1 and 9.3 more directly than anything in the markup.

---

## 2. Clause by clause

| Clause | Verdict | What the code does |
| --- | --- | --- |
| **2.5** age attestation + "structural configuration checks" | Contradicted | Age attestation exists at *entry* (eligibility engine + DOB), not at *signup* — no age field anywhere in `LoginPage.jsx`. The clause-5 "structural check" is one React slider with `min={60}` (`TimelineSettings.jsx:456,470`); the DB accepts 0–100 and pure-vote rounds skip the slider. Nothing server-side checks clause 5. |
| **4.1(c) / 6.1** Official Rules accepted, timestamped | Not built | No column, RPC, timestamp or gate. `publish_to_public()` checks `master_agreement_version` and Stripe KYC only (`099_kyc_gates_publish_not_submit.sql:42-56`). Host Agreement acceptance *is* recorded properly — version, timestamp, accepting user, org-level (`083_host_master_agreement.sql:40-46`). Issue #585. |
| **4.1(a)(b)** agreement + KYC before publish | Contradicted | True for third-party organizers. Managed orgs satisfy both by flag: `(o.is_managed OR o.master_agreement_version IS NOT NULL)` (`105_managed_organizations.sql:48-71`). Defensible as policy; the clause reads as absolute. |
| **5.1** judges control ≥60% | Contradicted | `judge_weight` defaults to 0, `selection_criteria` defaults to `'votes'`. Where judges are used the 60% floor is real but client-side only (`min={60} max={100} step={5}`). |
| **5.2** votes influence but must not control | Contradicted | Final score is `(jw/100)·(judge_avg / bucket_max_judge) + ((100−jw)/100)·(votes / bucket_max_votes)` (`120_finalize_last_round_crowning_and_gender_normalization.sql:133-145`). Both terms normalise to the leader, so even at the most judge-heavy blend the platform allows (60/40) votes carry 40% of a normalised score and routinely flip adjacent contestants. The second sentence of 5.2 is false for every hybrid competition, not merely unquantified. |
| **5.3** free equally-weighted vote (AMOE) | Accurate | One free vote per voter per day; paid votes capped only at 1,000 per transaction with no cap on transactions; both count identically. The memo's objection is to the label, not the mechanic. "AMOE" also appears in 13.1 — dropping it means editing both. |
| **5.4** minimum age 18 (+ Evan's "age of majority, whichever greater") | Partly built | Flat 18 floor is real and hard-coded (`BuildCardDetailsStep.jsx:59-60`). Evan's "whichever is greater" formula is **not** implemented — `eligibility_age_min` is per-competition and the entry gate never consults residence. Ontario's 19 appears only in generated rules prose. Accepting this redline creates a build item. |
| **5.5** photo + host approval | Accurate | Matches on every entry path (nominations, applications, host upload). |
| **5.6** "winners are never automatically crowned" | Contradicted | `finalize_voting_round()` ranks, writes `competitions.winners`, and sets status `'winner'` with no human step. `WinnersManager.jsx:24-27`: "Winners are decided automatically when the final round finalizes… **Hosts don't pick them** — they just review and confirm once everything's done." There is also no scheduler: finalization runs from `ensure_round_state()` on page load (`useCompetitionPublic.js:144`), so a competition is crowned whenever a visitor next opens the page. Issue #581. |
| **5.8** judging record retained | Accurate | `judges`, `judging_criteria` (per-criterion weights) and `judge_scores` all persist; scoresheets lock on submit via RLS. Extending 5.8 to vote records is easy — the `votes` table already retains them. |
| **9.1** Organizer is MoR, funds settle to Organizer | Accurate | Implemented exactly as described — direct charge against the connected account, funds never touch a platform balance (`create-payment-intent/index.ts:212-247`). Not accurate for managed orgs, where the connected account is EliteRank's. |
| **9.2** Platform Fee fixed at publication | Unenforced | 15% is the correct default, but `platform_fee_pct` is an ordinary mutable column with no publish-time snapshot and no trigger (`082_competition_platform_fee.sql:17`). Real as policy, unenforced as code. |
| **9.3** uniform payout delay | Accurate | Best-supported clause in the agreement. 14-day rolling `delay_days` baked into every connected account at creation and re-asserted on existing ones, from a single constant. No per-host branch exists (`connect-onboard/index.ts:37-45, 201-276`). |
| **13.1** Organizer must refund all paid votes | Not built | The disclaimer ("provides no automated refund mechanism") is honest — there is no refund code in the repo. The exposure is the obligation: a cancelled competition leaves the Organizer refunding by hand in the Stripe dashboard with no list of what to refund. Issue #587. |
| **13.3** EliteRank may pause payouts / issue refunds | Not built | No mechanism exists — nothing sets a manual payout schedule, pauses payouts, or reverses a transfer. Either build it or soften to "may request". |
| **10.1** Canadian skill-testing question | Accurate | Present and correctly specified — three arithmetic operations, unaided, single attempt, time-limited, disqualification + alternate winner (`officialRules.js:352-357`, `ContestTermsPage.jsx:360-370`). Emitted whenever the competition city is in Ontario. |

---

## 3. Comment 67 — "Is this accurate?"

Evan anchored the question to one sentence, but all three of his 9.2 insertions describe the same
flow. Source: `create-payment-intent/index.ts:196-247` and migration `122_competition_hst_tax`.

| Insertion | Verdict | What the integration does |
| --- | --- | --- |
| "The Platform Fee is sent to EliteRank directly by Stripe." | **Accurate** | PaymentIntent created with `{ stripeAccount: connectedAccountId }` and an `application_fee_amount`. On a direct charge Stripe routes the application fee to the platform account. Funds never pass through an EliteRank balance — which is what makes 9.3 and 13.3's "no custody" position true. |
| Stripe fees "deducted after EliteRank's receipt of the revenue share" | **Accurate** | Correct for a direct charge: the connected account bears Stripe's processing fee, and the application fee is computed independently of it. |
| 15% of "**gross** vote revenue" | **Wrong word** | The base is the pre-tax subtotal, deliberately: `applicationFeeAmount = round(subtotalAmount × platformFeePct / 100)` where `subtotal = amount − tax`. The code is explicit this is on purpose — collected HST belongs to the host's CRA remittance and "skimming a platform cut off the tax would leave the host short." Gross of Stripe's fee, net of transaction tax. |

Suggested wording back: *"fifteen percent (15%) of vote revenue net of transaction taxes."*
All three answers describe third-party organizers only.

**Comment 47** — yes, some are pure voting; it is the default and it is what is live.

---

## 4. Where the memo's picture of the product is off

| Memo says | Verdict | Correction |
| --- | --- | --- |
| Three formats: Vote-Determined / Hybrid / Judged | Confirmed | Real, as `competitions.selection_criteria`. But advisory — nothing stops a `'votes'` competition running a judged round (`competitionRules.js:61` notes exactly this), and it does not gate the voting UI. |
| Judged competitions charge a contestant entry fee | **Not built** | No entry fee in any format. Memo §6.3 and §7.1 are forward-looking design. |
| Vote-only and hybrid contestants enter free | Confirmed | All entry is free in all three formats; generated rules say "There is no cost to enter" unconditionally. |
| 1 free vote/day, paid uncapped | Nearly | Correct in substance, but the reset is a UTC calendar day while the published rules promise the opposite — see §5.1. |
| Voters cannot win anything | Confirmed | Structurally true and stated in the Official Rules and Contest Terms: "buying votes wins the purchaser nothing." No voter-facing prize mechanic exists. |
| Judged competitions may run a paid "fan favorite" | Unimplemented | No ancillary-award concept exists. A `'judges'` competition can simply also accept paid votes, with nothing preventing them being blended into the result. Draft 5.6 needs building, not just drafting. |
| "No voter age floor stated anywhere" | **Incorrect** | `TermsPage.jsx:175` requires all users to be 18; `ContestTermsPage.jsx:187` restates it with the age-of-majority formula. The floor is stated — it is never collected or enforced. Draft 5.7(g) still stands; the rationale changes. Issue #586. |

---

## 5. What neither document caught

### 5.1 The published rules describe the free-vote reset incorrectly

Both generators tell voters free votes "renew on a rolling basis rather than at local midnight:
after casting a free vote, your next free vote becomes available no later than 24 hours later"
(`officialRules.js:301`, `competitionRules.js:123`). The implementation is a plain calendar-day
check — `created_at >= CURRENT_DATE AND created_at < CURRENT_DATE + INTERVAL '1 day'`
(`006_performance_optimizations.sql:433-450`). It does reset at a midnight, just UTC's. The
"no later than 24 hours" half survives; "rolling, not at midnight" does not.

This is a statement about how votes work, made in the document clause 6.3 requires and policed by
5.7 and 11.5 — the category the memo identifies as the real litigation vector via
*FTC v. Publishers Clearing House*. Cheapest fix is the rules text, not the code.

### 5.2 The self-purchase prohibition is written but not enforced

Contest Terms (`ContestTermsPage.jsx:308`) and the generated Official Rules
(`officialRules.js:608`) prohibit a contestant purchasing votes for their own entry. Nothing in the
payment path checks it — `create-payment-intent` never compares purchaser to contestant. The memo
flags contestant self-purchase as the fact that would most strengthen a constructive-payer theory,
which argues for a real check rather than only a clause.

### 5.3 Marketing is ahead of the product in two places

`src/pages/HostPage.jsx:35-37,91` sells entry fees as a live monetization feature ("free to apply;
contestants are charged only after you accept them") for hybrid and judged formats. Unbuilt, and it
contradicts the memo's own table, which has hybrid contestants entering free. The same page lists
charity as *Required* for public-vote competitions; `charity_percentage` is nullable with no
requirement anywhere. Both matter for draft 5.9 and the commercial co-venturer point.

### 5.4 Nothing is locked after publication

Draft 5.1 requires that the Format may not change once published. No field is locked server-side —
`selection_criteria`, `judge_weight`, `price_per_vote` and `platform_fee_pct` are all editable while
live (issue #584). Relatedly, the tie-break is `final_score DESC, votes DESC, created_at ASC`:
entry timestamp is the last resort. Deterministic, so it satisfies draft 5.4(c) for vote-determined
competitions — but it is exactly the method draft 5.2(d) and 5.3(d) would ban for judged and hybrid
ones, and it is disclosed nowhere.

---

## 6. Recommended sequence

1. **Correct the memo's entry-fee premise before Evan drafts.** Reframe §6.3 and §7.1 as
   preconditions on shipping entry fees — which matches how #531 already gates it.
2. **Decide the house-competition question.** Separate agreement for managed orgs, or an
   acknowledgement that EliteRank may itself be the Organizer. Until then Background B and clauses
   2.1, 9.1 and 9.3 do not describe the live estate.
3. **Answer comment 67 with the correction**, not just a yes: "gross" → "net of transaction taxes".
4. **Split clause 5.1 by format** as the memo proposes. The `selection_criteria` enum already exists
   to hang it on — drafting, not building.
5. **Fix 5.6 in the agreement, not the product.** "Winners are never automatically crowned" is the
   reverse of what the platform does. The clause is far cheaper to change; #581 is the more urgent
   half of that story.
6. **Build items, not drafting:** Official Rules acceptance (#585), server-side clause-5 checks
   behind 2.5, post-publish field locks (#584), refund tooling (#587), payout pause, voter age at
   purchase (#586), and the free-vote reset wording.
