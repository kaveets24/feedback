import * as Sentry from '@sentry/node';
import {
  monitoredLogLevels,
  monitoringDataCollection,
  scrubBreadcrumb,
  scrubEvent,
  scrubLog,
} from '@feedback/shared/monitoring';
import type { Env } from '../env.ts';
import { noopErrorReporter, type ErrorReporter } from './port.ts';

/**
 * Starts Sentry if `SENTRY_DSN` is set and returns a reporter for the error handler. Sentry also
 * reports uncaught exceptions and unhandled rejections on its own, and receives the log lines.
 * Errors and logs only: no tracing.
 */
export function initSentry(env: Env): ErrorReporter {
  if (!env.SENTRY_DSN) return noopErrorReporter;

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
  Sentry.setTag('service', 'api');
  Sentry.getGlobalScope().setAttributes({ service: 'api' });
  return { report: (error) => Sentry.captureException(error) };
}

/** Sends any queued reports before the process exits. */
export async function flushSentry(): Promise<void> {
  await Sentry.close(2000);
}
