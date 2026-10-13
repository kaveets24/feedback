import { pino } from 'pino';
import { loadEnv } from './env.ts';
import { captureException, flushSentry, initSentry } from './sentry.ts';

const env = loadEnv();
const reporting = initSentry(env);
const log = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
  }),
});

// BullMQ consumers (ffmpeg pipeline) are added in Phase 2. Until then the process just idles
// so `pnpm dev` exercises the same three-process layout as production.
const keepAlive = setInterval(() => {}, 1 << 30);
log.info({ errorReporting: reporting }, 'worker started (no queues registered yet)');

// Checks error reporting end to end without crashing the worker (see docs/staging.md).
if (env.MONITORING_TEST_ERRORS) {
  captureException(new Error('Test error from worker startup'));
  log.warn('reported a test error (MONITORING_TEST_ERRORS is on)');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'shutting down');
    clearInterval(keepAlive);
    void flushSentry(2000);
  });
}
