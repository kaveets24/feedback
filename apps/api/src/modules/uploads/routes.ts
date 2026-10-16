import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  createUploadRequestSchema,
  createUploadResponseSchema,
  errorResponseSchema,
  versionParamsSchema,
  versionResponseSchema,
} from '@feedback/shared';
import { httpError } from '../../errors.ts';
import { completeUpload, startUpload, type UploadDeps } from './service.ts';

// The upload flow (CLAUDE.md section 7): POST /uploads, then the browser PUTs the file straight
// to storage, then POST /uploads/:versionId/complete hands it to the worker.
export function uploadRoutes(deps: UploadDeps): FastifyPluginAsyncZod {
  return async (app) => {
    // No canAccess here: there's no resource yet, and a signed-in, approved user (the gate
    // checks approval) may always create their own private track.
    app.post(
      '/uploads',
      {
        schema: {
          body: createUploadRequestSchema,
          response: { 201: createUploadResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { actor } = request;
        if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
        return reply.status(201).send(await startUpload(deps, actor.user, request.body));
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
