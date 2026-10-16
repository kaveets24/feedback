import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '@feedback/db';
import {
  errorResponseSchema,
  streamResponseSchema,
  versionParamsSchema,
  versionResponseSchema,
} from '@feedback/shared';
import type { Storage } from '@feedback/storage';
import { getStream, getVersion } from './service.ts';

export function versionRoutes(deps: { db: Db; storage: Storage }): FastifyPluginAsyncZod {
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
      (request) => getVersion(deps.db, request.actor, request.params.versionId),
    );

    app.get(
      '/versions/:versionId/stream',
      {
        schema: {
          params: versionParamsSchema,
          response: {
            200: streamResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const stream = await getStream(deps, request.actor, request.params.versionId);
        // The URL is a credential: no cache (browser, proxy, or CDN) should keep it.
        void reply.header('cache-control', 'no-store');
        return stream;
      },
    );
  };
}
