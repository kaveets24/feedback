import { Queue } from 'bullmq';
import { TRANSCODE_QUEUE, type TranscodeJob } from '@feedback/shared';

/** Where the API hands work to the worker. Tests swap in a fake. */
export interface JobQueue {
  /**
   * Queues processing for an uploaded version. The job id is the version id, so queueing the
   * same version again while its job still exists does nothing.
   */
  enqueueTranscode(versionId: string): Promise<void>;
  /** Called with connection errors, which happen in the background (e.g. Redis restarting). */
  onError(listener: (err: Error) => void): void;
  close(): Promise<void>;
}

/** How long a request waits to queue a job before giving up (and the client retries). */
const ENQUEUE_TIMEOUT_MS = 5000;

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
  { enqueueTimeoutMs = ENQUEUE_TIMEOUT_MS }: { enqueueTimeoutMs?: number } = {},
): JobQueue {
  const transcode = new Queue<TranscodeJob>(TRANSCODE_QUEUE, {
    connection: { url: redisUrl, maxRetriesPerRequest: null },
    skipWaitingForReady: true,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      // Kept for a while to look into, then dropped so Redis doesn't fill up (it never evicts).
      removeOnComplete: { age: 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    },
  });
  // An EventEmitter without an 'error' listener crashes the process, so listen from the start.
  let report: (err: Error) => void = () => {};
  transcode.on('error', (err) => report(err));

  return {
    async enqueueTranscode(versionId) {
      const added = transcode.add('transcode', { versionId }, { jobId: versionId });
      // If the timeout wins, the add may still fail later; that's already been handled.
      added.catch(() => {});
      await Promise.race([
        added,
        new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error('Timed out adding a job; is Redis reachable?')),
            enqueueTimeoutMs,
          ).unref();
        }),
      ]);
    },
    onError(listener) {
      report = listener;
    },
    close: () => transcode.close(),
  };
}
