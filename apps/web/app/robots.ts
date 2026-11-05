import type { MetadataRoute } from 'next';

/**
 * The crawlers that fetch a page to draw a shared link's preview. They aren't search engines, and
 * every page gives them only the generic preview tags (see the root layout), so letting them in
 * shows nothing that isn't already public. Some of them obey robots.txt, so without this a shared
 * link would show no preview there.
 */
const LINK_PREVIEW_CRAWLERS = [
  'Twitterbot',
  'LinkedInBot',
  'facebookexternalhit',
  'Slackbot',
  'Discordbot',
];

// Disallow all crawling, apart from link previews, unless ALLOW_INDEXING=true (production only).
// next.config.ts also sends X-Robots-Tag: noindex, which covers crawlers that ignore robots.txt.
export default function robots(): MetadataRoute.Robots {
  if (process.env.ALLOW_INDEXING === 'true') return { rules: { userAgent: '*', allow: '/' } };
  return {
    rules: [
      { userAgent: LINK_PREVIEW_CRAWLERS, allow: '/' },
      { userAgent: '*', disallow: '/' },
    ],
  };
}
