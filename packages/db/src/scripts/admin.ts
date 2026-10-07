import { runAdminCommand } from '../admin.ts';
import { createDb } from '../client.ts';
import { databaseUrl } from './env.ts';

const db = createDb(databaseUrl());
try {
  console.log(await runAdminCommand(db, process.argv.slice(2)));
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await db.close();
}
