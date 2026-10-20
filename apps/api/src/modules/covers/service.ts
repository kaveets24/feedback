import {
  createCover,
  findCover,
  markCoverFailed,
  markCoverProcessing,
  removeProjectCover,
  type Db,
  type ProjectCover,
} from '@feedback/db';
import type { CoverResponse, CreateCoverRequest, CreateCoverResponse } from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import type { JobQueue } from '../../queue.ts';
import { loadProjectFor } from '../projects/service.ts';
import { UPLOAD_URL_SECONDS } from '../uploads/service.ts';
import { toCoverResponse } from './images.ts';
import { IMAGE_SNIFF_BYTES, sniffImage } from './sniff.ts';

export interface CoverUploadDeps {
  db: Db;
  storage: Storage;
  queue: JobQueue;
}

// Shown to the artist on a failed cover, so plain words and what to do next.
export const COVER_FAILURE_REASONS = {
  sizeMismatch: "The uploaded image isn't the size we expected. Try uploading it again.",
  typeMismatch: "The uploaded image isn't the type we expected. Try uploading it again.",
  notImage: "This file isn't a JPEG, PNG, or WebP image. Choose another image.",
} as const;

/**
 * Starts new cover art for a project: records the upload (`uploading`) and returns where the
 * browser PUTs the image. The owner only (`manage`); anyone else gets a 404.
 */
export async function startCoverUpload(
  { db, storage }: Pick<CoverUploadDeps, 'db' | 'storage'>,
  actor: Actor,
  projectId: string,
  input: CreateCoverRequest,
): Promise<CreateCoverResponse> {
  await loadProjectFor(db, actor, projectId, 'manage');
  const cover = await createCover(db, { projectId, ...input });
  const url = await storage.presignUpload({
    key: cover.originalKey,
    contentType: input.contentType,
    contentLength: input.sizeBytes,
    expiresIn: UPLOAD_URL_SECONDS,
  });
  return {
    coverId: cover.id,
    upload: {
      url,
      method: 'PUT',
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(Date.now() + UPLOAD_URL_SECONDS * 1000).toISOString(),
    },
  };
}

/**
 * A cover upload of this project, if the actor may manage the project; else 404. An upload's
 * progress is the owner's business: anyone else only sees the finished cover.
 */
async function loadCoverFor(
  db: Db,
  actor: Actor,
  projectId: string,
  coverId: string,
): Promise<ProjectCover> {
  await loadProjectFor(db, actor, projectId, 'manage');
  const found = await findCover(db, coverId);
  if (!found || found.cover.projectId !== projectId) throw httpError(404, 'NOT_FOUND', 'Not found');
  return found.cover;
}

/**
 * Called once the browser's PUT succeeds. Checks the stored file is one of the accepted images,
 * then moves the cover to `processing` and queues the worker, or to `failed` with a reason. Safe
 * to repeat, like completing an audio upload: a cover still `processing` is queued again (a no-op
 * if its job exists), so retrying after a queue error recovers.
 */
export async function completeCoverUpload(
  deps: CoverUploadDeps,
  actor: Actor,
  projectId: string,
  coverId: string,
): Promise<CoverResponse> {
  let cover = await loadCoverFor(deps.db, actor, projectId, coverId);
  if (cover.status === 'uploading') cover = await checkCover(deps, cover);
  if (cover.status === 'processing') await deps.queue.enqueueCover(cover.id);
  return toCoverResponse(cover);
}

async function checkCover(
  { db, storage }: Pick<CoverUploadDeps, 'db' | 'storage'>,
  cover: ProjectCover,
): Promise<ProjectCover> {
  const stored = await storage.head(cover.originalKey);
  if (!stored) {
    // Not a failure: the PUT may still be running, or can be retried while its URL is valid.
    throw httpError(409, 'UPLOAD_INCOMPLETE', 'The file has not finished uploading');
  }

  let reason: string | null = null;
  if (stored.size !== cover.originalSizeBytes) {
    reason = COVER_FAILURE_REASONS.sizeMismatch;
  } else if (stored.contentType !== cover.originalContentType) {
    reason = COVER_FAILURE_REASONS.typeMismatch;
  } else {
    const start = await storage.readStart(cover.originalKey, IMAGE_SNIFF_BYTES);
    if (!start || !sniffImage(start)) reason = COVER_FAILURE_REASONS.notImage;
  }

  const updated = reason
    ? await markCoverFailed(db, cover.id, reason)
    : await markCoverProcessing(db, cover.id);
  if (updated) return updated;

  // Another request moved it first (a concurrent "complete"); use what it decided.
  const current = await findCover(db, cover.id);
  if (!current) throw httpError(404, 'NOT_FOUND', 'Not found');
  return current.cover;
}

/** A cover upload's state, for the project page to poll while it processes. */
export async function getCover(
  db: Db,
  actor: Actor,
  projectId: string,
  coverId: string,
): Promise<CoverResponse> {
  return toCoverResponse(await loadCoverFor(db, actor, projectId, coverId));
}

/** Takes the cover off the project. Its uploads stay, until Phase 7's cleanup. */
export async function removeCover(db: Db, actor: Actor, projectId: string): Promise<void> {
  await loadProjectFor(db, actor, projectId, 'manage');
  if (!(await removeProjectCover(db, projectId))) throw httpError(404, 'NOT_FOUND', 'Not found');
}
