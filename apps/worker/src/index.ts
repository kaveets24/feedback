import { pino } from 'pino';
import { createDb } from '@feedback/db';
import { createStorage, loadStorageConfig } from '@feedback/storage';
import { startCoverWorker } from './cover/worker.ts';
import { loadEnv } from './env.ts';
import { captureException, flushSentry, initSentry } from './sentry.ts';
import { startTranscodeWorker } from './transcode/worker.ts';

/** How long shutdown waits for the running jobs; under Fly's kill_timeout (fly.staging.toml). */
const SHUTDOWN_TIMEOUT_MS = 25_000;

const env = loadEnv();
const reporting = initSentry(env);
const log = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
  }),
});
const db = createDb(env.DATABASE_URL);
const storage = createStorage(loadStorageConfig());

const transcoder = startTranscodeWorker(
  { db, storage, log },
  {
    redisUrl: env.REDIS_URL,
    report: (err, context) => captureException(err, { extra: context }),
  },
);
const covers = startCoverWorker(
  { db, storage, log },
  {
    redisUrl: env.REDIS_URL,
    report: (err, context) => captureException(err, { extra: context }),
  },
);
log.info({ errorReporting: reporting }, 'worker started');

// Checks error reporting end to end without crashing the worker (see docs/staging.md).
if (env.MONITORING_TEST_ERRORS) {
  captureException(new Error('Test error from worker startup'));
  log.warn('reported a test error (MONITORING_TEST_ERRORS is on)');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log.info({ signal }, 'shutting down');
    // Waits for the running jobs to finish, but not forever: closing also waits on Redis, which
    // may be down. A job cut off here stalls and runs again later, which is safe.
    setTimeout(() => {
      log.warn('shutdown timed out; exiting');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS).unref();
    void Promise.all([transcoder.close(), covers.close()])
      .then(() => Promise.all([db.close(), storage.close()]))
      .then(() => flushSentry(2000))
      .then(() => process.exit(0));
  });
}
