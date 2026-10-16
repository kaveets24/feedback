import { z } from 'zod';

// Background jobs (BullMQ). The API enqueues them and the worker validates each payload with
// these schemas before acting on it, since job data crosses a trust boundary.

/** Queue for turning an uploaded original into a stream file, duration, and waveform peaks. */
export const TRANSCODE_QUEUE = 'transcode';

export const transcodeJobSchema = z.object({ versionId: z.uuid() });
export type TranscodeJob = z.infer<typeof transcodeJobSchema>;
