import { Queue } from 'bullmq';
import { COVER_QUEUE, TRANSCODE_QUEUE, type CoverJob, type TranscodeJob } from '@feedback/shared';

/** Where the API hands work to the worker. Tests swap in a fake. */
export interface JobQueue {
  /**
   * Queues processing for an uploaded version. The job id is the version id, so queueing the
   * same version again while its job still exists does nothing.
   */
  enqueueTranscode(versionId: string): Promise<void>;
  /** Queues re-encoding for an uploaded cover; the cover id is the job id, likewise. */
  enqueueCover(coverId: string): Promise<void>;
  /** Whether Redis answers, and how many workers are consuming the transcode queue. */
  health(): Promise<QueueHealth>;
  /** Called with connection errors, which happen in the background (e.g. Redis restarting). */
  onError(listener: (err: Error) => void): void;
  close(): Promise<void>;
}

export interface QueueHealth {
  redis: boolean;
  workers: number;
}

/** How long a request waits to queue a job before giving up (and the client retries). */
const ENQUEUE_TIMEOUT_MS = 5000;
/** How long a health check waits on Redis; it's down if it hasn't answered by then. */
const HEALTH_TIMEOUT_MS = 2000;

/** Rejects with `message` if `promise` hasn't settled within `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  // If the timeout wins, the promise may still reject later; that's already been handled.
  promise.catch(() => {});
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(message)), ms).unref();
    }),
  ]);
}

/**
 * The job queue on Redis with BullMQ (ADR 0008). Startup never waits on Redis, and the
 * connection keeps retrying through an outage: bullmq checks the Redis version once, when the
 * queue is created, and a failed check would break the queue until a restart, so commands wait
 * for Redis rather than fail. Requests don't wait with them: `enqueueTranscode` gives up after a
 * few seconds, and the client retries "complete", which queues again. A job that's added late
 * anyway is harmless, since the version id is its job id.
 */
export function bullmqJobQueue(
  redisUrl: string,
  {
    enqueueTimeoutMs = ENQUEUE_TIMEOUT_MS,
    healthTimeoutMs = HEALTH_TIMEOUT_MS,
    prefix,
  }: {
    enqueueTimeoutMs?: number;
    healthTimeoutMs?: number;
    /**
     * BullMQ's key and client-name prefix (default `bull`, which the worker uses too). Tests set
     * their own: Redis counts connected workers server-wide, across databases.
     */
    prefix?: string;
  } = {},
): JobQueue {
  const queueOptions = {
    connection: { url: redisUrl, maxRetriesPerRequest: null },
    ...(prefix && { prefix }),
    skipWaitingForReady: true,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 10_000 },
      // Kept for a while to look into, then dropped so Redis doesn't fill up (it never evicts).
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  };
  const transcode = new Queue<TranscodeJob>(TRANSCODE_QUEUE, queueOptions);
  const cover = new Queue<CoverJob>(COVER_QUEUE, queueOptions);
  // An EventEmitter without an 'error' listener crashes the process, so listen from the start.
  let report: (err: Error) => void = () => {};
  transcode.on('error', (err) => report(err));
  cover.on('error', (err) => report(err));

  return {
    async enqueueTranscode(versionId) {
      await withTimeout(
        transcode.add('transcode', { versionId }, { jobId: versionId }),
        enqueueTimeoutMs,
        'Timed out adding a job; is Redis reachable?',
      );
    },
    async enqueueCover(coverId) {
      await withTimeout(
        cover.add('cover', { coverId }, { jobId: coverId }),
        enqueueTimeoutMs,
        'Timed out adding a job; is Redis reachable?',
      );
    },
    async health() {
      try {
        // Workers are counted from Redis's client list, so this also checks Redis answers.
        const workers = await withTimeout(
          transcode.getWorkersCount(),
          healthTimeoutMs,
          'Timed out checking the job queue',
        );
        return { redis: true, workers };
      } catch {
        return { redis: false, workers: 0 };
      }
    },
    onError(listener) {
      report = listener;
    },
    close: async () => {
      await Promise.all([transcode.close(), cover.close()]);
    },
  };
}
