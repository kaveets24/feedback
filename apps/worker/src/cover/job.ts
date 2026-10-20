import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { findCover, markCoverFailed, markCoverReady, type Db } from '@feedback/db';
import type { Storage } from '@feedback/storage';
import { COVER_CONTENT_TYPE, encodeCover, UnusableImageError } from './ffmpeg.ts';

export interface CoverDeps {
  db: Db;
  storage: Storage;
  log: Logger;
}

// Shown to the artist on a failed cover.
export const COVER_FAILURE_REASONS = {
  missingOriginal: "We couldn't find the uploaded image. Try uploading it again.",
  /** After every retry failed for a reason that wasn't the image's fault. */
  gaveUp: 'Something went wrong while processing this image. Try uploading it again.',
} as const;

/** What a run did: `skipped` means the cover wasn't `processing` (already handled, or gone). */
export type CoverOutcome = 'ready' | 'failed' | 'skipped';

/** Where a cover's re-encoded JPEG is stored (keyed by cover id, like streams by version id). */
export const coverKey = (coverId: string) => `covers/${coverId}.jpg`;

/**
 * Processes one uploaded cover: re-encodes the original into a clean square JPEG, stores it, and
 * marks the cover `ready` (it becomes the project's cover unless a newer one already is), or
 * `failed` with a reason if the image can't be used. Then it deletes the original, which may still
 * hold the photo's EXIF, GPS included.
 *
 * Safe to run again for the same cover: it skips covers that aren't `processing`, the output key
 * is fixed so a rerun overwrites it, and the status updates are compare-and-set. Throws on errors
 * worth retrying (storage, database, ffmpeg crashing).
 */
export async function processCover(deps: CoverDeps, coverId: string): Promise<CoverOutcome> {
  const { db, storage } = deps;
  const log = deps.log.child({ coverId });

  const found = await findCover(db, coverId);
  if (!found || found.cover.status !== 'processing') {
    log.info({ status: found?.cover.status ?? 'missing' }, 'skipping cover');
    return 'skipped';
  }
  const { originalKey } = found.cover;

  const dir = await mkdtemp(join(tmpdir(), 'cover-'));
  try {
    const original = join(dir, 'original');
    const output = join(dir, 'cover.jpg');

    if (!(await storage.download(originalKey, original))) {
      return await failCover(db, log, coverId, COVER_FAILURE_REASONS.missingOriginal);
    }

    try {
      await encodeCover(original, output);
    } catch (err) {
      if (!(err instanceof UnusableImageError)) throw err;
      const outcome = await failCover(db, log, coverId, err.reason);
      await deleteOriginal(storage, log, originalKey);
      return outcome;
    }

    const key = coverKey(coverId);
    await storage.upload(key, output, COVER_CONTENT_TYPE);
    const ready = await markCoverReady(db, coverId, key);
    log.info({ updated: Boolean(ready) }, 'cover ready');
    await deleteOriginal(storage, log, originalKey);
    return ready ? 'ready' : 'skipped';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Marks a cover failed with a reason the artist will see. */
export async function failCover(
  db: Db,
  log: Logger,
  coverId: string,
  reason: string,
): Promise<CoverOutcome> {
  const failed = await markCoverFailed(db, coverId, reason);
  log.info({ reason, updated: Boolean(failed) }, 'cover failed');
  return failed ? 'failed' : 'skipped';
}

/**
 * Deletes an original once it's no longer needed. A failure here doesn't fail the job: the cover
 * is already done, and Phase 7's cleanup sweeps leftover originals.
 */
async function deleteOriginal(storage: Storage, log: Logger, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch (err) {
    log.warn({ err }, 'could not delete cover original');
  }
}
