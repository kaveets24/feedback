import { and, count, desc, eq, inArray, isNull, lt, type SQL } from 'drizzle-orm';
import {
  feedback,
  notifications,
  trackVersions,
  tracks,
  type Db,
  type Feedback,
  type Notification,
} from '@feedback/db';
import type { NotificationType } from '@feedback/shared';

export async function insertNotification(
  db: Db,
  values: { userId: string; type: NotificationType; feedbackId: string },
): Promise<void> {
  await db.insert(notifications).values(values);
}

/**
 * A user's notifications whose comment is still there (not deleted, on a live track of theirs):
 * the rest are quietly left out rather than deleted, so nothing points at a comment that's gone.
 */
function visible(userId: string, ...more: SQL[]) {
  return and(
    eq(notifications.userId, userId),
    isNull(feedback.deletedAt),
    isNull(tracks.deletedAt),
    eq(tracks.ownerId, userId),
    ...more,
  );
}

const joined = (db: Db) =>
  db
    .select({
      notification: notifications,
      feedback,
      track: { id: tracks.id, title: tracks.title },
      versionNumber: trackVersions.versionNumber,
    })
    .from(notifications)
    .innerJoin(feedback, eq(feedback.id, notifications.feedbackId))
    .innerJoin(trackVersions, eq(trackVersions.id, feedback.trackVersionId))
    .innerJoin(tracks, eq(tracks.id, trackVersions.trackId));

export type NotificationRow = {
  notification: Notification;
  feedback: Feedback;
  track: { id: string; title: string };
  versionNumber: number;
};

/** Newest first (ids are UUIDv7), `limit` of them, before `cursor` if given. */
export async function listNotifications(
  db: Db,
  userId: string,
  { cursor, limit }: { cursor?: string; limit: number },
): Promise<NotificationRow[]> {
  return joined(db)
    .where(visible(userId, ...(cursor ? [lt(notifications.id, cursor)] : [])))
    .orderBy(desc(notifications.id))
    .limit(limit);
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const [row] = await db
    .select({ count: count() })
    .from(notifications)
    .innerJoin(feedback, eq(feedback.id, notifications.feedbackId))
    .innerJoin(trackVersions, eq(trackVersions.id, feedback.trackVersionId))
    .innerJoin(tracks, eq(tracks.id, trackVersions.trackId))
    .where(visible(userId, isNull(notifications.readAt)));
  return row?.count ?? 0;
}

/** Marks these of the user's notifications read; anyone else's ids are ignored. */
export async function markRead(db: Db, userId: string, ids: string[]): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
        isNull(notifications.readAt),
      ),
    );
}
