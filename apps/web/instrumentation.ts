import * as Sentry from '@sentry/nextjs';
import { RATE_LIMITED_DIGEST } from './lib/rate-limited-digest';
import { sentryOptions } from './lib/sentry';

// Runs once when the server starts: validate env so a bad config fails fast, then start error
// reporting for server code.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./lib/env');
  Sentry.init(sentryOptions);
}

// Reports errors thrown while rendering server components, route handlers, and server actions.
// Being rate limited is working as intended, so it isn't one.
export const onRequestError: typeof Sentry.captureRequestError = (error, ...rest) => {
  if ((error as { digest?: unknown } | null)?.digest === RATE_LIMITED_DIGEST) return;
  Sentry.captureRequestError(error, ...rest);
};
