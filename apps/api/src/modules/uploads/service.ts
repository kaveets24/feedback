import {
  createNextVersion,
  createTrackInProject,
  createTrackWithFirstVersion,
  findVersion,
  markVersionFailed,
  markVersionProcessing,
  type Db,
  type TrackVersion,
} from '@feedback/db';
import type {
  CreateUploadRequest,
  CreateUploadResponse,
  CreateVersionRequest,
  VersionResponse,
} from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import type { JobQueue } from '../../queue.ts';
import { loadProjectFor } from '../projects/service.ts';
import { loadTrackFor } from '../tracks/service.ts';
import { loadVersionFor, toVersionResponse } from '../versions/service.ts';
import { sniffAudio, SNIFF_BYTES } from './sniff.ts';

export interface UploadDeps {
  db: Db;
  storage: Storage;
  queue: JobQueue;
}

/** How long the browser has to start the PUT (docs/permissions.md, rule 5: at most 15 min). */
export const UPLOAD_URL_SECONDS = 15 * 60;

// Shown to the artist on a failed version, so plain words and what to do next.
export const FAILURE_REASONS = {
  sizeMismatch: "The uploaded file isn't the size we expected. Try uploading it again.",
  typeMismatch: "The uploaded file isn't the type we expected. Try uploading it again.",
  notAudio:
    "This file isn't a supported audio format. Upload an mp3, wav, m4a, aac, flac, or ogg file.",
} as const;

/**
 * Creates the track and its v1 (`uploading`), with any details given, and a URL the browser PUTs
 * the file to. There's no track to check access on yet: a signed-in, approved user (the gate
 * checks approval) may always create their own private track. A project is checked like any other,
 * so one that isn't theirs is a 404 and nothing is created.
 */
export async function startUpload(
  { db, storage }: Pick<UploadDeps, 'db' | 'storage'>,
  actor: Actor,
  input: CreateUploadRequest,
): Promise<CreateUploadResponse> {
  if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');

  const details = {
    ownerId: actor.user.id,
    title: input.title,
    genre: input.genre,
    // Blank is stored as none.
    feedbackPrompt: input.feedbackPrompt || null,
    original: {
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    },
  };
  if (!input.projectId) {
    const { version } = await createTrackWithFirstVersion(db, details);
    return uploadFor(storage, version);
  }

  await loadProjectFor(db, actor, input.projectId, 'manage');
  const created = await createTrackInProject(db, { ...details, projectId: input.projectId });
  // Null only if the project was deleted since the check above.
  if (!created) throw httpError(404, 'NOT_FOUND', 'Not found');
  return uploadFor(storage, created.version);
}

/**
 * Adds the track's next version (`uploading`) and returns where to PUT its file. Finishing it is
 * the same `complete` call as for v1. The owner only: anyone else gets a 404.
 */
export async function startVersionUpload(
  { db, storage }: Pick<UploadDeps, 'db' | 'storage'>,
  actor: Actor,
  trackId: string,
  input: CreateVersionRequest,
): Promise<CreateUploadResponse> {
  await loadTrackFor(db, actor, trackId, 'manage');
  const version = await createNextVersion(db, {
    trackId,
    // Blank is stored as none.
    changeNotes: input.changeNotes || null,
    feedbackPrompt: input.feedbackPrompt || null,
    original: {
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    },
  });
  // Null only if the track was deleted since the check above.
  if (!version) throw httpError(404, 'NOT_FOUND', 'Not found');
  return uploadFor(storage, version);
}

/** A presigned PUT for a new version's original; the size and type are signed into it. */
async function uploadFor(storage: Storage, version: TrackVersion): Promise<CreateUploadResponse> {
  const contentType = version.originalContentType;
  const url = await storage.presignUpload({
    key: version.originalKey,
    contentType,
    contentLength: version.originalSizeBytes,
    expiresIn: UPLOAD_URL_SECONDS,
  });
  return {
    trackId: version.trackId,
    versionId: version.id,
    upload: {
      url,
      method: 'PUT',
      headers: { 'content-type': contentType },
      expiresAt: new Date(Date.now() + UPLOAD_URL_SECONDS * 1000).toISOString(),
    },
  };
}

/**
 * Called once the browser's PUT succeeds. Checks the stored file, then moves the version to
 * `processing` and queues it, or to `failed` with a reason. Safe to repeat: a version already
 * past `uploading` is returned as it is, and one still `processing` is queued again (a no-op if
 * its job exists), so retrying after a queue error recovers.
 */
export async function completeUpload(
  deps: UploadDeps,
  actor: Actor,
  versionId: string,
): Promise<VersionResponse> {
  let { version } = await loadVersionFor(deps.db, actor, versionId, 'manage');
  if (version.status === 'uploading') version = await checkUpload(deps, version);
  if (version.status === 'processing') await deps.queue.enqueueTranscode(version.id);
  return toVersionResponse(version, true);
}

async function checkUpload(
  { db, storage }: Pick<UploadDeps, 'db' | 'storage'>,
  version: TrackVersion,
): Promise<TrackVersion> {
  const stored = await storage.head(version.originalKey);
  if (!stored) {
    // Not a failure: the PUT may still be running, or can be retried while its URL is valid.
    throw httpError(409, 'UPLOAD_INCOMPLETE', 'The file has not finished uploading');
  }

  // The size and type are signed into the upload URL, so storage should already have refused
  // a mismatch; check anyway rather than trust the storage provider.
  let reason: string | null = null;
  if (stored.size !== version.originalSizeBytes) {
    reason = FAILURE_REASONS.sizeMismatch;
  } else if (stored.contentType !== version.originalContentType) {
    reason = FAILURE_REASONS.typeMismatch;
  } else {
    const start = await storage.readStart(version.originalKey, SNIFF_BYTES);
    if (!start || !sniffAudio(start)) reason = FAILURE_REASONS.notAudio;
  }

  const updated = reason
    ? await markVersionFailed(db, version.id, reason)
    : await markVersionProcessing(db, version.id);
  if (updated) return updated;

  // Another request moved it first (a concurrent "complete"); use what it decided.
  const current = await findVersion(db, version.id);
  if (!current) throw httpError(404, 'NOT_FOUND', 'Not found');
  return current.version;
}
