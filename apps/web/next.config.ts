import type { NextConfig } from 'next';

// Search engines are kept out unless ALLOW_INDEXING=true, which only production will set.
// Staging, previews and local dev never get indexed. See also app/robots.ts.
const allowIndexing = process.env.ALLOW_INDEXING === 'true';

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; let Next compile them.
  transpilePackages: ['@feedback/shared', '@feedback/authz'],
  // The dev server logs each server action call with its arguments, which can include share-link
  // tokens (CLAUDE.md section 10: never log them).
  logging: { serverFunctions: false },
  async headers() {
    if (allowIndexing) return [];
    return [{ source: '/:path*', headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }] }];
  },
};

export default nextConfig;
