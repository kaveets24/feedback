import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '@feedback/db';
import { errorResponseSchema, versionParamsSchema, versionResponseSchema } from '@feedback/shared';
import { getVersion } from './service.ts';

export function versionRoutes(db: Db): FastifyPluginAsyncZod {
  return async (app) => {
    // Polled by the artist's browser until an upload is `ready` or `failed`.
    app.get(
      '/versions/:versionId',
      {
        schema: {
          params: versionParamsSchema,
          response: { 200: versionResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) => getVersion(db, request.actor, request.params.versionId),
    );
  };
}
