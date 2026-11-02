import { Queue, Worker } from 'bullmq';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AVATAR_QUEUE, COVER_QUEUE, TRANSCODE_QUEUE } from '@feedback/shared';
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

  it('adds one cover job per cover, keyed by the cover id', async () => {
    const covers = new Queue(COVER_QUEUE, { connection: { url: redisUrl } });
    try {
      await covers.obliterate({ force: true });
      const coverId = crypto.randomUUID();
      await queue.enqueueCover(coverId);
      await queue.enqueueCover(coverId);

      const jobs = await covers.getJobs(['waiting']);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ id: coverId, name: 'cover', data: { coverId } });
      expect(jobs[0]?.opts).toMatchObject({ attempts: 3 });
    } finally {
      await covers.obliterate({ force: true });
      await covers.close();
    }
  });

  it('adds one avatar job per picture, keyed by the avatar id', async () => {
    const avatars = new Queue(AVATAR_QUEUE, { connection: { url: redisUrl } });
    try {
      await avatars.obliterate({ force: true });
      const avatarId = crypto.randomUUID();
      await queue.enqueueAvatar(avatarId);
      await queue.enqueueAvatar(avatarId);

      const jobs = await avatars.getJobs(['waiting']);
      expect(jobs).toHaveLength(1);
      expect(jobs[0]).toMatchObject({ id: avatarId, name: 'avatar', data: { avatarId } });
      expect(jobs[0]?.opts).toMatchObject({ attempts: 3 });
    } finally {
      await avatars.obliterate({ force: true });
      await avatars.close();
    }
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

describe('bullmqJobQueue health', () => {
  // A prefix of its own: Redis counts workers across all databases, so the worker package's tests
  // (on database 2, default prefix) would otherwise show up here.
  const prefix = `health-test-${crypto.randomUUID()}`;

  it('counts workers consuming the transcode queue', async () => {
    const queue = bullmqJobQueue(redisUrl, { prefix });
    try {
      expect(await queue.health()).toEqual({ redis: true, workers: 0 });
      const worker = new Worker(TRANSCODE_QUEUE, async () => {}, {
        connection: { url: redisUrl, maxRetriesPerRequest: null },
        prefix,
      });
      await expect.poll(() => queue.health()).toEqual({ redis: true, workers: 1 });
      await worker.close();
      await expect.poll(() => queue.health()).toEqual({ redis: true, workers: 0 });
    } finally {
      await queue.close();
    }
  });

  it('reports Redis down when it is unreachable', async () => {
    const down = bullmqJobQueue('redis://127.0.0.1:1', { healthTimeoutMs: 200 });
    try {
      expect(await down.health()).toEqual({ redis: false, workers: 0 });
    } finally {
      await down.close();
    }
  });
});
