import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from 'pino';
import { findVersion, markVersionFailed, markVersionReady, type Db } from '@feedback/db';
import type { Storage } from '@feedback/storage';
import {
  STREAM_CONTENT_TYPE,
  transcode,
  UnusableAudioError,
  type TranscodeOptions,
} from './ffmpeg.ts';

export interface TranscodeDeps {
  db: Db;
  storage: Storage;
  log: Logger;
  /** Overrides for tests (e.g. a short duration limit). */
  ffmpeg?: TranscodeOptions;
}

// Shown to the artist on a failed version.
export const FAILURE_REASONS = {
  missingOriginal: "We couldn't find the uploaded file. Try uploading it again.",
  /** After every retry failed for a reason that wasn't the file's fault. */
  gaveUp: 'Something went wrong while processing this file. Try uploading it again.',
} as const;

/** What a run did: `skipped` means the version wasn't `processing` (already handled, or gone). */
export type TranscodeOutcome = 'ready' | 'failed' | 'skipped';

/** Where the stream file for a version is stored (ADR 0008: keyed by version id). */
export const streamKey = (versionId: string) => `streams/${versionId}`;

/**
 * Processes one uploaded version: transcodes the original, stores the stream file, and marks the
 * version `ready` with its duration and peaks, or `failed` with a reason if the file can't be
 * used. Safe to run again for the same version: it skips versions that aren't `processing`, the
 * stream key is fixed so a rerun overwrites it, and the status updates are compare-and-set.
 * Throws on errors worth retrying (storage, database, ffmpeg crashing).
 */
export async function transcodeVersion(
  deps: TranscodeDeps,
  versionId: string,
): Promise<TranscodeOutcome> {
  const { db, storage } = deps;
  const log = deps.log.child({ versionId });

  const found = await findVersion(db, versionId);
  if (!found || found.version.status !== 'processing') {
    log.info({ status: found?.version.status ?? 'missing' }, 'skipping transcode');
    return 'skipped';
  }

  const dir = await mkdtemp(join(tmpdir(), 'transcode-'));
  try {
    const original = join(dir, 'original');
    const stream = join(dir, 'stream.m4a');

    if (!(await storage.download(found.version.originalKey, original))) {
      return await failVersion(db, log, versionId, FAILURE_REASONS.missingOriginal);
    }

    let result;
    try {
      result = await transcode(original, stream, deps.ffmpeg);
    } catch (err) {
      if (err instanceof UnusableAudioError)
        return await failVersion(db, log, versionId, err.reason);
      throw err;
    }

    const key = streamKey(versionId);
    await storage.upload(key, stream, STREAM_CONTENT_TYPE);
    const ready = await markVersionReady(db, versionId, { streamKey: key, ...result });
    log.info({ durationMs: result.durationMs, updated: Boolean(ready) }, 'version ready');
    return ready ? 'ready' : 'skipped';
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Marks a version failed with a reason the artist will see. */
export async function failVersion(
  db: Db,
  log: Logger,
  versionId: string,
  reason: string,
): Promise<TranscodeOutcome> {
  const failed = await markVersionFailed(db, versionId, reason);
  log.info({ reason, updated: Boolean(failed) }, 'version failed');
  return failed ? 'failed' : 'skipped';
}
