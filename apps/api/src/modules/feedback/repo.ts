import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  avatars,
  feedback,
  profiles,
  trackVersions,
  tracks,
  type Db,
  type Feedback,
  type Track,
  type TrackVersion,
} from '@feedback/db';

export async function insertFeedback(
  db: Db,
  values: {
    trackVersionId: string;
    authorId: string;
    body: string;
    parentId?: string;
    timestampMs?: number | null;
  },
): Promise<Feedback> {
  const [row] = await db.insert(feedback).values(values).returning();
  if (!row) throw new Error('insert returned no feedback');
  return row;
}

/** A comment (deleted or not) with its version and track, or null if the track was deleted. */
export async function findFeedback(
  db: Db,
  feedbackId: string,
): Promise<{ feedback: Feedback; version: TrackVersion; track: Track } | null> {
  const [row] = await db
    .select({ feedback, version: trackVersions, track: tracks })
    .from(feedback)
    .innerJoin(trackVersions, eq(trackVersions.id, feedback.trackVersionId))
    .innerJoin(tracks, eq(tracks.id, trackVersions.trackId))
    .where(and(eq(feedback.id, feedbackId), isNull(tracks.deletedAt)));
  return row ?? null;
}

/**
 * A thread's top-level comment and its replies, deleted ones included: top-level comments pinned
 * in timeline order, then general ones, each oldest first (ids are UUIDv7), and replies oldest
 * first. For one version, or for one thread (its top-level comment and replies).
 */
export async function listFeedback(
  db: Db,
  where: { versionId: string } | { threadId: string },
): Promise<Feedback[]> {
  return db
    .select()
    .from(feedback)
    .where(
      'versionId' in where
        ? eq(feedback.trackVersionId, where.versionId)
        : sql`${feedback.id} = ${where.threadId} or ${feedback.parentId} = ${where.threadId}`,
    )
    .orderBy(sql`${feedback.timestampMs} asc nulls last`, asc(feedback.id));
}

export async function updateFeedback(
  db: Db,
  feedbackId: string,
  set: Partial<Pick<Feedback, 'body' | 'status' | 'resolvedAt' | 'deletedAt'>>,
): Promise<Feedback | null> {
  const [row] = await db
    .update(feedback)
    .set(set)
    .where(and(eq(feedback.id, feedbackId), isNull(feedback.deletedAt)))
    .returning();
  return row ?? null;
}

/** Each author's display name and current picture's stored key (if any), by user id. */
export async function findAuthors(
  db: Db,
  userIds: string[],
): Promise<
  Map<string, { displayName: string | null; handle: string | null; avatarKey: string | null }>
> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({
      userId: profiles.userId,
      displayName: profiles.displayName,
      handle: profiles.handle,
      avatarKey: avatars.imageKey,
    })
    .from(profiles)
    .leftJoin(avatars, and(eq(avatars.id, profiles.currentAvatarId), eq(avatars.status, 'ready')))
    .where(inArray(profiles.userId, userIds));
  return new Map(rows.map(({ userId, ...author }) => [userId, author]));
}
