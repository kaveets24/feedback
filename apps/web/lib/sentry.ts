import { monitoringDataCollection, scrubBreadcrumb, scrubEvent } from '@feedback/shared/monitoring';

// Sentry settings shared by the browser and the server. Reporting is off unless
// NEXT_PUBLIC_SENTRY_DSN is set (it is on staging, not locally). The DSN isn't a secret: it only
// lets clients send events. Errors only: no tracing or session replay.
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // Vercel exposes the deployed commit to the build; unset locally.
  release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  initialScope: { tags: { service: 'web' } },
  dataCollection: monitoringDataCollection,
  beforeSend: scrubEvent,
  beforeBreadcrumb: scrubBreadcrumb,
};
