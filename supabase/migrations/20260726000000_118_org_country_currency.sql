-- =============================================================================
-- Migration 118: organization country + settlement currency (Canada/CAD support)
-- =============================================================================
-- Adds first-class country + currency to the host org so a Canadian (Ontario)
-- host can onboard a `country: 'CA'` Stripe Express account and collect votes in
-- CAD via DIRECT CHARGES (host stays merchant of record; funds settle to the
-- host's own Canadian balance — EliteRank never holds them, same model as US).
--
--   • organizations.country          — host legal-entity country (US | CA); drives
--                                       the connected-account country + capabilities.
--   • organizations.default_currency — settlement currency (usd | cad), captured
--                                       from the Stripe account; used as the charge
--                                       currency for this org's competitions.
--   • votes.currency                 — the currency each paid vote was charged in,
--                                       so USD and CAD revenue are never mixed in
--                                       the untyped amount_paid column.
--
-- All defaults preserve existing US/USD behavior exactly; the CA path only
-- activates for an org explicitly set to country 'CA'.
-- =============================================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'US',
  ADD COLUMN IF NOT EXISTS default_currency text NOT NULL DEFAULT 'usd';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_country_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_country_check CHECK (country IN ('US', 'CA'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_default_currency_check') THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_default_currency_check CHECK (default_currency IN ('usd', 'cad'));
  END IF;
END $$;

COMMENT ON COLUMN public.organizations.country IS
  'Host legal-entity country for the Stripe connected account (US | CA). Drives the account country + requested capabilities + settlement currency.';
COMMENT ON COLUMN public.organizations.default_currency IS
  'Settlement currency of the host connected account (usd | cad), captured from Stripe at onboarding. Used as the charge currency for this org''s competitions.';

ALTER TABLE public.votes
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'usd';

COMMENT ON COLUMN public.votes.currency IS
  'ISO currency the paid vote was charged in (usd | cad), recorded from the Stripe PaymentIntent. Free/manual votes keep the usd default with amount_paid 0.';
