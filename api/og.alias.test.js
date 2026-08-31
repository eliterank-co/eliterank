import { describe, expect, it } from 'vitest';
import handler from './og';
import vercelConfig from '../vercel.json';

describe('competition alias Open Graph routing', () => {
  it('permanently redirects the old nested URL and preserves public query params', async () => {
    const response = await handler(
      new Request(
        'https://eliterank.co/api/og?type=competition-slug&orgSlug=creator-social-llc&slug=chicago-creator-of-the-year-chi-26&path=%2Fcreator-social-llc%2Fchicago-creator-of-the-year-chi-26%2Frules&ref=partner',
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://eliterank.co/FanClub/rules?ref=partner',
    );
  });

  it('normalizes lowercase aliases permanently', async () => {
    const response = await handler(
      new Request(
        'https://eliterank.co/api/og?type=competition-alias&path=%2Ffanclub%2Fenter&apply=self',
      ),
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://eliterank.co/FanClub/enter?apply=self',
    );
  });

  it('uses the vanity URL for canonical, Open Graph, and structured metadata', async () => {
    const response = await handler(
      new Request(
        'https://preview.example/api/og?type=competition-alias&path=%2FFanClub%2Frules',
      ),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain('<link rel="canonical" href="https://eliterank.co/FanClub/rules" />');
    expect(html).toContain('<meta property="og:url" content="https://eliterank.co/FanClub/rules" />');
    expect(html).toContain('"url":"https://eliterank.co/FanClub/rules"');
  });

  it('sends canonical and lowercase alias requests through the metadata authority', () => {
    const rewrites = vercelConfig.rewrites.map(({ source, destination }) => ({
      source,
      destination,
    }));

    expect(rewrites).toEqual(
      expect.arrayContaining([
        {
          source: '/FanClub',
          destination: '/api/og?type=competition-alias&path=/FanClub',
        },
        {
          source: '/fanclub/:rest*',
          destination: '/api/og?type=competition-alias&path=/fanclub/:rest*',
        },
      ]),
    );
  });
});
