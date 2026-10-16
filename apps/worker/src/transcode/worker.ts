import { UnrecoverableError, Worker } from 'bullmq';
import { TRANSCODE_QUEUE, transcodeJobSchema } from '@feedback/shared';
import {
  FAILURE_REASONS,
  failVersion,
  transcodeVersion,
  type TranscodeDeps,
  type TranscodeOutcome,
} from './job.ts';

export interface TranscodeWorkerOptions {
  redisUrl: string;
  /** Sends an error to monitoring; called once per job that ends in failure. */
  report: (err: unknown, context: Record<string, unknown>) => void;
}

/**
 * Consumes the transcode queue, one job at a time (ffmpeg uses the whole CPU of a small
 * machine). Retries and backoff are set by the API when it adds the job; when the last attempt
 * throws, the version is marked failed so the artist isn't left waiting on it. A job interrupted
 * by a restart stalls and BullMQ runs it again, which `transcodeVersion` allows.
 */
export function startTranscodeWorker(
  deps: TranscodeDeps,
  { redisUrl, report }: TranscodeWorkerOptions,
) {
  const { log } = deps;
  const worker = new Worker<unknown, TranscodeOutcome>(
    TRANSCODE_QUEUE,
    async (job) => {
      // Job data crosses a trust boundary (CLAUDE.md section 10), so check it like a request.
      const parsed = transcodeJobSchema.safeParse(job.data);
      if (!parsed.success) {
        const err = new UnrecoverableError('invalid transcode job payload');
        report(err, { jobId: job.id });
        throw err;
      }
      const { versionId } = parsed.data;

      try {
        return await transcodeVersion(deps, versionId);
      } catch (err) {
        const attempt = job.attemptsMade + 1;
        const lastAttempt = attempt >= (job.opts.attempts ?? 1);
        log.warn({ err, versionId, attempt, lastAttempt }, 'transcode attempt failed');
        if (lastAttempt) {
          report(err, { versionId, attempt });
          await failVersion(deps.db, log, versionId, FAILURE_REASONS.gaveUp).catch(
            (markErr: unknown) => log.error({ err: markErr, versionId }, 'could not mark failed'),
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
