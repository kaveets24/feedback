import { Queue } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { TRANSCODE_QUEUE } from '@feedback/shared';
import { bullmqJobQueue } from './queue.ts';

// Against the compose Redis (pnpm services:up), in database 1 so local dev data in database 0
// is left alone. TEST_REDIS_URL overrides it.
const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';

describe('bullmqJobQueue', () => {
  const queue = bullmqJobQueue(redisUrl);
  // A second handle on the same queue, to see what was added.
  const inspect = new Queue(TRANSCODE_QUEUE, { connection: { url: redisUrl } });

  beforeEach(() => inspect.obliterate({ force: true }));
  afterAll(async () => {
    await inspect.obliterate({ force: true });
    await Promise.all([queue.close(), inspect.close()]);
  });

  it('adds one job per version, keyed by the version id', async () => {
    const versionId = crypto.randomUUID();
    await queue.enqueueTranscode(versionId);
    await queue.enqueueTranscode(versionId);

    const jobs = await inspect.getJobs(['waiting']);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: versionId, name: 'transcode', data: { versionId } });
    expect(jobs[0]?.opts).toMatchObject({ attempts: 3 });
  });

  it('gives up quickly when Redis is unreachable, and reports the connection error', async () => {
    const down = bullmqJobQueue('redis://127.0.0.1:1', { enqueueTimeoutMs: 200 });
    const errors: Error[] = [];
    down.onError((err) => errors.push(err));
    try {
      await expect(down.enqueueTranscode(crypto.randomUUID())).rejects.toThrow(/Timed out/);
      await expect.poll(() => errors.length).toBeGreaterThan(0);
    } finally {
      await down.close();
    }
  });
});
