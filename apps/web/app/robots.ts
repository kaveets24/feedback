import type { MetadataRoute } from 'next';

// Disallow all crawling unless ALLOW_INDEXING=true (production only). next.config.ts also sends
// X-Robots-Tag: noindex, which covers crawlers that ignore robots.txt.
export default function robots(): MetadataRoute.Robots {
  if (process.env.ALLOW_INDEXING === 'true') return { rules: { userAgent: '*', allow: '/' } };
  return { rules: { userAgent: '*', disallow: '/' } };
}
