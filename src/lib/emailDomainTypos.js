/**
 * Recipient-domain typo detection for the nomination flow.
 *
 * WHY THIS EXISTS (consequence first)
 * A deliverability audit in 2026-08 measured a 24.4% hard-bounce rate on
 * `nominee_invite` (19 of 78 sends in an 8-day window) — the worst of any
 * email this app sends, against a ~2% level where mailbox providers begin
 * throttling. At current volume that is roughly 15 people per week who are
 * nominated and never find out.
 *
 * The cause is first contact: 10.5% of addresses receiving their first-ever
 * email bounced, while addresses that had already received one bounced 0%.
 * Nomination is pure first contact — a nominator types a stranger's address
 * and we mail it immediately, with no prior delivery to vouch for it. Traced
 * examples include `gamil.com`, `gmail.con`, `hotmail.con` and `yahoo.cm`,
 * all of which `<input type="email">` accepts because they are syntactically
 * valid.
 *
 * DELIBERATELY AN EXPLICIT MAP, NOT FUZZY MATCHING
 * Edit-distance scoring against popular providers produces false positives on
 * legitimate regional domains — `yahoo.ca`, `yahoo.es` and `hotmail.es` all
 * appear in real recipient data and sit one or two edits from a "correct"
 * domain. Every entry below is a domain that resolves to no mailbox provider
 * at all, so a real nominee can never be flagged.
 */

/** Misspelled domain -> the domain the nominator almost certainly meant. */
const DOMAIN_CORRECTIONS = {
  // gmail
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.comm': 'gmail.com',
  // hotmail
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'hotmall.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  // yahoo
  'yahooo.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.om': 'yahoo.com',
  // outlook
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.cm': 'outlook.com',
  // icloud
  'iclod.com': 'icloud.com',
  'iclould.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'icloud.con': 'icloud.com',
  // aol
  'aol.co': 'aol.com',
  'aol.con': 'aol.com',
};

/**
 * The corrected address when the domain is a known typo, otherwise null.
 *
 * Returns the whole address rather than just the domain so the caller can put
 * a one-tap fix in front of the nominator — "did you mean ada@gmail.com" is
 * actionable in a way that "did you mean gmail.com" is not.
 *
 * ADVISORY ONLY. Callers must not block submission on this: the nomination
 * flow is live production, and a suggestion that cannot be dismissed would
 * turn any future false positive into a lost nomination.
 */
export function suggestEmailCorrection(email) {
  const normalised = String(email ?? '').trim().toLowerCase();
  const at = normalised.lastIndexOf('@');
  if (at <= 0 || at === normalised.length - 1) return null;

  const local = normalised.slice(0, at);
  const domain = normalised.slice(at + 1);

  const corrected = DOMAIN_CORRECTIONS[domain];
  if (!corrected) return null;

  return `${local}@${corrected}`;
}

/** Exported for the test that asserts the map never shadows a real domain. */
export const KNOWN_TYPO_DOMAINS = Object.keys(DOMAIN_CORRECTIONS);
