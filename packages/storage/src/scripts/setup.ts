// Creates the local bucket and its CORS rules (run by pnpm services:up). Safe to run repeatedly.
import { z } from 'zod';
import { loadStorageConfig } from '../config.ts';
import { createStorage } from '../storage.ts';

let config;
let webOrigin;
try {
  config = loadStorageConfig();
  webOrigin = z.url().default('http://localhost:3000').parse(process.env.WEB_ORIGIN);
} catch (err) {
  console.error(`${(err as Error).message}\n(locally: .env; see .env.example)`);
  process.exit(1);
}

const storage = createStorage(config);
try {
  await storage.ensureBucket({ corsOrigins: [webOrigin] });
  console.log(`Bucket "${config.bucket}" ready at ${config.endpoint} (CORS: ${webOrigin}).`);
} finally {
  storage.close();
}
