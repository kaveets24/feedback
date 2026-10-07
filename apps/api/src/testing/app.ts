import { createDb } from '@feedback/db';
import { testDatabaseUrl } from '@feedback/db/testing';
import { buildApp } from '../app.ts';
import type { AuthPort } from '../auth/port.ts';
import { loadEnv } from '../env.ts';

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

/** Builds the app against the API's test database with fake auth. Close both when done. */
export async function buildTestApp() {
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: testDatabaseUrl('api'),
    CLERK_SECRET_KEY: 'sk_test_unused',
  });
  const db = createDb(env.DATABASE_URL);
  const app = await buildApp(env, { db, auth: fakeAuth });
  app.addHook('onClose', () => db.close());
  return { app, db };
}
