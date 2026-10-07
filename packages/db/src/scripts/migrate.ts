import { runMigrations } from '../migrate.ts';
import { databaseUrl } from './env.ts';

await runMigrations(databaseUrl());
console.log('Migrations applied.');
