import { afterEach, describe, expect, it, vi } from 'vitest';
import robots from './robots';

const rulesFor = (userAgent: string) =>
  [robots().rules].flat().filter((rule) => [rule.userAgent].flat().includes(userAgent));

describe('robots', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(['Twitterbot', 'LinkedInBot', 'facebookexternalhit', 'Slackbot', 'Discordbot'])(
    'lets %s fetch pages, to draw link previews',
    (crawler) => {
      expect(rulesFor(crawler)).toEqual([expect.objectContaining({ allow: '/' })]);
    },
  );

  it('keeps everything else out, search engines included', () => {
    expect(rulesFor('*')).toEqual([{ userAgent: '*', disallow: '/' }]);
    expect(rulesFor('Googlebot')).toEqual([]);
    expect(rulesFor('Bingbot')).toEqual([]);
  });

  it('allows everyone once indexing is on', () => {
    vi.stubEnv('ALLOW_INDEXING', 'true');
    expect(robots().rules).toEqual({ userAgent: '*', allow: '/' });
  });
});
