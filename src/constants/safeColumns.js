/**
 * Public-safe (anon-readable) column lists for `profiles` and `organizations`.
 *
 * The anonymous Supabase key has had its table-wide SELECT on these tables
 * revoked and re-granted at the COLUMN level — see
 *   supabase/migrations/20260628120000_103_restrict_anon_pii_columns.sql
 *
 * Because of that, the anon key cannot SELECT *or filter on* any column outside
 * these lists. Every anonymous-reachable query (direct, embedded, or via a
 * cached-query helper) must use these instead of `'*'`, or it will fail with
 * `permission denied for column …` for logged-out visitors.
 *
 * KEEP THESE IN SYNC WITH THE GRANTs IN MIGRATION 103. Authenticated users keep
 * full column access, so authenticated-only queries may still use `'*'`.
 *
 * Excluded from PROFILE_PUBLIC_COLS: email, phone, shipping_address,
 *   onesignal_external_id, notification_preferences, bonus_actions, is_super_admin
 * Excluded from ORG_PUBLIC_COLS: stripe_connect_account_id, kyc_status,
 *   charges_enabled, payouts_enabled, connect_details_submitted,
 *   connect_onboarded_at, owner_id, legal_entity_name, master_agreement_version,
 *   master_agreement_accepted_at, master_agreement_accepted_by
 */

export const PROFILE_PUBLIC_COLS =
  'id, first_name, last_name, bio, city, avatar_url, instagram, twitter, tiktok, ' +
  'linkedin, website, headline, occupation, age, username, interests, cover_image, ' +
  'gallery, intro_video_url, total_votes_received, total_competitions, wins, ' +
  'best_placement, fan_count, is_host, created_at, updated_at, onboarded_at';

export const ORG_PUBLIC_COLS =
  'id, name, slug, logo, tagline, description, cover_image, total_competitions, ' +
  'total_cities, total_contestants, created_at, updated_at, logo_url, ' +
  'default_about_tagline, default_about_description, default_about_traits, ' +
  'default_age_range, default_requirement, default_theme_primary, ' +
  'default_theme_voting, default_theme_resurrection, header_logo_url, website_url, ' +
  'org_type, instagram, tiktok, facebook, is_managed, default_currency';
