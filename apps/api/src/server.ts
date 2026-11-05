import { createDb } from '@feedback/db';
import { createStorage, loadStorageConfig } from '@feedback/storage';
import { buildApp } from './app.ts';
import { clerkAuth } from './auth/clerk.ts';
import { loadEnv } from './env.ts';
import { flushSentry, initSentry } from './monitoring/sentry.ts';
import { bullmqJobQueue } from './queue.ts';
import { rateLimitRedis } from './rate-limit.ts';

const env = loadEnv();
const errorReporter = initSentry(env);
const db = createDb(env.DATABASE_URL);
const storage = createStorage(loadStorageConfig());
const queue = bullmqJobQueue(env.REDIS_URL);
const auth = clerkAuth({ secretKey: env.CLERK_SECRET_KEY, authorizedParties: [env.WEB_ORIGIN] });
const redis = rateLimitRedis(env.REDIS_URL);
const app = await buildApp(env, { db, auth, storage, queue, errorReporter, rateLimits: { redis } });
// While Redis is down requests go unlimited, so this is only logged.
redis.on('error', (err) => app.log.warn({ err }, 'rate limit connection error'));
app.addHook('onClose', () => db.close());
app.addHook('onClose', async () => storage.close());
app.addHook('onClose', () => queue.close());
app.addHook('onClose', async () => redis.disconnect());
app.addHook('onClose', flushSentry);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, 'shutting down');
    void app.close().then(() => process.exit(0));
  });
}

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (err) {
  app.log.fatal({ err }, 'failed to start');
  errorReporter.report(err);
  await flushSentry();
  process.exit(1);
}
