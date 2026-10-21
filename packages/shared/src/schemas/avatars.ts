import { z } from 'zod';
import { COVER_CONTENT_TYPES, MAX_COVER_BYTES } from './covers.ts';
import { versionStatusSchema } from './tracks.ts';
import { presignedUploadSchema } from './uploads.ts';

// Profile pictures take the same images as cover art and go through the same processing.

/** The worker crops every picture to a square at most this many pixels a side, as a JPEG. */
export const AVATAR_MAX_SIZE = 512;

/** `POST /v1/me/avatars`: starts uploading a new profile picture. */
export const createAvatarRequestSchema = z.object({
  contentType: z.enum(COVER_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_COVER_BYTES),
});
export type CreateAvatarRequest = z.infer<typeof createAvatarRequestSchema>;

export const createAvatarResponseSchema = z.object({
  avatarId: z.uuid(),
  upload: presignedUploadSchema,
});
export type CreateAvatarResponse = z.infer<typeof createAvatarResponseSchema>;

/** A picture upload's state, polled while it processes; a failed one says why. */
export const avatarResponseSchema = z.object({
  id: z.uuid(),
  status: versionStatusSchema,
  failureReason: z.string().nullable(),
});
export type AvatarResponse = z.infer<typeof avatarResponseSchema>;

export const avatarParamsSchema = z.object({ avatarId: z.uuid() });
