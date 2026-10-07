import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from './client.ts';

const migrationsFolder = fileURLToPath(new URL('../migrations', import.meta.url));

/** Applies all pending migrations to the database at `url`. */
export async function runMigrations(url: string): Promise<void> {
  const db = createDb(url);
  try {
    await migrate(db, { migrationsFolder });
  } finally {
    await db.close();
  }
}
