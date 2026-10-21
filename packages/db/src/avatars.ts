import { and, desc, eq, inArray, isNull, lt, or } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { statusesBefore } from '@feedback/shared';
import type { Db } from './client.ts';
import { avatars, profiles, type Avatar } from './schema.ts';

// Profile pictures follow the cover art lifecycle (covers.ts), owned by a user instead of a
// project. The worker runs these too, so they live here rather than in the API.

/**
 * Starts a picture upload (`uploading`) for a user. The original's storage key is derived from the
 * avatar id (`avatar-originals/<avatarId>`), next to the cover originals' prefix.
 */
export async function createAvatar(
  db: Db,
  input: { userId: string; contentType: string; sizeBytes: number },
): Promise<Avatar> {
  const id = uuidv7();
  const [avatar] = await db
    .insert(avatars)
    .values({
      id,
      userId: input.userId,
      originalKey: `avatar-originals/${id}`,
      originalContentType: input.contentType,
      originalSizeBytes: input.sizeBytes,
    })
    .returning();
  if (!avatar) throw new Error('insert returned no avatar');
  return avatar;
}

export async function findAvatar(db: Db, avatarId: string): Promise<Avatar | null> {
  const [avatar] = await db.select().from(avatars).where(eq(avatars.id, avatarId));
  return avatar ?? null;
}

/** A user's newest picture upload in any status, or null if they have none. */
export async function latestAvatar(db: Db, userId: string): Promise<Avatar | null> {
  const [avatar] = await db
    .select()
    .from(avatars)
    .where(eq(avatars.userId, userId))
    .orderBy(desc(avatars.id))
    .limit(1);
  return avatar ?? null;
}

/** The user's current profile picture (always `ready`), or null if they have none. */
export async function currentAvatar(db: Db, userId: string): Promise<Avatar | null> {
  const [row] = await db
    .select({ avatar: avatars })
    .from(profiles)
    .innerJoin(avatars, eq(avatars.id, profiles.currentAvatarId))
    .where(and(eq(profiles.userId, userId), eq(avatars.status, 'ready')));
  return row?.avatar ?? null;
}

// Compare-and-set, like the cover and version status updates: repeats and retries are harmless.

/** `uploading -> processing`, once the upload is confirmed. */
export async function markAvatarProcessing(db: Db, avatarId: string): Promise<Avatar | null> {
  const [avatar] = await db
    .update(avatars)
    .set({ status: 'processing' })
    .where(and(eq(avatars.id, avatarId), inArray(avatars.status, statusesBefore('processing'))))
    .returning();
  return avatar ?? null;
}

/** `uploading | processing -> failed`, with a reason for the user. */
export async function markAvatarFailed(
  db: Db,
  avatarId: string,
  reason: string,
): Promise<Avatar | null> {
  const [avatar] = await db
    .update(avatars)
    .set({ status: 'failed', failureReason: reason })
    .where(and(eq(avatars.id, avatarId), inArray(avatars.status, statusesBefore('failed'))))
    .returning();
  return avatar ?? null;
}

/**
 * `processing -> ready`, with the stored JPEG, and makes it the user's picture unless a newer one
 * already is (avatar ids are UUIDv7, so they order by when the upload started). Creates the
 * user's profile if they haven't saved one yet.
 */
export async function markAvatarReady(
  db: Db,
  avatarId: string,
  imageKey: string,
): Promise<Avatar | null> {
  return db.transaction(async (tx) => {
    const [avatar] = await tx
      .update(avatars)
      .set({ status: 'ready', imageKey })
      .where(and(eq(avatars.id, avatarId), inArray(avatars.status, statusesBefore('ready'))))
      .returning();
    if (!avatar) return null;
    await tx
      .insert(profiles)
      .values({ userId: avatar.userId, currentAvatarId: avatar.id })
      .onConflictDoUpdate({
        target: profiles.userId,
        set: { currentAvatarId: avatar.id, updatedAt: new Date() },
        setWhere: or(isNull(profiles.currentAvatarId), lt(profiles.currentAvatarId, avatar.id)),
      });
    return avatar;
  });
}

/** Takes the user's picture off (its uploads stay). Doing it with no picture changes nothing. */
export async function removeAvatar(db: Db, userId: string): Promise<void> {
  await db.update(profiles).set({ currentAvatarId: null }).where(eq(profiles.userId, userId));
}
