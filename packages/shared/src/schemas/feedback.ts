import { z } from 'zod';
import { coverImageSchema } from './covers.ts';

// Feedback (comments) on a track's versions.

/** A top-level comment is open until the artist resolves it. Replies stay `open`. */
export const FEEDBACK_STATUSES = ['open', 'resolved'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

/** Longest comment body, in characters. */
export const MAX_FEEDBACK_LENGTH = 2000;

export const feedbackStatusSchema = z.enum(FEEDBACK_STATUSES);

/** A comment's text: trimmed, not blank. */
const feedbackBodySchema = z.string().trim().min(1).max(MAX_FEEDBACK_LENGTH);

/** `POST /v1/versions/:versionId/feedback`: a comment at a moment, or about the whole version. */
export const createFeedbackRequestSchema = z.object({
  body: feedbackBodySchema,
  /** Milliseconds into the version; null or left out for a general comment. */
  timestampMs: z.number().int().nonnegative().nullable().optional(),
});
export type CreateFeedbackRequest = z.infer<typeof createFeedbackRequestSchema>;

/** `POST /v1/feedback/:feedbackId/replies`: answers a top-level comment. */
export const createReplyRequestSchema = z.object({ body: feedbackBodySchema });
export type CreateReplyRequest = z.infer<typeof createReplyRequestSchema>;

/**
 * `PATCH /v1/feedback/:feedbackId`: the author rewrites the body; the artist resolves or reopens
 * a top-level comment. Each field needs its own permission.
 */
export const updateFeedbackRequestSchema = z
  .object({ body: feedbackBodySchema.optional(), status: feedbackStatusSchema.optional() })
  .refine((input) => input.body !== undefined || input.status !== undefined, {
    message: 'Nothing to change',
  });
export type UpdateFeedbackRequest = z.infer<typeof updateFeedbackRequestSchema>;

/** Who wrote a comment, as everyone sees them: their display name and picture, never their id. */
export const feedbackAuthorSchema = z.object({
  displayName: z.string().nullable(),
  /** Their public page's handle, if they have one. Defaults to null for older API responses. */
  handle: z.string().nullable().default(null),
  /** A short-lived signed URL; never log it. */
  avatar: coverImageSchema.nullable(),
});
export type FeedbackAuthor = z.infer<typeof feedbackAuthorSchema>;

/** What the asker may do with a comment, decided by the API so the UI never decides itself. */
export const feedbackPermissionsSchema = z.object({
  reply: z.boolean(),
  edit: z.boolean(),
  delete: z.boolean(),
  resolve: z.boolean(),
});
export type FeedbackPermissions = z.infer<typeof feedbackPermissionsSchema>;

/**
 * A reply. A deleted comment keeps its place only while it has replies, with no body or author.
 */
export const feedbackReplySchema = z.object({
  id: z.uuid(),
  body: z.string().nullable(),
  deleted: z.boolean(),
  author: feedbackAuthorSchema.nullable(),
  createdAt: z.iso.datetime(),
  can: feedbackPermissionsSchema,
});
export type FeedbackReply = z.infer<typeof feedbackReplySchema>;

/** A top-level comment with its replies, oldest first. */
export const feedbackThreadSchema = feedbackReplySchema.extend({
  /** Where in the version it's pinned, or null for a general comment. */
  timestampMs: z.number().int().nullable(),
  status: feedbackStatusSchema,
  resolvedAt: z.iso.datetime().nullable(),
  replies: z.array(feedbackReplySchema),
});
export type FeedbackThread = z.infer<typeof feedbackThreadSchema>;

/**
 * `GET /v1/versions/:versionId/feedback`: every comment on a version, pinned ones in timeline
 * order, then general ones, oldest first. Not paginated: a version's comments are read together.
 */
export const feedbackListResponseSchema = z.object({ threads: z.array(feedbackThreadSchema) });
export type FeedbackListResponse = z.infer<typeof feedbackListResponseSchema>;

export const feedbackParamsSchema = z.object({ feedbackId: z.uuid() });
