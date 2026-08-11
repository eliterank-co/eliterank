-- =============================================================================
-- Migration 121: expose organizations.default_currency to anonymous reads
-- =============================================================================
-- Migration 118 added organizations.default_currency (usd | cad) but migration
-- 103 had already locked the anon role down to an explicit column-level SELECT
-- grant that does NOT include it. As a result, any anon-reachable query that
-- selects default_currency fails with "permission denied for column
-- default_currency" for logged-out visitors.
--
-- The public voting UI needs this value so a logged-out voter sees the correct
-- price symbol (e.g. CA$1.00 for a Canadian host) BEFORE checkout, instead of a
-- USD "$" that then silently changes once the PaymentIntent resolves.
--
-- default_currency is non-sensitive settlement metadata (usd | cad), not PII, so
-- exposing it to anon is safe. Authenticated users already have full column
-- access (see migration 103's `grant select on public.organizations to
-- authenticated`).
-- =============================================================================

grant select (default_currency) on public.organizations to anon;
