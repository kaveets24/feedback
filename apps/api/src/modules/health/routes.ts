import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  errorResponseSchema,
  healthResponseSchema,
  queueHealthResponseSchema,
} from '@feedback/shared';
import type { JobQueue } from '../../queue.ts';

export const healthRoutes =
  (queue: JobQueue): FastifyPluginAsyncZod =>
  async (app) => {
    // Liveness, for Fly's machine checks and deploy smoke tests: the API process is serving.
    // It doesn't check Redis, so a queue outage never takes the API's other routes down with it.
    app.get(
      '/health',
      {
        schema: { response: { 200: healthResponseSchema } },
        config: { allowUnapproved: true },
        // Fly and the uptime monitor call these every few seconds; only log when something's wrong.
        logLevel: 'warn',
      },
      async () => ({ status: 'ok' as const }),
    );

    // For the uptime monitor (docs/staging.md): uploads can reach `ready`. It also fails when the
    // API is down, so it covers liveness too. The database isn't checked: probing it every minute
    // would keep Neon's compute from ever scaling to zero.
    app.get(
      '/health/queue',
      {
        schema: { response: { 200: queueHealthResponseSchema, 503: errorResponseSchema } },
        config: { allowUnapproved: true },
        logLevel: 'warn',
      },
      async (request, reply) => {
        const { redis, workers } = await queue.health();
        if (redis && workers > 0) return { status: 'ok' as const, workers };

        // Sent directly rather than thrown: the error handler would report every failed probe
        // to Sentry, and the uptime monitor already alerts.
        const message = redis
          ? 'No worker is consuming the job queue'
          : 'The job queue (Redis) is unreachable';
        request.log.warn({ redis, workers }, message);
        return reply
          .status(503)
          .send({ error: { code: 'QUEUE_UNAVAILABLE', message, details: { redis, workers } } });
      },
    );
  };
