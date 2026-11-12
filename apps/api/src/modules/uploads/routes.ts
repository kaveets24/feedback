import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createUploadRequestSchema,
  createUploadResponseSchema,
  createVersionRequestSchema,
  errorResponseSchema,
  trackParamsSchema,
  versionParamsSchema,
  versionResponseSchema,
} from '@feedback/shared';
import { completeUpload, startUpload, startVersionUpload, type UploadDeps } from './service.ts';

// The upload flow (CLAUDE.md section 7): POST /uploads, then the browser PUTs the file straight
// to storage, then POST /uploads/:versionId/complete hands it to the worker.
export function uploadRoutes(deps: UploadDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.post(
      '/uploads',
      {
        config: { limit: 'upload' },
        schema: {
          body: createUploadRequestSchema,
          response: {
            201: createUploadResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) =>
        reply.status(201).send(await startUpload(deps, request.actor, request.body)),
    );

    // A new version of an existing track: the same flow, finished by the same `complete` call.
    app.post(
      '/tracks/:trackId/versions',
      {
        config: { limit: 'upload' },
        schema: {
          params: trackParamsSchema,
          body: createVersionRequestSchema,
          response: { 201: createUploadResponseSchema, 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const upload = await startVersionUpload(
          deps,
          request.actor,
          request.params.trackId,
          request.body,
        );
        return reply.status(201).send(upload);
      },
    );

    app.post(
      '/uploads/:versionId/complete',
      {
        schema: {
          params: versionParamsSchema,
          response: {
            200: versionResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      (request) => completeUpload(deps, request.actor, request.params.versionId),
    );
  };
}
