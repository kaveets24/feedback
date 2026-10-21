import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'pino';
import {
  findAvatar,
  findCover,
  markAvatarFailed,
  markAvatarReady,
  markCoverFailed,
  markCoverReady,
  type Db,
} from '@feedback/db';
import { AVATAR_MAX_SIZE, COVER_MAX_SIZE, type VersionStatus } from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import { COVER_CONTENT_TYPE, encodeCover, UnusableImageError } from './ffmpeg.ts';

export interface CoverDeps {
  db: Db;
  storage: Storage;
  log: Logger;
}

// Shown to whoever uploaded a failed image.
export const COVER_FAILURE_REASONS = {
  missingOriginal: "We couldn't find the uploaded image. Try uploading it again.",
  /** After every retry failed for a reason that wasn't the image's fault. */
  gaveUp: 'Something went wrong while processing this image. Try uploading it again.',
} as const;

/** What a run did: `skipped` means the image wasn't `processing` (already handled, or gone). */
export type CoverOutcome = 'ready' | 'failed' | 'skipped';

/**
 * One kind of uploaded image the worker re-encodes into a clean square JPEG: a project's cover
 * art or a profile picture. They differ only in their rows, where the JPEG goes, and its size.
 */
export interface ImageKind {
  /** For logs. */
  name: 'cover' | 'avatar';
  maxSize: number;
  /** Where the re-encoded JPEG is stored (keyed by the upload's id, like streams by version id). */
  outputKey: (id: string) => string;
  /** The upload, or null if it's gone (or its project was deleted). */
  find: (db: Db, id: string) => Promise<{ status: VersionStatus; originalKey: string } | null>;
  /** Compare-and-set `processing -> ready`; it then becomes the current image if newest. */
  markReady: (db: Db, id: string, key: string) => Promise<unknown>;
  /** Compare-and-set `uploading | processing -> failed`. */
  markFailed: (db: Db, id: string, reason: string) => Promise<unknown>;
}

/** Where a cover's re-encoded JPEG is stored. */
export const coverKey = (coverId: string) => `covers/${coverId}.jpg`;
/** Where a profile picture's re-encoded JPEG is stored. */
export const avatarKey = (avatarId: string) => `avatars/${avatarId}.jpg`;

export const COVER_IMAGE: ImageKind = {
  name: 'cover',
  maxSize: COVER_MAX_SIZE,
  outputKey: coverKey,
  find: async (db, id) => (await findCover(db, id))?.cover ?? null,
  markReady: markCoverReady,
  markFailed: markCoverFailed,
};

export const AVATAR_IMAGE: ImageKind = {
  name: 'avatar',
  maxSize: AVATAR_MAX_SIZE,
  outputKey: avatarKey,
  find: findAvatar,
  markReady: markAvatarReady,
  markFailed: markAvatarFailed,
};

/**
 * Processes one uploaded image: re-encodes the original into a clean square JPEG, stores it, and
 * marks the upload `ready` (it becomes the current cover or picture unless a newer one already
 * is), or `failed` with a reason if the image can't be used. Then it deletes the original, which
 * may still hold the photo's EXIF, GPS included.
 *
 * Safe to run again for the same upload: it skips uploads that aren't `processing`, the output
 * key is fixed so a rerun overwrites it, and the status updates are compare-and-set. Throws on
 * errors worth retrying (storage, database, ffmpeg crashing).
 */
export async function processImage(
  deps: CoverDeps,
  kind: ImageKind,
  id: string,
): Promise<CoverOutcome> {
  const { db, storage } = deps;
  const log = deps.log.child({ image: kind.name, imageId: id });

  const found = await kind.find(db, id);
  if (!found || found.status !== 'processing') {
    log.info({ status: found?.status ?? 'missing' }, 'skipping image');
    return 'skipped';
  }
  const { originalKey } = found;

  const dir = await mkdtemp(join(tmpdir(), `${kind.name}-`));
  try {
    const original = join(dir, 'original');
    const output = join(dir, 'image.jpg');

    if (!(await storage.download(originalKey, original))) {
      return await failImage(db, log, kind, id, COVER_FAILURE_REASONS.missingOriginal);
    }

    try {
      await encodeCover(original, output, kind.maxSize);
    } catch (err) {
      if (!(err instanceof UnusableImageError)) throw err;
      const outcome = await failImage(db, log, kind, id, err.reason);
      await deleteOriginal(storage, log, originalKey);
      return outcome;
    }

    const key = kind.outputKey(id);
    await storage.upload(key, output, COVER_CONTENT_TYPE);
    const ready = await kind.markReady(db, id, key);
    log.info({ updated: Boolean(ready) }, 'image ready');
    await deleteOriginal(storage, log, originalKey);
    return ready ? 'ready' : 'skipped';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const processCover = (deps: CoverDeps, coverId: string) =>
  processImage(deps, COVER_IMAGE, coverId);
export const processAvatar = (deps: CoverDeps, avatarId: string) =>
  processImage(deps, AVATAR_IMAGE, avatarId);

/** Marks an upload failed with a reason the uploader will see. */
export async function failImage(
  db: Db,
  log: Logger,
  kind: ImageKind,
  id: string,
  reason: string,
): Promise<CoverOutcome> {
  const failed = await kind.markFailed(db, id, reason);
  log.info({ reason, updated: Boolean(failed) }, 'image failed');
  return failed ? 'failed' : 'skipped';
}

/** Marks a cover failed with a reason the artist will see. */
export const failCover = (db: Db, log: Logger, coverId: string, reason: string) =>
  failImage(db, log, COVER_IMAGE, coverId, reason);

/**
 * Deletes an original once it's no longer needed. A failure here doesn't fail the job: the image
 * is already done, and Phase 7's cleanup sweeps leftover originals.
 */
async function deleteOriginal(storage: Storage, log: Logger, key: string): Promise<void> {
  try {
    await storage.delete(key);
  } catch (err) {
    log.warn({ err }, 'could not delete image original');
  }
}
