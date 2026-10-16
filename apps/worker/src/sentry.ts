import * as Sentry from '@sentry/node';
import {
  monitoredLogLevels,
  monitoringDataCollection,
  scrubBreadcrumb,
  scrubEvent,
  scrubLog,
} from '@feedback/shared/monitoring';
import type { Env } from './env.ts';

/**
 * Starts Sentry if `SENTRY_DSN` is set. It reports uncaught exceptions and unhandled rejections
 * on its own; a job that fails for good reports through `captureException`.
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
    // Forwards pino's log lines (they still go to stdout too) as Sentry Logs.
    integrations: [Sentry.pinoIntegration({ log: { levels: [...monitoredLogLevels] } })],
    beforeSendLog: scrubLog,
  });
  Sentry.setTag('service', 'worker');
  Sentry.getGlobalScope().setAttributes({ service: 'worker' });
  return true;
}

export { captureException, close as flushSentry } from '@sentry/node';
