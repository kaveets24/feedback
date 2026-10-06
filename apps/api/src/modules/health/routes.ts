import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { healthResponseSchema } from '@feedback/shared';

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    { schema: { response: { 200: healthResponseSchema } }, config: { allowUnapproved: true } },
    async () => ({ status: 'ok' as const }),
  );
};
