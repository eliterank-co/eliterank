/**
 * Edge function that serves the SPA shell with route-specific Open Graph and
 * Twitter card meta tags injected. Triggered by rewrites in vercel.json for
 * profile and competition URLs so social platform crawlers see real titles,
 * descriptions, and images for the page being shared.
 *
 * Falls back to the default site meta on any error or unknown path — the SPA
 * still hydrates normally for real users either way.
 */

import { indexHtml } from './_index-template.mjs';
import {
  resolveCompetitionAlias,
  toCanonicalAliasUrl,
} from '../src/config/competitionAliases.js';

export const config = { runtime: 'edge' };

const SITE_URL = 'https://eliterank.co';
const DEFAULT_TITLE = 'EliteRank — Where the Best Get Recognized';
const DEFAULT_DESCRIPTION =
  'Enter · Compete · Win. The most prestigious social competition platform.';
const DEFAULT_IMAGE = `${SITE_URL}/og-image.png`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Mirrors RESERVED_PATHS from src/utils/slugs.js — keep in sync.
const RESERVED_FIRST_SEGMENTS = new Set([
  'c', 'org', 'login', 'claim', 'admin', 'profile', 'api', 'auth',
  'rewards', 'events', 'news', 'about', 'join', 'photobooth',
  'dashboard', 'notifications', 'account', 'achievements',
  'privacy', 'terms', 'reset-password',
]);

function escapeHtml(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(text, limit) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  return clean.slice(0, limit - 1).trimEnd() + '…';
}

function buildMetaBlock({ title, description, image, url }) {
  const t = escapeHtml(title || DEFAULT_TITLE);
  const img = escapeHtml(image || DEFAULT_IMAGE);
  const u = escapeHtml(url || SITE_URL);
  // description === null means "omit the description tags entirely" (used for
  // profile shares). Anything else (undefined, '', etc.) falls back to default.
  const includeDescription = description !== null;
  const d = includeDescription ? escapeHtml(truncate(description || DEFAULT_DESCRIPTION, 200)) : '';
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    url: url || SITE_URL,
    name: title || DEFAULT_TITLE,
    ...(includeDescription ? { description: truncate(description || DEFAULT_DESCRIPTION, 200) } : {}),
    primaryImageOfPage: image || DEFAULT_IMAGE,
  }).replace(/</g, '\\u003c');

  const tags = [
    `<title>${t}</title>`,
    `<link rel="canonical" href="${u}" />`,
    includeDescription && `<meta name="description" content="${d}" />`,
    `<meta property="og:url" content="${u}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${t}" />`,
    includeDescription && `<meta property="og:description" content="${d}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t}" />`,
    includeDescription && `<meta name="twitter:description" content="${d}" />`,
    `<meta name="twitter:image" content="${img}" />`,
    `<script type="application/ld+json">${structuredData}</script>`,
  ];
  return tags.filter(Boolean).join('\n    ');
}

function injectMeta(html, metaBlock) {
  const titleIdx = html.indexOf('<title>');
  if (titleIdx === -1) return html;
  const endMarker = '<meta name="twitter:image"';
  const endIdx = html.indexOf(endMarker, titleIdx);
  if (endIdx === -1) return html;
  const closeIdx = html.indexOf('/>', endIdx);
  if (closeIdx === -1) return html;
  return html.slice(0, titleIdx) + metaBlock + html.slice(closeIdx + 2);
}

async function supabaseRest(pathWithQuery) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetch(`${base}/rest/v1${pathWithQuery}`, {
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cheap deterministic hash (DJB2 mod 36) — used only as a cache-buster suffix
 * on the dynamic og:image URL so iMessage/Instagram refetch when the
 * underlying photo changes.
 */
function shortHash(value) {
  if (!value) return '0';
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36);
}

function dynamicImageUrl(origin, type, id, version) {
  const v = version ? `&v=${encodeURIComponent(version)}` : '';
  return `${origin}/api/og-image?type=${type}&id=${encodeURIComponent(id)}${v}`;
}

async function fetchProfileMeta(profileId, canonicalUrl, origin) {
  if (!UUID_RE.test(profileId)) return null;
  const rows = await supabaseRest(
    `/profiles?id=eq.${encodeURIComponent(profileId)}` +
      `&select=id,first_name,last_name,city,avatar_url,cover_image&limit=1`,
  );
  const profile = Array.isArray(rows) ? rows[0] : null;
  if (!profile) return null;

  const name = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  const displayName = name || 'EliteRank Member';
  const cityPart = profile.city ? ` · ${profile.city}` : '';

  // Use the dynamic share card when there's a real photo to composite; fall
  // back to the brand image otherwise.
  const photoUrl = profile.cover_image || profile.avatar_url;
  const image = photoUrl
    ? dynamicImageUrl(origin, 'profile', profile.id, shortHash(photoUrl))
    : DEFAULT_IMAGE;

  return {
    title: `${displayName}${cityPart} | EliteRank`,
    description: null,
    image,
    url: canonicalUrl,
  };
}

function formatCompetitionMeta(competition, canonicalUrl, origin) {
  if (!competition) return null;
  const name = competition.name?.trim() || 'EliteRank Competition';
  // `city` is a PostgREST embed (`city:cities(name)`), not a column on
  // competitions — there's no text `city` column on the table.
  const city = competition.city?.name?.trim();
  const orgName = competition.organization?.name?.trim();
  const season = competition.season;

  const titleParts = [name];
  if (city) titleParts.push(city);
  if (season) titleParts.push(String(season));
  const title = `${titleParts.join(' · ')} | EliteRank`;

  const description =
    competition.description?.trim() ||
    (orgName
      ? `Vote in ${name}${city ? ` in ${city}` : ''}, hosted by ${orgName}.`
      : `Vote in ${name}${city ? ` in ${city}` : ''}.`);

  // The og-image function always has something to render — host-uploaded
  // cover when present, city skyline (from cityImages.js) otherwise — so we
  // always point at the dynamic endpoint. Hash includes the cover URL (when
  // set) or the city name so the URL changes when either does, busting the
  // CDN cache.
  const versionKey = competition.cover_image || `city:${(city || 'default').toLowerCase()}`;
  const image = dynamicImageUrl(origin, 'competition', competition.id, shortHash(versionKey));

  return {
    title,
    description,
    image,
    url: canonicalUrl,
  };
}

async function fetchCompetitionByIdMeta(competitionId, canonicalUrl, origin) {
  if (!UUID_RE.test(competitionId)) return null;
  const rows = await supabaseRest(
    `/competitions?id=eq.${encodeURIComponent(competitionId)}` +
      `&select=id,name,season,description,cover_image,city:cities(name),organization:organizations(name,slug)&limit=1`,
  );
  return formatCompetitionMeta(Array.isArray(rows) ? rows[0] : null, canonicalUrl, origin);
}

async function fetchCompetitionBySlugMeta(orgSlug, slug, canonicalUrl, origin) {
  const rows = await supabaseRest(
    `/competitions?slug=eq.${encodeURIComponent(slug)}` +
      `&organization.slug=eq.${encodeURIComponent(orgSlug)}` +
      `&select=id,name,season,description,cover_image,city:cities(name),organization:organizations!inner(name,slug)&limit=1`,
  );
  return formatCompetitionMeta(Array.isArray(rows) ? rows[0] : null, canonicalUrl, origin);
}

function getQueryParam(url, name) {
  return url.searchParams.get(name) || undefined;
}

const INTERNAL_REWRITE_PARAMS = new Set([
  'type', 'orgSlug', 'slug', 'profileId', 'competitionId', 'path', 'rest',
]);

function getPublicSearch(url) {
  const search = new URLSearchParams();
  for (const [name, value] of url.searchParams) {
    if (!INTERNAL_REWRITE_PARAMS.has(name)) search.append(name, value);
  }
  const value = search.toString();
  return value ? `?${value}` : '';
}

export default async function handler(req) {
  const url = new URL(req.url);
  const type = getQueryParam(url, 'type');
  const orgSlug = getQueryParam(url, 'orgSlug');
  const slug = getQueryParam(url, 'slug');
  const profileId = getQueryParam(url, 'profileId');
  const competitionId = getQueryParam(url, 'competitionId');
  const pathParam = getQueryParam(url, 'path');

  const requestedPath = pathParam && pathParam.startsWith('/') ? pathParam : '/';
  const aliasResolution = resolveCompetitionAlias(requestedPath);
  if (aliasResolution?.shouldRedirect) {
    const redirectPath = toCanonicalAliasUrl(aliasResolution, getPublicSearch(url));
    return new Response(null, {
      status: 308,
      headers: { location: new URL(redirectPath, SITE_URL).toString() },
    });
  }

  const canonicalPath = aliasResolution?.canonicalPath || requestedPath;
  // og:url stays on the production canonical so social platforms attribute
  // shares to the real domain. og:image gets the request origin so preview
  // deploys (vercel.app) render against themselves instead of pulling from
  // production.
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const origin = url.origin;

  let meta = null;
  try {
    if (aliasResolution) {
      meta = await fetchCompetitionBySlugMeta(
        aliasResolution.orgSlug,
        aliasResolution.competitionSlug,
        canonicalUrl,
        origin,
      );
    } else if (type === 'profile' && profileId) {
      meta = await fetchProfileMeta(profileId, canonicalUrl, origin);
    } else if (
      type === 'competition-id' &&
      orgSlug &&
      competitionId &&
      !RESERVED_FIRST_SEGMENTS.has(orgSlug.toLowerCase())
    ) {
      meta = await fetchCompetitionByIdMeta(competitionId, canonicalUrl, origin);
    } else if (
      (type === 'competition-slug' || type === 'competition-legacy') &&
      orgSlug &&
      slug &&
      !RESERVED_FIRST_SEGMENTS.has(orgSlug.toLowerCase())
    ) {
      meta = await fetchCompetitionBySlugMeta(orgSlug, slug, canonicalUrl, origin);
    }
  } catch (err) {
    console.error('[og] handler error:', err);
  }

  const metaBlock = buildMetaBlock(meta || { url: canonicalUrl });
  const html = injectMeta(indexHtml, metaBlock);

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Short CDN cache so updates propagate quickly; SWR keeps perf snappy.
      'cache-control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}
