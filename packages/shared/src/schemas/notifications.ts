import { z } from 'zod';
import { feedbackAuthorSchema } from './feedback.ts';

/** What happened: a new comment on one of your tracks, or a reply in a thread on one. */
export const NOTIFICATION_TYPES = ['comment', 'reply'] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

/** Longest stretch of a comment a notification quotes, in characters. */
export const NOTIFICATION_EXCERPT_LENGTH = 140;

export const notificationSchema = z.object({
  id: z.uuid(),
  type: notificationTypeSchema,
  read: z.boolean(),
  createdAt: z.iso.datetime(),
  /** Who commented, as everyone sees them. */
  actor: feedbackAuthorSchema,
  track: z.object({ id: z.uuid(), title: z.string() }),
  versionNumber: z.number().int().positive(),
  /** The comment (or reply) it's about, to open the track at. */
  feedbackId: z.uuid(),
  /** The start of the comment, cut at `NOTIFICATION_EXCERPT_LENGTH` with an ellipsis. */
  excerpt: z.string(),
});
export type NotificationResponse = z.infer<typeof notificationSchema>;

/** `GET /v1/notifications`: newest first, a page at a time. */
export const notificationListQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NotificationListQuery = z.input<typeof notificationListQuerySchema>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  nextCursor: z.uuid().nullable(),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

/** `GET /v1/notifications/unread-count`: for the header. */
export const unreadCountResponseSchema = z.object({ count: z.number().int().nonnegative() });
export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;

/** `POST /v1/notifications/read`: marks these of your notifications read. */
export const markNotificationsReadRequestSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(100),
});
export type MarkNotificationsReadRequest = z.infer<typeof markNotificationsReadRequestSchema>;
