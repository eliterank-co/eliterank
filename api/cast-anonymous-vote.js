/**
 * POST /api/cast-anonymous-vote
 *
 * Lets a logged-out visitor cast a free daily vote for a contestant by
 * providing email + first/last name. We create (or reuse) a lightweight
 * Supabase auth user so votes dedup on voter_id like authenticated voting.
 * No email is sent on success — the voter sees the share/become-a-fan
 * modal in-context and that's the end of the flow.
 *
 * Bot/fraud protection is layered:
 *   1. Honeypot field (`company`) — bots fill hidden fields
 *   2. Min-submit-time check — bots submit in <1s
 *   3. Browser fingerprint + IP — 1 free vote per device per competition per day
 *      (skipped for social-media in-app webviews where FP is too collision-prone)
 *   4. Email-based daily dedup — same voter_id, same competition, last 24h
 *   5. Per-IP rate limit — max 10 distinct emails per 24h (backup)
 *   6. Vercel BotID — invisible bot detection (optional)
 *
 * Env vars required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   APP_URL
 *   BOTID_ENABLED              (optional, "true" to enforce Vercel BotID)
 *   ANONYMOUS_VOTE_IP_LIMIT    (optional, defaults to 10)
 */

import { createClient } from '@supabase/supabase-js';
import { isSuspiciouslyFast, MIN_SUBMIT_MS } from './_vote-timing.js';
import { shouldRejectHoneypot } from './_honeypot.js';

const HELP = 'info@eliterank.co';
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const DEFAULT_IP_LIMIT = 10;

function getClientIp(request) {
  const fwd = request.headers['x-forwarded-for'] || request.headers['x-real-ip'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  if (Array.isArray(fwd)) return fwd[0];
  return request.socket?.remoteAddress || 'unknown';
}

// Open-source FingerprintJS produces colliding visitor IDs in social-media
// in-app browsers (Instagram, Facebook, TikTok, …) — canvas/audio APIs are
// stripped, so many distinct users share a fingerprint. Pairing FP with IP
// helped, but mobile carriers' CGNAT means cellular voters on the same
// carrier can still share an external IP, so the FP+IP combo also collides.
// For these UAs we skip the device dedup entirely and rely on email-based
// dedup (per voter_id) + the per-IP email cap as the fraud nets.
function isInAppWebview(request) {
  const ua = request.headers['user-agent'] || '';
  if (!ua) return false;
  return /Instagram|FBAN|FBAV|FB_IAB|FBIOS|BytedanceWebview|musical_ly|aweme|TikTok|Snapchat|LinkedInApp|Pinterest|Twitter/i.test(ua);
}

async function hashIp(ip) {
  const encoder = new TextEncoder();
  const data = encoder.encode(ip + '|eliterank-vote-salt');
  const buf = await (globalThis.crypto?.subtle?.digest('SHA-256', data));
  if (!buf) return ip; // fallback — still rate-limits, just not hashed
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Salted, truncated SHA-256. Lets the logs COUNT distinct values without
// recording them: a bot reuses one payload across many submissions, where N
// real voters produce N different values. The honeypot may hold an
// organization the browser had saved, which is the voter's PII, so the value
// itself must never reach a log line.
async function shortHash(value) {
  const data = new TextEncoder().encode(String(value) + '|eliterank-vote-salt');
  const buf = await (globalThis.crypto?.subtle?.digest('SHA-256', data));
  if (!buf) return 'nohash';
  return Array.from(new Uint8Array(buf))
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function checkIpRateLimit(supabase, ipHash, email, limit) {
  const cutoffIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('anonymous_vote_rate_limits')
    .select('email')
    .eq('ip_hash', ipHash)
    .gte('created_at', cutoffIso);

  if (error) {
    // Fail-open on lookup errors so a DB hiccup doesn't block all anonymous
    // voting, but log loudly so it's visible in monitoring.
    console.error('Rate limit lookup failed (allowing vote):', error);
    return { allowed: true, skipped: true };
  }

  const distinctEmails = new Set((data || []).map((r) => r.email));
  if (distinctEmails.size >= limit && !distinctEmails.has(email)) {
    // Limit is set high enough (default 10) that small friend groups on the
    // same WiFi all get through — this only fires for unusually large bursts.
    return {
      allowed: false,
      reason: `More than ${limit} people have already voted from this network in the last 24 hours, so free voting from it is paused. This usually means shared Wi\u2011Fi or a mobile carrier that many people share. Free voting reopens within 24 hours, paid votes work now, and if you think this is a mistake email ${HELP}.`,
    };
  }
  return { allowed: true };
}

async function recordIpRateLimit(supabase, ipHash, email, fingerprint, competitionId) {
  const { error } = await supabase
    .from('anonymous_vote_rate_limits')
    .insert({ ip_hash: ipHash, email, fingerprint, competition_id: competitionId });
  if (error) {
    // Non-fatal — the vote already succeeded.
    console.warn('Rate limit insert failed (non-fatal):', error);
  }
}

/**
 * Device dedup: same fingerprint + same IP + same competition within 24h.
 * Skipped entirely for in-app webviews (see isInAppWebview) where the FP is
 * unreliable. Email-based dedup (later in the handler) and the per-IP
 * email-cap (checkIpRateLimit) are the remaining lines of defense.
 */
async function checkFingerprintLimit(supabase, fingerprint, ipHash, competitionId) {
  if (!fingerprint || !ipHash) {
    // Missing either signal → can't make a reliable device match.
    return { allowed: true, skipped: true };
  }

  const cutoffIso = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { data, error } = await supabase
    .from('anonymous_vote_rate_limits')
    .select('id')
    .eq('fingerprint', fingerprint)
    .eq('ip_hash', ipHash)
    .eq('competition_id', competitionId)
    .gte('created_at', cutoffIso)
    .limit(1);

  if (error) {
    console.error('Fingerprint rate limit lookup failed (allowing vote):', error);
    return { allowed: true, skipped: true };
  }

  if (data && data.length > 0) {
    return {
      allowed: false,
      reason: `This device has already used its free vote for this competition. Free votes reset 24 hours after your last one, and paid votes work anytime. If that doesn\u2019t look right, email ${HELP}.`
    };
  }

  return { allowed: true };
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  // Intentionally conservative — reject obviously malformed addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 254;
}

function sanitizeName(name, maxLen = 60) {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, maxLen);
}

async function checkBotId(request) {
  // Optional Vercel BotID check. Only runs when explicitly enabled so the
  // route still works in dev without the dep installed.
  if (process.env.BOTID_ENABLED !== 'true') return { passed: true, skipped: true };
  try {
    const { checkBotId } = await import('@vercel/botid');
    const result = await checkBotId(request);
    return { passed: !!result?.passed, skipped: false };
  } catch (err) {
    console.warn('BotID check skipped — package not installed or failed:', err.message);
    return { passed: true, skipped: true };
  }
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const appUrl = process.env.APP_URL || 'https://eliterank.co';
  const ipLimit = Number(process.env.ANONYMOUS_VOTE_IP_LIMIT) || DEFAULT_IP_LIMIT;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return response.status(500).json({ error: 'Server not configured' });
  }

  let body;
  try {
    body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  } catch {
    return response.status(400).json({ error: 'Invalid JSON body' });
  }

  const {
    email,
    firstName,
    lastName,
    competitionId,
    contestantId,
    mountedAt,     // client timestamp when form mounted
    company,       // honeypot — must be empty
    fingerprint,   // browser fingerprint for fraud prevention
  } = body || {};

  // ─── Bot traps ─────────────────────────────────────────────────────────
  if (company) {
    // The trap is a CHECKBOX on the client now (see CompetitionCardVoting).
    // Autofill fills text and select fields; it cannot tick a checkbox, so a
    // ticked one is unambiguous. Arbitrary text arriving here is a legacy
    // client whose browser wrote a saved profile value into the old text
    // input — 14 hours of production data had that at 100% of events, all
    // with fingerprints, 4-29s fill times and distinct values across distinct
    // networks. Those are voters, and they now pass. See _honeypot.js.
    //
    // Passing here is not "no checks": device fingerprint+IP dedup, per-voter
    // email dedup, the per-IP email cap and the active-round check all run on
    // anything allowed through.
    const { verdict, shape, reject, rule } = shouldRejectHoneypot(company, {
      firstName,
      lastName,
      email,
    });
    const stampedAt = Number(mountedAt);
    const [hp, net] = await Promise.all([
      shortHash(company),
      shortHash(getClientIp(request)),
    ]);
    console.warn('[cast-anonymous-vote] HONEYPOT', {
      action: reject ? '400' : 'allowed',
      rule,
      verdict,
      shape,
      len: typeof company === 'string' ? company.length : -1,
      // `hp` repeating across events means one payload = automation; N distinct
      // values across N events means N different people's data.
      hp,
      // Same question at the network level. Compare against the `net` spread on
      // the 200 VOTE line below — a farm is narrow where real voters are wide.
      net,
      // Humans take seconds to fill three fields.
      elapsedMs: Number.isFinite(stampedAt) ? Date.now() - stampedAt : null,
      // A bot POSTing JSON straight at this route has no reason to compute one.
      hasFp: !!fingerprint,
      ua: request.headers['user-agent'] || '',
      referer: request.headers['referer'] || '',
    });

    if (reject) {
      return response.status(400).json({
        error: `We couldn\u2019t verify that submission. Please refresh the page and try again \u2014 if it keeps happening, email ${HELP}.`,
        code: 'INVALID_SUBMISSION',
      });
    }
  }

  if (isSuspiciouslyFast(mountedAt, Date.now(), MIN_SUBMIT_MS)) {
    // Logged for the same reason the honeypot is (#668): a silent 400 hides
    // false positives among the generic ones.
    console.warn('[cast-anonymous-vote] 400 TOO_FAST', {
      elapsedMs: Date.now() - Number(mountedAt),
      ua: request.headers['user-agent'] || '',
    });
    return response.status(400).json({
      error: `That came through faster than we could verify. Wait a moment and try again — if it keeps happening, email ${HELP}.`,
      code: 'TOO_FAST',
    });
  }

  const botCheck = await checkBotId(request);
  if (!botCheck.passed) {
    return response.status(403).json({
      error: `We couldn\u2019t confirm this request came from a browser. If you\u2019re voting normally, email ${HELP} and we\u2019ll sort it out.`,
      code: 'BOT_DETECTED',
    });
  }

  // ─── Input validation ──────────────────────────────────────────────────
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const cleanFirst = sanitizeName(firstName);
  const cleanLast = sanitizeName(lastName);

  if (!isValidEmail(normalizedEmail)) {
    return response.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (!cleanFirst || !cleanLast) {
    return response.status(400).json({ error: 'First and last name are required.' });
  }
  if (!competitionId || !contestantId) {
    return response.status(400).json({ error: 'Missing competition or contestant.' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const ip = getClientIp(request);
  const ipHash = await hashIp(ip);
  const webview = isInAppWebview(request);
  const ua = request.headers['user-agent'] || '';

  // ─── Device dedup: fingerprint + IP combined ────────────────────────
  // Skip for in-app webviews (Instagram, FB, TikTok, …) — FP collides there
  // and on cellular CGNAT the IP collides too, falsely locking real voters.
  // The email-based dedup below is the actual "you already voted" check.
  if (!webview) {
    const fpCheck = await checkFingerprintLimit(supabase, fingerprint, ipHash, competitionId);
    if (!fpCheck.allowed) {
      // Server-side log only (Vercel function logs, not visible to voter).
      // Lets us confirm post-deploy whether the FP+IP block is still firing
      // for UAs the webview detector missed.
      console.warn('[cast-anonymous-vote] 429 ALREADY_VOTED (FP+IP)', { ua, webview });
      return response.status(429).json({ error: fpCheck.reason, code: 'ALREADY_VOTED' });
    }
  }

  // ─── IP rate limit (backup) ────────────────────────────────────────────
  const rateCheck = await checkIpRateLimit(supabase, ipHash, normalizedEmail, ipLimit);
  if (!rateCheck.allowed) {
    console.warn('[cast-anonymous-vote] 429 IP_EMAIL_CAP', { ua, webview });
    return response.status(429).json({ error: rateCheck.reason, code: 'IP_EMAIL_CAP' });
  }

  try {
    // ─── Verify active voting round ─────────────────────────────────────
    const nowIso = new Date().toISOString();
    // Finale rounds collect public votes too (the winner is ranked by votes),
    // so they must accept votes alongside regular voting rounds. Judging /
    // resurrection rounds are not publicly votable.
    const { data: rounds, error: roundErr } = await supabase
      .from('voting_rounds')
      .select('id, start_date, end_date, round_type')
      .eq('competition_id', competitionId)
      .in('round_type', ['voting', 'finale'])
      .lte('start_date', nowIso)
      .gt('end_date', nowIso)
      .limit(1);

    if (roundErr) {
      console.error('Round lookup failed:', roundErr);
      return response.status(500).json({ error: 'Could not verify voting round.' });
    }
    if (!rounds || rounds.length === 0) {
      return response.status(400).json({ error: 'Voting is not currently open.' });
    }

    // ─── Find or create the auth user ────────────────────────────────────
    let voterId = null;
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, first_name, last_name')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existingProfile?.id) {
      voterId = existingProfile.id;
      // Backfill name only when missing — don't overwrite a claimed profile.
      if (!existingProfile.first_name && !existingProfile.last_name) {
        await supabase
          .from('profiles')
          .update({ first_name: cleanFirst, last_name: cleanLast })
          .eq('id', voterId);
      }
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: false,
        user_metadata: { first_name: cleanFirst, last_name: cleanLast },
      });
      if (createErr || !created?.user?.id) {
        console.error('Auth user create failed:', createErr);
        return response.status(500).json({ error: 'Could not create voter record.' });
      }
      voterId = created.user.id;

      // The handle_new_user trigger may have failed silently (it catches exceptions
      // to avoid blocking auth.users inserts). Ensure the profile exists so the
      // vote INSERT doesn't hit a FK violation.
      const { data: profileCheck } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', voterId)
        .maybeSingle();

      if (!profileCheck) {
        console.warn('Profile missing after user creation — creating manually for', voterId);
        const { error: profileErr } = await supabase
          .from('profiles')
          .insert({
            id: voterId,
            email: normalizedEmail,
            first_name: cleanFirst,
            last_name: cleanLast,
          });
        if (profileErr) {
          console.error('Manual profile creation failed:', profileErr);
          return response.status(500).json({ error: 'Could not create voter profile.' });
        }
      }
    }

    // ─── Daily vote dedup ────────────────────────────────────────────────
    const dayAgoIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentVote } = await supabase
      .from('votes')
      .select('id, created_at')
      .eq('voter_id', voterId)
      .eq('competition_id', competitionId)
      .is('payment_intent_id', null)
      .gte('created_at', dayAgoIso)
      .limit(1)
      .maybeSingle();

    if (recentVote?.id) {
      // Mirror the 429 log lines above so every "already voted" path is
      // visible in Vercel logs with consistent context. Lets us tell at a
      // glance whether 409s are cross-device dupes (expected) vs same-device
      // retries (would suggest a client-side lock regression).
      const prevVoteAgeHours = recentVote.created_at
        ? Math.round((Date.now() - new Date(recentVote.created_at).getTime()) / 3600000 * 10) / 10
        : null;
      console.warn('[cast-anonymous-vote] 409 ALREADY_VOTED (email)', {
        ua,
        webview,
        ipHash,
        prevVoteAgeHours,
      });
      return response.status(409).json({
        error: `You\u2019ve already used your free vote for this competition. Free votes reset 24 hours after your last one, and paid votes work anytime. Questions? ${HELP}.`,
        code: 'ALREADY_VOTED',
        // Lets the client display an accurate "Try again in Xh" countdown
        // based on the real prior vote, not a pessimistic 24h-from-now lock.
        prevVoteAt: recentVote.created_at,
      });
    }

    // ─── Vote multiplier (server-side, can't be spoofed by client) ──────
    // Numeric multiplier, not the boolean double-day flag: a 3× boost
    // window must credit 3, not the hardcoded 2 the boolean path allowed.
    // Mirrors submitFreeVote — validate against [1,2,3] and fail closed so
    // no anonymous vote is recorded with ambiguous credit terms.
    const { data: multiplierRpc, error: multiplierError } = await supabase.rpc(
      'effective_vote_multiplier',
      { p_competition_id: competitionId },
    );
    if (multiplierError || ![1, 2, 3].includes(multiplierRpc)) {
      console.error('Vote multiplier resolution failed:', multiplierError || multiplierRpc);
      return response.status(503).json({
        error: 'Vote boost status is temporarily unavailable. Please try again in a moment.',
        code: 'MULTIPLIER_UNAVAILABLE',
      });
    }
    const voteCount = multiplierRpc;
    const isDoubleVoteDay = voteCount > 1;

    // ─── Insert the vote ─────────────────────────────────────────────────
    const { error: voteErr } = await supabase
      .from('votes')
      .insert({
        voter_id: voterId,
        voter_email: normalizedEmail,
        competition_id: competitionId,
        contestant_id: contestantId,
        vote_count: voteCount,
        amount_paid: 0,
        payment_intent_id: null,
        is_double_vote: isDoubleVoteDay,
      });

    if (voteErr) {
      console.error('Vote insert failed:', voteErr);
      if (voteErr.code === '23505') {
        return response.status(409).json({
        error: `You\u2019ve already used your free vote for this competition. Free votes reset 24 hours after your last one, and paid votes work anytime. Questions? ${HELP}.`,
        code: 'ALREADY_VOTED',
      });
      }
      // Include error details in non-production for debugging
      const isDev = process.env.NODE_ENV !== 'production' || process.env.VERCEL_ENV === 'preview';
      const errorPayload = isDev
        ? { error: 'Could not record your vote.', code: voteErr.code, detail: voteErr.message }
        : { error: 'Could not record your vote.' };
      return response.status(500).json(errorPayload);
    }

    // Record rate-limit entry only after a successful vote so failed
    // attempts don't count against the IP/fingerprint.
    await recordIpRateLimit(supabase, ipHash, normalizedEmail, fingerprint, competitionId);

    // The denominator. Rejections are logged in detail but were unreadable
    // without knowing what the ACCEPTED population looks like: honeypot hits
    // being 100% Chrome means nothing if accepted votes are 100% Chrome too,
    // and means everything if they are mostly iOS Safari and webviews.
    console.log('[cast-anonymous-vote] 200 VOTE', {
      ua,
      webview,
      net: ipHash.slice(0, 8),
    });

    // Return voter info so the client can prompt "Become a Fan" post-vote.
    // No email sent — conversion happens in-context on the success screen.
    return response.status(200).json({
      success: true,
      votesAdded: voteCount,
      isDoubleVoteDay,
      visitorId: voterId,
      botIdSkipped: botCheck.skipped,
    });
  } catch (err) {
    console.error('Unexpected error casting anonymous vote:', err);
    return response.status(500).json({ error: 'An unexpected error occurred.' });
  }
}
