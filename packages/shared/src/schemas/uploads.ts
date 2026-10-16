import { z } from 'zod';

/** Largest original we accept (CLAUDE.md section 7). Signed into the upload URL. */
export const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;

/** Longest audio we accept (CLAUDE.md section 7). The worker fails longer versions. */
export const MAX_DURATION_MS = 20 * 60 * 1000;

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

export type AudioContentType = (typeof AUDIO_CONTENT_TYPES)[number];

/** What to send for each accepted extension when the browser doesn't report a usable type. */
const CONTENT_TYPE_BY_EXTENSION: Record<string, AudioContentType> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
};

/** File extensions the upload form accepts, e.g. for an `accept` attribute. */
export const AUDIO_EXTENSIONS = Object.keys(CONTENT_TYPE_BY_EXTENSION).map((ext) => `.${ext}`);

/**
 * The content type to upload a file as, or null if it isn't a format we accept. Browsers often
 * report an empty or nonstandard type for flac, m4a, and aac files, so the extension is the
 * fallback. Either way the API checks the file's bytes once it's uploaded.
 */
export function audioContentTypeFor(file: { name: string; type: string }): AudioContentType | null {
  const reported = AUDIO_CONTENT_TYPES.find((type) => type === file.type.toLowerCase());
  if (reported) return reported;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase();
  return (extension && CONTENT_TYPE_BY_EXTENSION[extension]) || null;
}

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
