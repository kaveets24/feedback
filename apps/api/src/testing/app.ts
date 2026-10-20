import { createDb } from '@feedback/db';
import { testDatabaseUrl } from '@feedback/db/testing';
import { createStorage } from '@feedback/storage';
import { testStorageConfig } from '@feedback/storage/testing';
import { buildApp } from '../app.ts';
import type { AuthPort } from '../auth/port.ts';
import { loadEnv } from '../env.ts';
import type { ErrorReporter } from '../monitoring/port.ts';
import type { JobQueue, QueueHealth } from '../queue.ts';

/**
 * Fake auth for tests: `test|<providerId>|<email>` is a valid token, anything else is invalid.
 * Use `tokenFor()` to build one.
 */
export const fakeAuth: AuthPort = {
  async verify(token) {
    const [prefix, providerId, email] = token.split('|');
    if (prefix !== 'test' || !providerId || !email) return null;
    return { providerId, email };
  },
};

export const tokenFor = (providerId: string, email = `${providerId}@x.test`) =>
  `test|${providerId}|${email}`;

export interface FakeQueue extends JobQueue {
  /** Version ids queued for transcoding, in order. */
  transcodes: string[];
  /** Cover ids queued for re-encoding, in order. */
  covers: string[];
  /** When set, enqueueing rejects with this error. */
  failWith: Error | null;
  /** What `health()` reports. */
  status: QueueHealth;
}

/** A job queue that records what was queued instead of using Redis. */
export function fakeQueue(): FakeQueue {
  const queue: FakeQueue = {
    transcodes: [],
    covers: [],
    failWith: null,
    status: { redis: true, workers: 1 },
    async enqueueTranscode(versionId) {
      if (queue.failWith) throw queue.failWith;
      queue.transcodes.push(versionId);
    },
    async enqueueCover(coverId) {
      if (queue.failWith) throw queue.failWith;
      queue.covers.push(coverId);
    },
    async health() {
      return queue.status;
    },
    onError() {},
    async close() {},
  };
  return queue;
}

/**
 * Builds the app against the API's test database and bucket, with fake auth and a fake queue.
 * Close the app when done. `env` adds or overrides env vars; `errorReporter` captures what the
 * error handler reports.
 */
export async function buildTestApp(
  options: { env?: NodeJS.ProcessEnv; errorReporter?: ErrorReporter } = {},
) {
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrl('api'),
    CLERK_SECRET_KEY: 'sk_test_unused',
    REDIS_URL: 'redis://localhost:6379',
    ...options.env,
  });
  const db = createDb(env.DATABASE_URL);
  const storage = createStorage(testStorageConfig('api'));
  const queue = fakeQueue();
  const app = await buildApp(env, {
    db,
    auth: fakeAuth,
    storage,
    queue,
    errorReporter: options.errorReporter,
  });
  app.addHook('onClose', () => db.close());
  app.addHook('onClose', async () => storage.close());
  return { app, db, storage, queue };
}
