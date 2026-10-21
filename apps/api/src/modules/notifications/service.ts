import type { Db, User } from '@feedback/db';
import {
  NOTIFICATION_EXCERPT_LENGTH,
  type MarkNotificationsReadRequest,
  type NotificationListResponse,
  type UnreadCountResponse,
} from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import { authorsFor } from '../feedback/service.ts';
import { countUnread, listNotifications, markRead } from './repo.ts';

// A user's own notifications: there's no resource to authorize beyond being them. For now they're
// only ever about comments on the user's own tracks, which the artist can always read.

export interface NotificationDeps {
  db: Db;
  storage: Storage;
}

/** The start of a comment on one line, cut with an ellipsis if it's long. */
export function excerpt(body: string): string {
  const line = body.replace(/\s+/g, ' ').trim();
  if (line.length <= NOTIFICATION_EXCERPT_LENGTH) return line;
  return `${line.slice(0, NOTIFICATION_EXCERPT_LENGTH - 1).trimEnd()}…`;
}

export async function getNotifications(
  { db, storage }: NotificationDeps,
  user: User,
  query: { cursor?: string; limit: number },
): Promise<NotificationListResponse> {
  // One extra tells whether there's another page.
  const rows = await listNotifications(db, user.id, { ...query, limit: query.limit + 1 });
  const page = rows.slice(0, query.limit);
  const authors = await authorsFor(db, storage, [...new Set(page.map((r) => r.feedback.authorId))]);
  return {
    notifications: page.map(({ notification, feedback, track, versionNumber }) => ({
      id: notification.id,
      type: notification.type,
      read: notification.readAt !== null,
      createdAt: notification.createdAt.toISOString(),
      actor: authors.get(feedback.authorId) ?? { displayName: null, avatar: null },
      track,
      versionNumber,
      feedbackId: feedback.id,
      excerpt: excerpt(feedback.body),
    })),
    nextCursor: rows.length > query.limit ? (page.at(-1)?.notification.id ?? null) : null,
  };
}

export async function getUnreadCount(db: Db, user: User): Promise<UnreadCountResponse> {
  return { count: await countUnread(db, user.id) };
}

export async function readNotifications(
  db: Db,
  user: User,
  input: MarkNotificationsReadRequest,
): Promise<void> {
  await markRead(db, user.id, input.ids);
}
