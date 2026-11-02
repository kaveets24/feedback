import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { Queue, type Worker } from 'bullmq';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, findCover } from '@feedback/db';
import { resetDb, testDatabaseUrl } from '@feedback/db/testing';
import { COVER_QUEUE } from '@feedback/shared';
import { createStorage, type Storage } from '@feedback/storage';
import { testStorageConfig } from '@feedback/storage/testing';
import { processingCover, silentLog } from '../testing.ts';
import { COVER_FAILURE_REASONS } from './job.ts';
import { startCoverWorker } from './worker.ts';

// Against the compose Redis, in database 2 like the transcode worker's tests (a different queue,
// so they don't take each other's jobs). TEST_WORKER_REDIS_URL overrides.
const redisUrl = process.env.TEST_WORKER_REDIS_URL ?? 'redis://localhost:6379/2';
const exec = promisify(execFile);

const db = createDb(testDatabaseUrl('worker'));
const storage = createStorage(testStorageConfig('worker'));
const queue = new Queue(COVER_QUEUE, { connection: { url: redisUrl } });

let dir: string;
let worker: Worker | null = null;
let reports: Record<string, unknown>[] = [];

function start(workerStorage: Storage = storage) {
  worker = startCoverWorker(
    { db, storage: workerStorage, log: silentLog },
    { redisUrl, report: (_err, context) => reports.push(context) },
  );
}

/** Adds a job the way the API does (queue.ts), with retries quick enough for a test. */
const add = (data: unknown, attempts = 3) =>
  queue.add('cover', data, { attempts, backoff: { type: 'fixed', delay: 10 } });

async function png() {
  const path = join(dir, 'cover.png');
  await exec('ffmpeg', [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=teal:s=64x64',
    '-frames:v',
    '1',
    path,
  ]);
  return path;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cover-worker-'));
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

const status = async (coverId: string) => (await findCover(db, coverId))?.cover.status;

describe('cover worker', () => {
  it('processes a queued cover until it is ready', async () => {
    const cover = await processingCover(db, storage, await png());
    start();
    const job = await add({ coverId: cover.id });

    await expect.poll(() => status(cover.id), { timeout: 15_000 }).toBe('ready');
    await expect.poll(() => job.getState()).toBe('completed');
    expect(reports).toEqual([]);
  });

  it('retries errors, then marks the cover failed and reports once', async () => {
    const cover = await processingCover(db, storage, await png());
    const broken = createStorage(testStorageConfig('no-such-bucket'));
    try {
      start(broken);
      const job = await add({ coverId: cover.id }, 2);

      await expect.poll(() => job.getState(), { timeout: 15_000 }).toBe('failed');
      expect((await queue.getJob(job.id!))?.attemptsMade).toBe(2);
      expect((await findCover(db, cover.id))?.cover).toMatchObject({
        status: 'failed',
        failureReason: COVER_FAILURE_REASONS.gaveUp,
      });
      expect(reports).toEqual([{ image: 'cover', imageId: cover.id, attempt: 2 }]);
    } finally {
      broken.close();
    }
  });

  it('fails an invalid payload without retrying', async () => {
    start();
    const job = await add({ coverId: 'not-a-uuid' });

    await expect.poll(() => job.getState()).toBe('failed');
    expect((await queue.getJob(job.id!))?.attemptsMade).toBe(1);
    expect(reports).toEqual([{ jobId: job.id }]);
  });
});
