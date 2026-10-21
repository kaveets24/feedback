import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { cache } from 'react';
import { createApiClient } from '@feedback/shared';
import { env } from './env';

/** API client for server components, authenticated as the signed-in user (if any). */
export function serverApi() {
  return createApiClient({
    baseUrl: env.API_URL,
    getToken: async () => (await auth()).getToken(),
  });
}

/**
 * API client for someone listening through a share link: the link's token and nothing else. It's
 * anonymous on purpose, so a link works the same for everyone who holds it (signed in, waiting
 * for approval, or signed out), and what it opens never depends on who's asking.
 */
export function sharedApi(shareToken: string) {
  return createApiClient({ baseUrl: env.API_URL, shareToken });
}

/**
 * API client for commenting through a share link: the link's token plus the visitor's session,
 * since a comment needs an author. Only for comments, and only for approved accounts (anyone else
 * would be refused by the approval gate); opening the link itself stays `sharedApi`, so what a
 * link opens never depends on who's asking.
 */
export function sharedApiAs(shareToken: string) {
  return createApiClient({
    baseUrl: env.API_URL,
    shareToken,
    getToken: async () => (await auth()).getToken(),
  });
}

/**
 * The signed-in user, fetched once per request: the header and the home page both need it, and
 * `cache` makes them share one API call.
 */
export const getMe = cache(() => serverApi().getMe());
