import { describe, expect, it } from 'vitest';
import {
  getCompetitionPublicPath,
  getCompetitionShareUrl,
  resolveCompetitionAlias,
  toCanonicalAliasUrl,
} from './competitionAliases';

describe('competition aliases', () => {
  it('resolves the canonical one-segment competition path', () => {
    expect(resolveCompetitionAlias('/FanClub')).toMatchObject({
      canonicalPath: '/FanClub',
      competitionSlug: 'chicago-creator-of-the-year-chi-26',
      orgSlug: 'creator-social-llc',
      shouldRedirect: false,
    });
  });

  it('normalizes lowercase aliases without losing the nested path', () => {
    expect(resolveCompetitionAlias('/fanclub/rules')).toMatchObject({
      canonicalPath: '/FanClub/rules',
      shouldRedirect: true,
    });
  });

  it('permanently maps the old path and its nested routes to the alias', () => {
    expect(
      resolveCompetitionAlias(
        '/creator-social-llc/chicago-creator-of-the-year-chi-26/enter',
      ),
    ).toMatchObject({
      canonicalPath: '/FanClub/enter',
      isLegacyPath: true,
      shouldRedirect: true,
    });
  });

  it('preserves query parameters when producing a canonical redirect URL', () => {
    const resolution = resolveCompetitionAlias(
      '/creator-social-llc/chicago-creator-of-the-year-chi-26/rules',
    );

    expect(toCanonicalAliasUrl(resolution, '?ref=partner&apply=self')).toBe(
      '/FanClub/rules?ref=partner&apply=self',
    );
  });

  it('uses the alias as the public-link authority for this competition', () => {
    expect(
      getCompetitionPublicPath(
        'creator-social-llc',
        'chicago-creator-of-the-year-chi-26',
      ),
    ).toBe('/FanClub');
    expect(
      getCompetitionShareUrl(
        'creator-social-llc',
        'chicago-creator-of-the-year-chi-26',
      ),
    ).toBe('eliterank.co/FanClub');
    expect(
      getCompetitionShareUrl(null, 'chicago-creator-of-the-year-chi-26'),
    ).toBe('eliterank.co/FanClub');
  });

  it('does not claim unrelated paths or competitions', () => {
    expect(resolveCompetitionAlias('/terms')).toBeNull();
    expect(getCompetitionPublicPath('another-org', 'another-competition')).toBe(
      '/another-org/another-competition',
    );
    expect(getCompetitionPublicPath('another-org', null)).toBeNull();
    expect(getCompetitionPublicPath(null, 'another-competition')).toBeNull();
  });
});
