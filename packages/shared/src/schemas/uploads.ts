import { z } from 'zod';
import { versionStatusSchema } from './tracks.ts';

/** Largest original we accept (CLAUDE.md section 7). Signed into the upload URL. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/**
 * Content types accepted for originals: mp3, wav, m4a, aac, flac, ogg (CLAUDE.md section 7),
 * under the names browsers report for them. The API also checks the file's first bytes once
 * it's uploaded, so a renamed file that isn't audio is rejected anyway.
 */
export const AUDIO_CONTENT_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/x-aac',
  'audio/aacp',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
] as const;

export const createUploadRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  /** The file's name on the artist's device, kept for their reference. */
  filename: z.string().trim().min(1).max(255),
  contentType: z.enum(AUDIO_CONTENT_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});
export type CreateUploadRequest = z.infer<typeof createUploadRequestSchema>;

export const createUploadResponseSchema = z.object({
  trackId: z.uuid(),
  versionId: z.uuid(),
  upload: z.object({
    /** Presigned URL: a bearer credential, so never log it. */
    url: z.url(),
    method: z.literal('PUT'),
    /** Headers the PUT must send exactly; they're signed into the URL. */
    headers: z.object({ 'content-type': z.string() }),
    expiresAt: z.iso.datetime(),
  }),
});
export type CreateUploadResponse = z.infer<typeof createUploadResponseSchema>;

/** A version's processing state, for the artist to watch. */
export const versionResponseSchema = z.object({
  id: z.uuid(),
  trackId: z.uuid(),
  versionNumber: z.number().int().positive(),
  status: versionStatusSchema,
  /** Why the version failed, in words for the artist. Null unless `failed`. */
  failureReason: z.string().nullable(),
  durationMs: z.number().int().nullable(),
});
export type VersionResponse = z.infer<typeof versionResponseSchema>;

export const versionParamsSchema = z.object({ versionId: z.uuid() });
