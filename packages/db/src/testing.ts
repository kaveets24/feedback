// Helpers for integration tests. Each package gets its own database so turbo can run test
// suites in parallel without them truncating each other's tables.
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import type { Db } from './client.ts';
import { runMigrations } from './migrate.ts';

const serverUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://feedback:feedback@localhost:5432/postgres';

/** Connection URL for the `feedback_test_<name>` database on the test server. */
export function testDatabaseUrl(name: string): string {
  const url = new URL(serverUrl);
  url.pathname = `/feedback_test_${name}`;
  return url.toString();
}

/** Creates `feedback_test_<name>` if needed and applies all migrations. Call from a vitest globalSetup. */
export async function prepareTestDatabase(name: string): Promise<void> {
  const admin = postgres(serverUrl, { onnotice: () => {} });
  try {
    const dbName = `feedback_test_${name}`;
    const [row] = await admin`select 1 from pg_database where datname = ${dbName}`;
    if (!row) await admin.unsafe(`create database "${dbName}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(testDatabaseUrl(name));
}

/** Empties every table so each test starts clean. */
export async function resetDb(db: Db): Promise<void> {
  await db.execute(
    sql`truncate table track_versions, tracks, profiles, users restart identity cascade`,
  );
}
