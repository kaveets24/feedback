import { createDb } from '@demo/db';
import { buildApp } from './app.ts';
import { clerkAuth } from './auth/clerk.ts';
import { loadEnv } from './env.ts';

const env = loadEnv();
const db = createDb(env.DATABASE_URL);
const auth = clerkAuth({ secretKey: env.CLERK_SECRET_KEY, authorizedParties: [env.WEB_ORIGIN] });
const app = await buildApp(env, { db, auth });
app.addHook('onClose', () => db.close());

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
  process.exit(1);
}
