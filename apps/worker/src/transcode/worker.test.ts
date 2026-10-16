import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Queue, type Worker } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, findVersion } from '@feedback/db';
import { resetDb, testDatabaseUrl } from '@feedback/db/testing';
import { TRANSCODE_QUEUE } from '@feedback/shared';
import { createStorage, type Storage } from '@feedback/storage';
import { testStorageConfig } from '@feedback/storage/testing';
import { makeFixture, processingVersion, silentLog } from '../testing.ts';
import { FAILURE_REASONS } from './job.ts';
import { startTranscodeWorker } from './worker.ts';

// Against the compose Redis (pnpm services:up), in database 2: local dev uses 0 and the API's
// queue tests use 1, which would otherwise race this worker for jobs. TEST_WORKER_REDIS_URL
// overrides.
const redisUrl = process.env.TEST_WORKER_REDIS_URL ?? 'redis://localhost:6379/2';

const db = createDb(testDatabaseUrl('worker'));
const storage = createStorage(testStorageConfig('worker'));
const queue = new Queue(TRANSCODE_QUEUE, { connection: { url: redisUrl } });

let dir: string;
let worker: Worker | null = null;
let reports: Record<string, unknown>[] = [];

function start(workerStorage: Storage = storage) {
  worker = startTranscodeWorker(
    { db, storage: workerStorage, log: silentLog },
    { redisUrl, report: (_err, context) => reports.push(context) },
  );
}

/** Adds a job the way the API does (queue.ts), with retries quick enough for a test. */
const add = (data: unknown, attempts = 3) =>
  queue.add('transcode', data, { attempts, backoff: { type: 'fixed', delay: 10 } });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'worker-test-'));
});
beforeEach(async () => {
  await resetDb(db);
  await queue.obliterate({ force: true });
  reports = [];
});
afterEach(async () => {
  await worker?.close();
  worker = null;
});
afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await rm(dir, { recursive: true, force: true });
  storage.close();
  await db.close();
});

const status = async (versionId: string) => (await findVersion(db, versionId))?.version.status;

describe('transcode worker', () => {
  it('processes a queued version until it is ready', async () => {
    const version = await processingVersion(db, storage, await makeFixture(dir, 'tone.flac'));
    start();
    const job = await add({ versionId: version.id });

    await expect.poll(() => status(version.id), { timeout: 15_000 }).toBe('ready');
    await expect.poll(() => job.getState()).toBe('completed');
    expect(reports).toEqual([]);
  });

  it('retries errors, then marks the version failed and reports once', async () => {
    const version = await processingVersion(db, storage, await makeFixture(dir, 'tone.wav'));
    const broken = createStorage(testStorageConfig('no-such-bucket'));
    try {
      start(broken);
      const job = await add({ versionId: version.id }, 2);

      await expect.poll(() => job.getState(), { timeout: 15_000 }).toBe('failed');
      expect((await queue.getJob(job.id!))?.attemptsMade).toBe(2);
      const { version: failed } = (await findVersion(db, version.id))!;
      expect(failed).toMatchObject({ status: 'failed', failureReason: FAILURE_REASONS.gaveUp });
      expect(reports).toEqual([{ versionId: version.id, attempt: 2 }]);
    } finally {
      broken.close();
    }
  });

  it('fails an invalid payload without retrying', async () => {
    start();
    const job = await add({ versionId: 'not-a-uuid' });

    await expect.poll(() => job.getState()).toBe('failed');
    expect((await queue.getJob(job.id!))?.attemptsMade).toBe(1);
    expect(reports).toEqual([{ jobId: job.id }]);
  });
});
