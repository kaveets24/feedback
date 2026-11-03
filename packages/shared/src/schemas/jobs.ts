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

/**
 * How every processing job runs: three attempts with backoff, then kept for a while to look into
 * and dropped so Redis doesn't fill up (it never evicts). The API uses these when it queues a job
 * and the worker's cleanup when it queues one again, so a requeued job behaves the same.
 */
export const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 10_000 },
  removeOnComplete: { age: 24 * 60 * 60 },
  removeOnFail: { age: 7 * 24 * 60 * 60 },
};

/** Queue for the worker's scheduled housekeeping, such as cleaning up stuck uploads. */
export const MAINTENANCE_QUEUE = 'maintenance';
