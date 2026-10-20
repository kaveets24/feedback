import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  addProjectTrackRequestSchema,
  createProjectRequestSchema,
  errorResponseSchema,
  projectDetailResponseSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  projectParamsSchema,
  projectResponseSchema,
  projectTrackParamsSchema,
  projectTracksResponseSchema,
  reorderProjectTracksRequestSchema,
  updateProjectRequestSchema,
} from '@feedback/shared';
import { httpError } from '../../errors.ts';
import type { CoverDeps } from '../covers/images.ts';
import {
  addProjectTrack,
  createProject,
  deleteProject,
  getProject,
  getProjectTracks,
  listMyProjects,
  removeProjectTrack,
  reorderProjectTracks,
  updateProject,
} from './service.ts';

export function projectRoutes(deps: CoverDeps): FastifyPluginAsyncZod {
  const { db } = deps;
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
      (request) => listMyProjects(deps, request.actor, request.query),
    );

    app.get(
      '/projects/:projectId',
      {
        schema: {
          params: projectParamsSchema,
          response: { 200: projectDetailResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) => getProject(deps, request.actor, request.params.projectId),
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
      (request) => updateProject(deps, request.actor, request.params.projectId, request.body),
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

    app.get(
      '/projects/:projectId/tracks',
      {
        schema: {
          params: projectParamsSchema,
          response: { 200: projectTracksResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) => getProjectTracks(db, request.actor, request.params.projectId),
    );

    app.post(
      '/projects/:projectId/tracks',
      {
        schema: {
          params: projectParamsSchema,
          body: addProjectTrackRequestSchema,
          response: { 200: projectTracksResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) =>
        addProjectTrack(db, request.actor, request.params.projectId, request.body.trackId),
    );

    app.put(
      '/projects/:projectId/tracks',
      {
        schema: {
          params: projectParamsSchema,
          body: reorderProjectTracksRequestSchema,
          response: {
            200: projectTracksResponseSchema,
            404: errorResponseSchema,
            409: errorResponseSchema,
          },
        },
      },
      (request) =>
        reorderProjectTracks(db, request.actor, request.params.projectId, request.body.trackIds),
    );

    app.delete(
      '/projects/:projectId/tracks/:trackId',
      {
        schema: {
          params: projectTrackParamsSchema,
          response: { 204: z.null().describe('Removed'), 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const { projectId, trackId } = request.params;
        await removeProjectTrack(db, request.actor, projectId, trackId);
        return reply.status(204).send(null);
      },
    );
  };
}
