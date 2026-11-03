import { Queue, Worker } from 'bullmq';
import {
  AVATAR_QUEUE,
  COVER_QUEUE,
  JOB_OPTIONS,
  MAINTENANCE_QUEUE,
  TRANSCODE_QUEUE,
} from '@feedback/shared';
import { sweepStuckUploads, type JobStates, type SweepDeps, type UploadKind } from './sweep.ts';

/** How often the sweep runs. */
export const SWEEP_EVERY_MS = 15 * 60 * 1000;
/** The scheduler's id: upserting it on every start keeps one schedule, however many workers run. */
const SCHEDULER_ID = 'stuck-uploads';

export interface CleanupOptions {
  redisUrl: string;
  everyMs?: number;
  /** BullMQ's key prefix; tests set their own. */
  prefix?: string;
}

/** Where each kind of upload is processed, and the job data its worker expects. */
const QUEUES: Record<UploadKind, { name: string; job: string; data: (id: string) => object }> = {
  version: { name: TRANSCODE_QUEUE, job: 'transcode', data: (versionId) => ({ versionId }) },
  cover: { name: COVER_QUEUE, job: 'cover', data: (coverId) => ({ coverId }) },
  avatar: { name: AVATAR_QUEUE, job: 'avatar', data: (avatarId) => ({ avatarId }) },
};

/**
 * The job queues as the sweep sees them, on BullMQ. A requeued job is added exactly as the API
 * adds one (queue.ts in the API): same name, data, job id, and options.
 */
export function bullmqJobStates(
  redisUrl: string,
  prefix?: string,
): JobStates & { close(): Promise<void> } {
  const connection = { url: redisUrl, maxRetriesPerRequest: null };
  const queues = Object.fromEntries(
    Object.entries(QUEUES).map(([kind, { name }]) => [
      kind,
      new Queue(name, { connection, ...(prefix && { prefix }) }),
    ]),
  ) as Record<UploadKind, Queue>;
  return {
    state: (kind, id) => queues[kind].getJobState(id),
    async requeue(kind, id) {
      const { job, data } = QUEUES[kind];
      await queues[kind].add(job, data(id), { ...JOB_OPTIONS, jobId: id });
    },
    async close() {
      await Promise.all(Object.values(queues).map((queue) => queue.close()));
    },
  };
}

/**
 * Runs the stuck-upload sweep every 15 minutes, on the maintenance queue. The schedule lives in
 * Redis, so with several workers only one sweep runs per tick; a sweep that throws is reported
 * and the next tick tries again. Startup doesn't wait on Redis: the schedule is set up in the
 * background, like the other workers' connections.
 */
export function startCleanup(
  deps: Omit<SweepDeps, 'jobs'>,
  { redisUrl, everyMs = SWEEP_EVERY_MS, prefix }: CleanupOptions,
) {
  const connection = { url: redisUrl, maxRetriesPerRequest: null };
  const jobs = bullmqJobStates(redisUrl, prefix);
  const maintenance = new Queue(MAINTENANCE_QUEUE, { connection, ...(prefix && { prefix }) });
  const worker = new Worker(
    MAINTENANCE_QUEUE,
    async () => {
      try {
        return await sweepStuckUploads({ ...deps, jobs });
      } catch (err) {
        deps.report(err, { job: SCHEDULER_ID });
        throw err;
      }
    },
    { connection, concurrency: 1, ...(prefix && { prefix }) },
  );
  // An EventEmitter without an 'error' listener crashes the process. These are connection
  // errors (e.g. Redis restarting), which BullMQ retries on its own.
  worker.on('error', (err) => deps.log.warn({ err }, 'job queue connection error'));
  maintenance.on('error', (err) => deps.log.warn({ err }, 'job queue connection error'));
  maintenance
    .upsertJobScheduler(
      SCHEDULER_ID,
      { every: everyMs },
      // A failed sweep isn't retried: the next tick is another try.
      { name: SCHEDULER_ID, opts: { removeOnComplete: 100, removeOnFail: 100 } },
    )
    .catch((err: unknown) => deps.report(err, { job: SCHEDULER_ID, step: 'schedule' }));

  return {
    async close() {
      await worker.close();
      await Promise.all([maintenance.close(), jobs.close()]);
    },
  };
}
