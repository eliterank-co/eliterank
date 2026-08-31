const ALIASES = Object.freeze([
  Object.freeze({
    path: '/FanClub',
    orgSlug: 'creator-social-llc',
    competitionSlug: 'chicago-creator-of-the-year-chi-26',
    legacyPaths: Object.freeze([
      '/creator-social-llc/chicago-creator-of-the-year-chi-26',
    ]),
  }),
]);

function normalizePathname(pathname) {
  if (!pathname || pathname === '/') return '/';
  const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return withLeadingSlash.replace(/\/+$/, '') || '/';
}

function matchBasePath(pathname, basePath) {
  const lowerPath = pathname.toLowerCase();
  const lowerBase = basePath.toLowerCase();
  if (lowerPath === lowerBase) return '';
  if (lowerPath.startsWith(`${lowerBase}/`)) return pathname.slice(basePath.length);
  return null;
}

export function resolveCompetitionAlias(pathname) {
  const normalized = normalizePathname(pathname);

  for (const alias of ALIASES) {
    const aliasSuffix = matchBasePath(normalized, alias.path);
    if (aliasSuffix !== null) {
      const canonicalPath = `${alias.path}${aliasSuffix}`;
      return {
        ...alias,
        canonicalPath,
        isLegacyPath: false,
        shouldRedirect: normalized !== canonicalPath,
      };
    }

    for (const legacyPath of alias.legacyPaths) {
      const legacySuffix = matchBasePath(normalized, legacyPath);
      if (legacySuffix !== null) {
        return {
          ...alias,
          canonicalPath: `${alias.path}${legacySuffix}`,
          isLegacyPath: true,
          shouldRedirect: true,
        };
      }
    }
  }

  return null;
}

export function getCompetitionPublicPath(orgSlug, competitionSlug) {
  if (!competitionSlug) return null;
  const matches = ALIASES.filter(
    (entry) =>
      entry.competitionSlug === competitionSlug &&
      (!orgSlug || entry.orgSlug === orgSlug),
  );
  const alias = matches.length === 1 ? matches[0] : null;
  if (!orgSlug && !alias) return null;
  return alias?.path || `/${orgSlug}/${competitionSlug}`;
}

export function toCanonicalAliasUrl(resolution, search = '') {
  if (!resolution) return null;
  if (!search) return resolution.canonicalPath;
  return `${resolution.canonicalPath}${search.startsWith('?') ? search : `?${search}`}`;
}

export function getCompetitionShareUrl(orgSlug, competitionSlug, origin = 'eliterank.co') {
  const path = getCompetitionPublicPath(orgSlug, competitionSlug);
  return path ? `${origin.replace(/\/$/, '')}${path}` : origin;
}

export const competitionAliases = ALIASES;
