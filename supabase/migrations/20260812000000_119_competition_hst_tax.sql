-- =============================================================================
-- Migration 119: per-competition sales tax (Canada HST) on paid votes
-- =============================================================================
-- Adds an OPTIONAL, per-competition tax rate charged ON TOP of the vote subtotal
-- for hosts that are the merchant of record and are tax-registered. First use:
-- "Who's Who: Singles Edition" (Toronto), hosted by SOCLUB GROUP INC., which is
-- HST-registered in Ontario and collects 13% HST.
--
-- Design / invariants:
--   • Tax is ADDITIVE (buyer pays subtotal + tax), never inclusive.
--   • Tax is gated on the host org being Canada (organizations.country = 'CA')
--     AND the competition having a non-zero tax_rate_pct — so US competitions and
--     any competition left at the default 0 are completely unaffected.
--   • The EliteRank platform fee (application_fee_amount) is taken on the PRE-TAX
--     subtotal only. The collected tax belongs to the host's remittance and must
--     never be part of the platform's fee base (§2.1). See create-payment-intent.
--   • The host stays merchant of record on the direct charge, so the collected
--     HST settles into the host's own connected account for THEM to remit. The
--     platform does not hold or remit it.
--
--   competitions.tax_rate_pct   — sales-tax rate (%) applied to this competition's
--                                 paid-vote subtotal. Default 0 = no tax.
--   competitions.tax_label      — receipt label for the tax line (e.g. 'HST').
--   organizations.tax_registration_number — host's CRA GST/HST number, shown on
--                                 the tax receipt (required for a valid CA receipt
--                                 on sales of $30+).
--   organizations.tax_address   — host's registered business address, shown on the
--                                 tax receipt as the vendor address.
--   votes.tax_amount            — tax portion of amount_paid, recorded per row so
--                                 the host can reconcile HST collected for remittance.
--   votes.receipt_sent_at       — claim/idempotency stamp so exactly one tax receipt
--                                 is emailed per paid vote across the client/webhook race.
--   votes.receipt_number        — human-facing receipt number printed on the receipt.
-- =============================================================================

-- ── Competition: tax rate + label ───────────────────────────────────────────
ALTER TABLE public.competitions
  ADD COLUMN IF NOT EXISTS tax_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 0
    CHECK (tax_rate_pct >= 0 AND tax_rate_pct <= 100),
  ADD COLUMN IF NOT EXISTS tax_label TEXT;

COMMENT ON COLUMN public.competitions.tax_rate_pct IS
  'Additive sales-tax rate (%) charged on this competition''s paid-vote subtotal. Only applied when the host org country = ''CA'' and this is > 0. Default 0 = no tax. Platform fee is computed on the pre-tax subtotal.';
COMMENT ON COLUMN public.competitions.tax_label IS
  'Receipt label for the tax line (e.g. ''HST''). Falls back to ''Tax'' when null but tax_rate_pct > 0.';

-- ── Organization: tax identity for compliant receipts ───────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS tax_registration_number TEXT,
  ADD COLUMN IF NOT EXISTS tax_address TEXT;

COMMENT ON COLUMN public.organizations.tax_registration_number IS
  'Host CRA GST/HST registration number (e.g. ''77420 0570 RT0001''). Printed on tax receipts. Required for a valid Canadian tax receipt on sales of $30 or more.';
COMMENT ON COLUMN public.organizations.tax_address IS
  'Host registered business address shown as the vendor address on tax receipts.';

-- ── Votes: per-row tax accounting + receipt idempotency ─────────────────────
ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS receipt_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

COMMENT ON COLUMN public.votes.tax_amount IS
  'Tax portion (in the row''s currency) included in amount_paid. Subtotal = amount_paid - tax_amount. 0 for free/manual/untaxed votes.';
COMMENT ON COLUMN public.votes.receipt_sent_at IS
  'Set when the tax receipt email has been claimed/sent for this paid vote. Guarantees exactly-one receipt across the client-side + webhook insert race.';
COMMENT ON COLUMN public.votes.receipt_number IS
  'Human-facing receipt number printed on the emailed tax receipt.';

-- ── Seed: enable 13% HST for Who''s Who Toronto + SOCLUB GROUP INC. ──────────
-- Scoped to the specific competition + host org discovered for this rollout.
-- Effective going forward only; past votes are never retroactively taxed.
UPDATE public.competitions
   SET tax_rate_pct = 13.00,
       tax_label    = 'HST'
 WHERE id = '4d246aa1-97cc-4f44-8fbb-79fba52ac1ba';

UPDATE public.organizations
   SET tax_registration_number = '77420 0570 RT0001',
       tax_address             = '21 Wolf Creek Cres, Maple, ON L6A 4C6'
 WHERE id = '113ff1e1-f6d2-466a-94d5-c481a6fd8d64';

-- ── Keep total_revenue = NET vote revenue (exclude collected tax) ────────────
-- The process_vote trigger accumulates each paid vote's amount_paid into
-- competitions.total_revenue. Now that amount_paid is tax-INCLUSIVE for taxed
-- competitions, the collected tax would inflate total_revenue — but tax is a
-- pass-through the host remits to the CRA, not competition revenue (and any
-- prize/earnings figure derived from it must not include tax). Subtract the tax
-- portion so total_revenue stays "vote revenue, excl. tax". COALESCE(tax,0)
-- makes this a no-op for every existing/untaxed vote.
CREATE OR REPLACE FUNCTION public.process_vote()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  UPDATE public.contestants
    SET votes = votes + NEW.vote_count
    WHERE id = NEW.contestant_id;

  UPDATE public.competitions
    SET total_votes = total_votes + NEW.vote_count,
        total_revenue = total_revenue + COALESCE(NEW.amount_paid, 0) - COALESCE(NEW.tax_amount, 0)
    WHERE id = NEW.competition_id;

  RETURN NEW;
END;
$function$;
