import 'server-only';
import { auth } from '@clerk/nextjs/server';
import { createApiClient } from '@demo/shared';
import { env } from './env';

/** API client for server components, authenticated as the signed-in user (if any). */
export function serverApi() {
  return createApiClient({
    baseUrl: env.API_URL,
    getToken: async () => (await auth()).getToken(),
  });
}
