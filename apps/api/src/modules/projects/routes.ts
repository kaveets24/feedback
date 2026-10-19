import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Db } from '@feedback/db';
import {
  createProjectRequestSchema,
  errorResponseSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectParamsSchema,
  projectResponseSchema,
  updateProjectRequestSchema,
} from '@feedback/shared';
import { httpError } from '../../errors.ts';
import {
  createProject,
  deleteProject,
  getProject,
  listMyProjects,
  updateProject,
} from './service.ts';

export function projectRoutes(db: Db): FastifyPluginAsyncZod {
  return async (app) => {
    // No canAccess here: there's no resource yet, and a signed-in, approved user (the gate
    // checks approval) may always create their own private project.
    app.post(
      '/projects',
      {
        schema: {
          body: createProjectRequestSchema,
          response: { 201: projectResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { actor } = request;
        if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
        return reply.status(201).send(await createProject(db, actor.user, request.body));
      },
    );

    app.get(
      '/projects',
      {
        schema: {
          querystring: projectListQuerySchema,
          response: { 200: projectListResponseSchema, 401: errorResponseSchema },
        },
      },
      (request) => listMyProjects(db, request.actor, request.query),
    );

    app.get(
      '/projects/:projectId',
      {
        schema: {
          params: projectParamsSchema,
          response: { 200: projectResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) => getProject(db, request.actor, request.params.projectId),
    );

    app.patch(
      '/projects/:projectId',
      {
        schema: {
          params: projectParamsSchema,
          body: updateProjectRequestSchema,
          response: { 200: projectResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) => updateProject(db, request.actor, request.params.projectId, request.body),
    );

    app.delete(
      '/projects/:projectId',
      {
        schema: {
          params: projectParamsSchema,
          response: { 204: z.null().describe('Deleted'), 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        await deleteProject(db, request.actor, request.params.projectId);
        return reply.status(204).send(null);
      },
    );
  };
}
