import { UnrecoverableError, Worker } from 'bullmq';
import { AVATAR_QUEUE, avatarJobSchema, COVER_QUEUE, coverJobSchema } from '@feedback/shared';
import {
  AVATAR_IMAGE,
  COVER_FAILURE_REASONS,
  COVER_IMAGE,
  failImage,
  processImage,
  type CoverDeps,
  type CoverOutcome,
  type ImageKind,
} from './job.ts';

export interface CoverWorkerOptions {
  redisUrl: string;
  /** Sends an error to monitoring; called once per job that ends in failure. */
  report: (err: unknown, context: Record<string, unknown>) => void;
}

/** A queue of image jobs: its name, its kind, and the upload id out of a job's (checked) data. */
interface ImageQueue {
  queue: string;
  kind: ImageKind;
  idFrom: (data: unknown) => string | null;
}

const COVERS: ImageQueue = {
  queue: COVER_QUEUE,
  kind: COVER_IMAGE,
  idFrom: (data) => coverJobSchema.safeParse(data).data?.coverId ?? null,
};

const AVATARS: ImageQueue = {
  queue: AVATAR_QUEUE,
  kind: AVATAR_IMAGE,
  idFrom: (data) => avatarJobSchema.safeParse(data).data?.avatarId ?? null,
};

/**
 * Consumes an image queue, one job at a time, alongside the transcode worker in the same process.
 * Retries and backoff are set by the API when it adds the job; when the last attempt throws, the
 * upload is marked failed so nobody is left waiting on it.
 */
function startImageWorker(
  deps: CoverDeps,
  { queue, kind, idFrom }: ImageQueue,
  { redisUrl, report }: CoverWorkerOptions,
) {
  const { log } = deps;
  const worker = new Worker<unknown, CoverOutcome>(
    queue,
    async (job) => {
      // Job data crosses a trust boundary (CLAUDE.md section 10), so check it like a request.
      const id = idFrom(job.data);
      if (!id) {
        const err = new UnrecoverableError(`invalid ${kind.name} job payload`);
        report(err, { jobId: job.id });
        throw err;
      }

      try {
        return await processImage(deps, kind, id);
      } catch (err) {
        const attempt = job.attemptsMade + 1;
        const lastAttempt = attempt >= (job.opts.attempts ?? 1);
        log.warn(
          { err, image: kind.name, imageId: id, attempt, lastAttempt },
          'image attempt failed',
        );
        if (lastAttempt) {
          report(err, { image: kind.name, imageId: id, attempt });
          await failImage(deps.db, log, kind, id, COVER_FAILURE_REASONS.gaveUp).catch(
            (markErr: unknown) => log.error({ err: markErr, imageId: id }, 'could not mark failed'),
          );
        }
        throw err;
      }
    },
    {
      connection: { url: redisUrl, maxRetriesPerRequest: null },
      concurrency: 1,
    },
  );
  // An EventEmitter without an 'error' listener crashes the process. These are connection
  // errors (e.g. Redis restarting), which BullMQ retries on its own.
  worker.on('error', (err) => log.warn({ err }, 'job queue connection error'));
  return worker;
}

/** Consumes the cover queue. */
export const startCoverWorker = (deps: CoverDeps, options: CoverWorkerOptions) =>
  startImageWorker(deps, COVERS, options);

/** Consumes the profile picture queue. */
export const startAvatarWorker = (deps: CoverDeps, options: CoverWorkerOptions) =>
  startImageWorker(deps, AVATARS, options);
