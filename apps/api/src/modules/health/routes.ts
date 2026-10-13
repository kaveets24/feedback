import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@feedback/shared';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      schema: { response: { 200: healthResponseSchema } },
      config: { allowUnapproved: true },
      // Fly and the uptime monitor call this every few seconds; only log it when something's wrong.
      logLevel: 'warn',
    },
    async () => ({ status: 'ok' as const }),
  );
};
