import type { Logger } from 'pino';
import {
  deleteAbandonedTracks,
  failAbandonedAvatars,
  failAbandonedCovers,
  failAbandonedVersions,
  findStuckProcessing,
  markAvatarFailed,
  markCoverFailed,
  markVersionFailed,
  type AbandonedUpload,
  type Db,
} from '@feedback/db';
import type { Storage } from '@feedback/storage';
import { COVER_FAILURE_REASONS } from '../cover/job.ts';
import { FAILURE_REASONS } from '../transcode/job.ts';

/** The three processing queues, by what they process. */
export type UploadKind = 'version' | 'cover' | 'avatar';

/**
 * What the sweep needs from the job queues: a job's state (BullMQ's `getJobState`, which is
 * `unknown` when there's no such job) and a way to queue one again. Tests pass a fake.
 */
export interface JobStates {
  state(kind: UploadKind, id: string): Promise<string>;
  requeue(kind: UploadKind, id: string): Promise<void>;
}

export interface SweepDeps {
  db: Db;
  storage: Storage;
  log: Logger;
  jobs: JobStates;
  /** Sends an error to monitoring: every upload the sweep has to fail after processing. */
  report: (err: unknown, context: Record<string, unknown>) => void;
}

// Shown to whoever started the upload, like the worker's other failure reasons.
export const CLEANUP_REASONS = {
  /** The upload never finished: the tab closed or the connection dropped before "complete". */
  abandoned: "The upload didn't finish. Try uploading it again.",
} as const;

/**
 * An upload still `uploading` this long after it started is abandoned. Its upload URL lasted 15
 * minutes (UPLOAD_URL_SECONDS in the API), so nothing can arrive by now; the margin leaves a slow
 * "complete" call plenty of room.
 */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;
/**
 * An upload `processing` this long may have lost its job. A job waiting behind others, or
 * running, is left alone whatever its age; only a missing, failed, or completed one is acted on.
 */
export const STUCK_AFTER_MS = 60 * 60 * 1000;
/** At most this many of each kind per sweep, so one sweep stays short; the next one continues. */
export const SWEEP_LIMIT = 200;

/** Job states that mean the job is still going to run (or is running). */
const LIVE_STATES = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);

export interface SweepResult {
  abandoned: { versions: number; covers: number; avatars: number };
  /** Tracks soft-deleted because no file ever arrived for them. */
  deletedTracks: number;
  /** Processing uploads whose job was missing, queued again. */
  requeued: number;
  /** Processing uploads whose job had failed or finished without them, marked failed. */
  failed: number;
}

/**
 * One cleanup pass:
 *
 * 1. Uploads still `uploading` a day after they started are marked failed (the artist sees "The
 *    upload didn't finish"), and whatever reached storage of them is deleted.
 * 2. Tracks that never got a file (every version abandoned) are soft-deleted, like a deletion by
 *    their owner, so they don't linger in the database or appear as failed in lists.
 * 3. Uploads `processing` for over an hour are checked against their job. A missing job (Redis
 *    was unreachable when it was queued, say) is queued again; the job id is the upload id, so
 *    that can't double up. A job that failed (a worker killed mid-job until BullMQ gave up on it,
 *    which skips the worker's own last-attempt handling) or completed without the upload moving
 *    on means nothing will finish it: it's marked failed and reported.
 *
 * Safe to run on several workers at once: every change is compare-and-set.
 */
export async function sweepStuckUploads(deps: SweepDeps, now = new Date()): Promise<SweepResult> {
  const { db, log } = deps;
  const abandonedBefore = new Date(now.getTime() - ABANDONED_AFTER_MS);
  const options = {
    before: abandonedBefore,
    reason: CLEANUP_REASONS.abandoned,
    limit: SWEEP_LIMIT,
  };

  const versions = await failAbandonedVersions(db, options);
  const covers = await failAbandonedCovers(db, options);
  const avatars = await failAbandonedAvatars(db, options);
  await deleteOriginals(deps, [...versions, ...covers, ...avatars]);
  // Every pass, not just after abandoning something, so a deletion that failed last time is
  // picked up again.
  const deletedTracks = await deleteAbandonedTracks(db, CLEANUP_REASONS.abandoned);

  const stuck = await findStuckProcessing(db, {
    before: new Date(now.getTime() - STUCK_AFTER_MS),
    limit: SWEEP_LIMIT,
  });
  let requeued = 0;
  let failed = 0;
  const checks: [UploadKind, string[]][] = [
    ['version', stuck.versions],
    ['cover', stuck.covers],
    ['avatar', stuck.avatars],
  ];
  for (const [kind, ids] of checks) {
    for (const id of ids) {
      const state = await deps.jobs.state(kind, id);
      if (LIVE_STATES.has(state)) continue;
      if (state === 'unknown') {
        await deps.jobs.requeue(kind, id);
        requeued++;
        log.warn({ kind, id }, 'processing upload had no job; queued it again');
        continue;
      }
      if (await failStuck(db, kind, id)) {
        failed++;
        deps.report(new Error('Upload stuck processing after its job ended'), {
          kind,
          id,
          jobState: state,
        });
      }
    }
  }

  const result: SweepResult = {
    abandoned: { versions: versions.length, covers: covers.length, avatars: avatars.length },
    deletedTracks: deletedTracks.length,
    requeued,
    failed,
  };
  const changed =
    versions.length + covers.length + avatars.length + deletedTracks.length + requeued + failed;
  if (changed > 0) log.info(result, 'cleaned up stuck uploads');
  return result;
}

/** Marks a stuck processing upload failed, the way its worker does after the last attempt. */
function failStuck(db: Db, kind: UploadKind, id: string): Promise<unknown> {
  switch (kind) {
    case 'version':
      return markVersionFailed(db, id, FAILURE_REASONS.gaveUp);
    case 'cover':
      return markCoverFailed(db, id, COVER_FAILURE_REASONS.gaveUp);
    case 'avatar':
      return markAvatarFailed(db, id, COVER_FAILURE_REASONS.gaveUp);
  }
}

/**
 * Deletes what reached storage of abandoned uploads (usually nothing, or a complete file whose
 * "complete" never came). A failure is logged, not thrown: the rest of the pass still runs.
 */
async function deleteOriginals({ storage, log }: SweepDeps, uploads: AbandonedUpload[]) {
  for (const { id, originalKey } of uploads) {
    try {
      await storage.delete(originalKey);
    } catch (err) {
      log.warn({ err, id }, 'could not delete an abandoned upload');
    }
  }
}
