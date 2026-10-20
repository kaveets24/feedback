import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  coverParamsSchema,
  coverResponseSchema,
  createCoverRequestSchema,
  createCoverResponseSchema,
  errorResponseSchema,
  projectParamsSchema,
} from '@feedback/shared';
import {
  completeCoverUpload,
  getCover,
  removeCover,
  startCoverUpload,
  type CoverUploadDeps,
} from './service.ts';

// Cover art follows the audio upload flow: POST .../covers for a presigned PUT, the browser PUTs
// the image straight to storage, then POST .../covers/:coverId/complete hands it to the worker,
// which re-encodes it. Every route needs the project's owner; anyone else gets a 404.
export function coverRoutes(deps: CoverUploadDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      '/projects/:projectId/covers',
      {
        schema: {
          params: projectParamsSchema,
          body: createCoverRequestSchema,
          response: { 201: createCoverResponseSchema, 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const upload = await startCoverUpload(
          deps,
          request.actor,
          request.params.projectId,
          request.body,
        );
        return reply.status(201).send(upload);
      },
    );

    app.post(
      '/projects/:projectId/covers/:coverId/complete',
      {
        schema: {
          params: coverParamsSchema,
          response: {
            200: coverResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      (request) =>
        completeCoverUpload(deps, request.actor, request.params.projectId, request.params.coverId),
    );

    app.get(
      '/projects/:projectId/covers/:coverId',
      {
        schema: {
          params: coverParamsSchema,
          response: { 200: coverResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) =>
        getCover(deps.db, request.actor, request.params.projectId, request.params.coverId),
    );

    app.delete(
      '/projects/:projectId/cover',
      {
        schema: {
          params: projectParamsSchema,
          response: { 204: z.null().describe('Removed'), 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        await removeCover(deps.db, request.actor, request.params.projectId);
        return reply.status(204).send(null);
      },
    );
  };
}
