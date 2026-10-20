import { UnrecoverableError, Worker } from 'bullmq';
import { COVER_QUEUE, coverJobSchema } from '@feedback/shared';
import {
  COVER_FAILURE_REASONS,
  failCover,
  processCover,
  type CoverDeps,
  type CoverOutcome,
} from './job.ts';

export interface CoverWorkerOptions {
  redisUrl: string;
  /** Sends an error to monitoring; called once per job that ends in failure. */
  report: (err: unknown, context: Record<string, unknown>) => void;
}

/**
 * Consumes the cover queue, one job at a time, alongside the transcode worker in the same
 * process. Retries and backoff are set by the API when it adds the job; when the last attempt
 * throws, the cover is marked failed so the artist isn't left waiting on it.
 */
export function startCoverWorker(deps: CoverDeps, { redisUrl, report }: CoverWorkerOptions) {
  const { log } = deps;
  const worker = new Worker<unknown, CoverOutcome>(
    COVER_QUEUE,
    async (job) => {
      // Job data crosses a trust boundary (CLAUDE.md section 10), so check it like a request.
      const parsed = coverJobSchema.safeParse(job.data);
      if (!parsed.success) {
        const err = new UnrecoverableError('invalid cover job payload');
        report(err, { jobId: job.id });
        throw err;
      }
      const { coverId } = parsed.data;

      try {
        return await processCover(deps, coverId);
      } catch (err) {
        const attempt = job.attemptsMade + 1;
        const lastAttempt = attempt >= (job.opts.attempts ?? 1);
        log.warn({ err, coverId, attempt, lastAttempt }, 'cover attempt failed');
        if (lastAttempt) {
          report(err, { coverId, attempt });
          await failCover(deps.db, log, coverId, COVER_FAILURE_REASONS.gaveUp).catch(
            (markErr: unknown) => log.error({ err: markErr, coverId }, 'could not mark failed'),
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
