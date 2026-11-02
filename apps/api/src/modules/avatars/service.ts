import {
  createAvatar,
  currentAvatar,
  findAvatar,
  latestAvatar,
  markAvatarFailed,
  markAvatarProcessing,
  removeAvatar,
  type Avatar,
  type Db,
  type Profile,
  type User,
} from '@feedback/db';
import type {
  AvatarResponse,
  CoverImage,
  CreateAvatarRequest,
  CreateAvatarResponse,
} from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import { httpError } from '../../errors.ts';
import type { JobQueue } from '../../queue.ts';
import { COVER_URL_SECONDS } from '../covers/images.ts';
import { COVER_FAILURE_REASONS } from '../covers/service.ts';
import { IMAGE_SNIFF_BYTES, sniffImage } from '../covers/sniff.ts';
import { UPLOAD_URL_SECONDS } from '../uploads/service.ts';

// Profile pictures follow the cover art flow (../covers/service.ts), owned by the signed-in user:
// there's no resource to authorize beyond being them, and anyone else's upload is a 404.

export interface AvatarDeps {
  db: Db;
  storage: Storage;
  queue: JobQueue;
}

/** Starts a new profile picture: records the upload and returns where the browser PUTs it. */
export async function startAvatarUpload(
  { db, storage }: Pick<AvatarDeps, 'db' | 'storage'>,
  user: User,
  input: CreateAvatarRequest,
): Promise<CreateAvatarResponse> {
  const avatar = await createAvatar(db, { userId: user.id, ...input });
  const url = await storage.presignUpload({
    key: avatar.originalKey,
    contentType: input.contentType,
    contentLength: input.sizeBytes,
    expiresIn: UPLOAD_URL_SECONDS,
  });
  return {
    avatarId: avatar.id,
    upload: {
      url,
      method: 'PUT',
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(Date.now() + UPLOAD_URL_SECONDS * 1000).toISOString(),
    },
  };
}

/** One of the user's own picture uploads; anyone else's is a 404. */
async function loadOwnAvatar(db: Db, user: User, avatarId: string): Promise<Avatar> {
  const avatar = await findAvatar(db, avatarId);
  if (!avatar || avatar.userId !== user.id) throw httpError(404, 'NOT_FOUND', 'Not found');
  return avatar;
}

export function toAvatarResponse(avatar: Avatar): AvatarResponse {
  return { id: avatar.id, status: avatar.status, failureReason: avatar.failureReason };
}

/**
 * Called once the browser's PUT succeeds. Checks the stored file is one of the accepted images,
 * then moves the upload to `processing` and queues the worker, or to `failed` with a reason. Safe
 * to repeat, like completing a cover upload.
 */
export async function completeAvatarUpload(
  deps: AvatarDeps,
  user: User,
  avatarId: string,
): Promise<AvatarResponse> {
  let avatar = await loadOwnAvatar(deps.db, user, avatarId);
  if (avatar.status === 'uploading') avatar = await checkAvatar(deps, avatar);
  if (avatar.status === 'processing') await deps.queue.enqueueAvatar(avatar.id);
  return toAvatarResponse(avatar);
}

async function checkAvatar(
  { db, storage }: Pick<AvatarDeps, 'db' | 'storage'>,
  avatar: Avatar,
): Promise<Avatar> {
  const stored = await storage.head(avatar.originalKey);
  if (!stored) {
    // Not a failure: the PUT may still be running, or can be retried while its URL is valid.
    throw httpError(409, 'UPLOAD_INCOMPLETE', 'The file has not finished uploading');
  }

  let reason: string | null = null;
  if (stored.size !== avatar.originalSizeBytes) {
    reason = COVER_FAILURE_REASONS.sizeMismatch;
  } else if (stored.contentType !== avatar.originalContentType) {
    reason = COVER_FAILURE_REASONS.typeMismatch;
  } else {
    const start = await storage.readStart(avatar.originalKey, IMAGE_SNIFF_BYTES);
    if (!start || !sniffImage(start)) reason = COVER_FAILURE_REASONS.notImage;
  }

  const updated = reason
    ? await markAvatarFailed(db, avatar.id, reason)
    : await markAvatarProcessing(db, avatar.id);
  if (updated) return updated;

  // Another request moved it first (a concurrent "complete"); use what it decided.
  const current = await findAvatar(db, avatar.id);
  if (!current) throw httpError(404, 'NOT_FOUND', 'Not found');
  return current;
}

/** A picture upload's state, for the profile page to poll while it processes. */
export async function getAvatar(db: Db, user: User, avatarId: string): Promise<AvatarResponse> {
  return toAvatarResponse(await loadOwnAvatar(db, user, avatarId));
}

/** Takes the user's picture off. Its uploads stay, until Phase 7's cleanup. */
export async function removeOwnAvatar(db: Db, user: User): Promise<void> {
  await removeAvatar(db, user.id);
}

/**
 * The user's picture as a short-lived signed URL (CLAUDE.md section 6, rule 5), and their newest
 * upload if it's still processing or failed, for the profile response.
 */
export async function avatarForProfile(
  { db, storage }: Pick<AvatarDeps, 'db' | 'storage'>,
  user: User,
  profile: Profile | null,
): Promise<{ avatar: CoverImage | null; avatarUpload: AvatarResponse | null }> {
  const [current, latest] = await Promise.all([
    profile?.currentAvatarId ? currentAvatar(db, user.id) : null,
    latestAvatar(db, user.id),
  ]);
  const avatar = current?.imageKey
    ? {
        url: await storage.presignDownload({ key: current.imageKey, expiresIn: COVER_URL_SECONDS }),
        expiresAt: new Date(Date.now() + COVER_URL_SECONDS * 1000).toISOString(),
      }
    : null;
  const pending =
    latest &&
    latest.id !== current?.id &&
    (latest.status === 'processing' || latest.status === 'failed');
  return { avatar, avatarUpload: pending ? toAvatarResponse(latest) : null };
}
