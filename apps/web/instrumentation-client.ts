import * as Sentry from '@sentry/browser';
import { sentryOptions } from './lib/sentry';

// Runs in the browser before the app starts: reports uncaught errors and unhandled rejections.
// Uses @sentry/browser rather than @sentry/nextjs here: the Next.js client SDK always bundles
// browser tracing (about 30 KB gzipped more) unless built through withSentryConfig's webpack
// plugin, which Turbopack doesn't run. We only want errors.
Sentry.init(sentryOptions);
