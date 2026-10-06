import { sql } from 'drizzle-orm';
import type { Db } from '../src/client.ts';

export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://demo:demo@localhost:5432/demo_test';

/** Empties every table so each test starts clean. */
export async function resetDb(db: Db): Promise<void> {
  await db.execute(sql`truncate table profiles, users restart identity cascade`);
}
