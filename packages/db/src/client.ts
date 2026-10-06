import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.ts';

export function createDb(url: string) {
  const sql = postgres(url, { onnotice: () => {} });
  const db = drizzle(sql, { schema });
  return Object.assign(db, { close: () => sql.end() });
}

export type Db = ReturnType<typeof createDb>;
