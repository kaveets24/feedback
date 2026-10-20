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
 * The signed-in user, fetched once per request: the header and the home page both need it, and
 * `cache` makes them share one API call.
 */
export const getMe = cache(() => serverApi().getMe());
