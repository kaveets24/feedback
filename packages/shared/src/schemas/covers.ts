import { z } from 'zod';
import { versionStatusSchema } from './tracks.ts';
import { presignedUploadSchema } from './uploads.ts';

/** Image types a project's cover art can be uploaded as. The API also checks the file's bytes. */
export const COVER_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type CoverContentType = (typeof COVER_CONTENT_TYPES)[number];

/** Largest cover image we accept. Phones' HEIC photos arrive as JPEG through a file input. */
export const MAX_COVER_BYTES = 10 * 1024 * 1024;

/** The worker crops every cover to a square at most this many pixels a side, as a JPEG. */
export const COVER_MAX_SIZE = 1024;

/** `POST /v1/projects/:projectId/covers`: starts uploading new cover art. */
export const createCoverRequestSchema = z.object({
  contentType: z.enum(COVER_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_COVER_BYTES),
});
export type CreateCoverRequest = z.infer<typeof createCoverRequestSchema>;

export const createCoverResponseSchema = z.object({
  coverId: z.uuid(),
  upload: presignedUploadSchema,
});
export type CreateCoverResponse = z.infer<typeof createCoverResponseSchema>;

/**
 * A cover upload's state, polled while it processes. It goes through the same statuses as a
 * track version; a failed one says why in words for the artist.
 */
export const coverResponseSchema = z.object({
  id: z.uuid(),
  status: versionStatusSchema,
  failureReason: z.string().nullable(),
});
export type CoverResponse = z.infer<typeof coverResponseSchema>;

export const coverParamsSchema = z.object({ projectId: z.uuid(), coverId: z.uuid() });

/** Where the browser loads a cover or profile picture: a short-lived signed URL, so never log it. */
export const coverImageSchema = z.object({ url: z.url(), expiresAt: z.iso.datetime() });
export type CoverImage = z.infer<typeof coverImageSchema>;
