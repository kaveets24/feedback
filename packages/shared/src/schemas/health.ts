import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * `GET /v1/health/queue`: Redis answers and at least one worker is consuming jobs. Fails with
 * 503 (`QUEUE_UNAVAILABLE`, details `{ redis, workers }`) otherwise.
 */
export const queueHealthResponseSchema = z.object({
  status: z.literal('ok'),
  workers: z.number().int().positive(),
});
export type QueueHealthResponse = z.infer<typeof queueHealthResponseSchema>;
