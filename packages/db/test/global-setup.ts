import postgres from 'postgres';
import { runMigrations } from '../src/migrate.ts';
import { testDatabaseUrl } from './db.ts';

/** Creates the test database if needed and brings it up to the latest migration. */
export default async function setup(): Promise<void> {
  const url = new URL(testDatabaseUrl);
  const name = url.pathname.slice(1);
  url.pathname = '/postgres';

  const admin = postgres(url.toString(), { onnotice: () => {} });
  try {
    const [row] = await admin`select 1 from pg_database where datname = ${name}`;
    if (!row) await admin.unsafe(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  await runMigrations(testDatabaseUrl);
}
