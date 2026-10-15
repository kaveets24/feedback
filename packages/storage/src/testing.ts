// Helpers for integration tests against the local S3 stand-in (pnpm services:up). Each package
// gets its own bucket so turbo can run test suites in parallel.
import type { StorageConfig } from './config.ts';
import { createStorage } from './storage.ts';

/** Config for the `feedback-test-<name>` bucket. TEST_STORAGE_ENDPOINT overrides the server. */
export function testStorageConfig(name: string): StorageConfig {
  return {
    endpoint: process.env.TEST_STORAGE_ENDPOINT ?? 'http://localhost:8333',
    region: 'us-east-1',
    bucket: `feedback-test-${name}`,
    // The local dev credentials from docker-compose.yml.
    accessKeyId: 'feedback',
    secretAccessKey: 'feedback-dev-secret',
  };
}

/** The origin test buckets allow in CORS. */
export const TEST_ORIGIN = 'http://localhost:3000';

/** Creates the package's test bucket if needed. Call from a vitest globalSetup. */
export async function prepareTestBucket(name: string): Promise<void> {
  const storage = createStorage(testStorageConfig(name));
  try {
    await storage.ensureBucket({ corsOrigins: [TEST_ORIGIN] });
  } finally {
    storage.close();
  }
}
