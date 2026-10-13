import * as Sentry from '@sentry/node';
import { monitoringDataCollection, scrubBreadcrumb, scrubEvent } from '@feedback/shared/monitoring';
import type { Env } from './env.ts';

/**
 * Starts Sentry if `SENTRY_DSN` is set. It reports uncaught exceptions and unhandled rejections
 * on its own; job failures will report through `Sentry.captureException` once queues exist.
 * Returns whether reporting is on.
 */
export function initSentry(env: Env): boolean {
  if (!env.SENTRY_DSN) return false;

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.GIT_SHA || undefined,
    dataCollection: monitoringDataCollection,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  Sentry.setTag('service', 'worker');
  return true;
}

export { captureException, close as flushSentry } from '@sentry/node';
