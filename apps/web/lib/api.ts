import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import { cache } from 'react';
import { createApiClient } from '@feedback/shared';
import { env } from './env';
import { forwardedClientHeaders, rateLimitedFetch } from './rate-limit';

/** What every API client needs, whoever it's asking as. */
const apiOptions = {
  baseUrl: env.API_URL,
  getHeaders: async () => forwardedClientHeaders(await headers(), env.WEB_API_SECRET),
  fetch: rateLimitedFetch,
};

/** API client for server components, authenticated as the signed-in user (if any). */
export function serverApi() {
  return createApiClient({
    ...apiOptions,
    getToken: async () => (await auth()).getToken(),
  });
}

/**
 * API client for seeing what's open to anyone (public tracks and projects): as the signed-in user
 * once they're approved, so the API says what they may do (comment, say), and otherwise as nobody,
 * since the approval gate refuses an unapproved session even for public things.
 */
export async function viewerApi() {
  const { isAuthenticated } = await auth();
  if (isAuthenticated && (await getMe()).accessStatus === 'approved') return serverApi();
  return createApiClient(apiOptions);
}

/**
 * API client for someone listening through a share link: the link's token and nothing else. It's
 * anonymous on purpose, so a link works the same for everyone who holds it (signed in, waiting
 * for approval, or signed out), and what it opens never depends on who's asking.
 */
export function sharedApi(shareToken: string) {
  return createApiClient({ ...apiOptions, shareToken });
}

/**
 * API client for commenting through a share link: the link's token plus the visitor's session,
 * since a comment needs an author. Only for comments, and only for approved accounts (anyone else
 * would be refused by the approval gate); opening the link itself stays `sharedApi`, so what a
 * link opens never depends on who's asking.
 */
export function sharedApiAs(shareToken: string) {
  return createApiClient({
    ...apiOptions,
    shareToken,
    getToken: async () => (await auth()).getToken(),
  });
}

/**
 * The signed-in user, fetched once per request: the header and the home page both need it, and
 * `cache` makes them share one API call.
 */
export const getMe = cache(() => serverApi().getMe());
