import { z } from 'zod';

// Background jobs (BullMQ). The API enqueues them and the worker validates each payload with
// these schemas before acting on it, since job data crosses a trust boundary.

/** Queue for turning an uploaded original into a stream file, duration, and waveform peaks. */
export const TRANSCODE_QUEUE = 'transcode';

export const transcodeJobSchema = z.object({ versionId: z.uuid() });
export type TranscodeJob = z.infer<typeof transcodeJobSchema>;

/** Queue for re-encoding an uploaded cover image into a clean square JPEG. */
export const COVER_QUEUE = 'cover';

export const coverJobSchema = z.object({ coverId: z.uuid() });
export type CoverJob = z.infer<typeof coverJobSchema>;

/** Queue for re-encoding an uploaded profile picture, the same way as a cover. */
export const AVATAR_QUEUE = 'avatar';

export const avatarJobSchema = z.object({ avatarId: z.uuid() });
export type AvatarJob = z.infer<typeof avatarJobSchema>;
