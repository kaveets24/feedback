import { Queue } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createDb, trackVersions } from '@feedback/db';
import { resetDb, testDatabaseUrl } from '@feedback/db/testing';
import { JOB_OPTIONS, MAINTENANCE_QUEUE, TRANSCODE_QUEUE } from '@feedback/shared';
import { createStorage } from '@feedback/storage';
import { testStorageConfig } from '@feedback/storage/testing';
import { processingVersion, silentLog } from '../testing.ts';
import { STUCK_AFTER_MS } from './sweep.ts';
import { bullmqJobStates, startCleanup } from './worker.ts';

// Against the compose Redis in database 2, like the other worker tests, under a prefix of its
// own so it never races them for jobs. TEST_WORKER_REDIS_URL overrides.
const redisUrl = process.env.TEST_WORKER_REDIS_URL ?? 'redis://localhost:6379/2';
const prefix = 'cleanup-test';

const db = createDb(testDatabaseUrl('worker'));
const storage = createStorage(testStorageConfig('worker'));
const connection = { url: redisUrl };
const transcode = new Queue(TRANSCODE_QUEUE, { connection, prefix });
const maintenance = new Queue(MAINTENANCE_QUEUE, { connection, prefix });

beforeEach(async () => {
  await resetDb(db);
  await transcode.obliterate({ force: true });
  await maintenance.obliterate({ force: true });
});
afterAll(async () => {
  await transcode.obliterate({ force: true });
  await maintenance.obliterate({ force: true });
  await Promise.all([transcode.close(), maintenance.close()]);
  storage.close();
  await db.close();
});

/** Resolves once `check` is true, polling; fails the test after a few seconds. */
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 50; i++) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('timed out');
}

describe('bullmqJobStates', () => {
  it('reports a missing job as unknown and requeues it the way the API queues one', async () => {
    const jobs = bullmqJobStates(redisUrl, prefix);
    const id = crypto.randomUUID();
    expect(await jobs.state('version', id)).toBe('unknown');

    await jobs.requeue('version', id);
    await jobs.requeue('version', id);
    expect(await jobs.state('version', id)).toBe('waiting');
    const job = await transcode.getJob(id);
    expect(job?.name).toBe('transcode');
    expect(job?.data).toEqual({ versionId: id });
    expect(job?.opts.attempts).toBe(JOB_OPTIONS.attempts);
    // The job id is the upload id, so requeueing twice queued it once.
    expect(await transcode.getJobCounts('waiting')).toEqual({ waiting: 1 });
    await jobs.close();
  });
});

describe('startCleanup', () => {
  it('runs the sweep on its schedule', async () => {
    const version = await processingVersion(db, storage);
    // Processing for longer than the sweep waits, with no job behind it.
    await db
      .update(trackVersions)
      .set({ updatedAt: new Date(Date.now() - STUCK_AFTER_MS - 60_000) });
    const reports: unknown[] = [];
    const cleanup = startCleanup(
      { db, storage, log: silentLog, report: (err) => reports.push(err) },
      { redisUrl, everyMs: 200, prefix },
    );

    try {
      // The sweep found the lost job and queued it again.
      await until(async () => (await transcode.getJobState(version.id)) === 'waiting');
      expect(reports).toEqual([]);
    } finally {
      await cleanup.close();
    }
  });
});
