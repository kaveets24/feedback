import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from './lib/sentry';

// Runs once when the server starts: validate env so a bad config fails fast, then start error
// reporting for server code.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') await import('./lib/env');
  Sentry.init(sentryOptions);
}

// Reports errors thrown while rendering server components, route handlers, and server actions.
export const onRequestError = Sentry.captureRequestError;
