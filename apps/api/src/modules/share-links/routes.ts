import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ResourceKind } from '@feedback/authz';
import type { Db } from '@feedback/db';
import {
  createShareLinkRequestSchema,
  createShareLinkResponseSchema,
  errorResponseSchema,
  projectParamsSchema,
  shareLinkListResponseSchema,
  shareLinkParamsSchema,
  trackParamsSchema,
} from '@feedback/shared';
import { createShareLink, listResourceShareLinks, revokeShareLink } from './service.ts';

export function shareLinkRoutes(db: Db): FastifyPluginAsyncZod {
  return async (app) => {
    // The same create and list routes under tracks and projects.
    const resources = [
      { kind: 'track', path: '/tracks/:trackId', params: trackParamsSchema },
      { kind: 'project', path: '/projects/:projectId', params: projectParamsSchema },
    ] as const;
    const idOf = (kind: ResourceKind, params: { trackId?: string; projectId?: string }) =>
      (kind === 'track' ? params.trackId : params.projectId)!;

    for (const { kind, path, params } of resources) {
      app.post(
        `${path}/share-links`,
        {
          schema: {
            params,
            body: createShareLinkRequestSchema,
            response: {
              201: createShareLinkResponseSchema,
              400: errorResponseSchema,
              404: errorResponseSchema,
            },
          },
        },
        async (request, reply) => {
          const created = await createShareLink(
            db,
            request.actor,
            kind,
            idOf(kind, request.params),
            request.body,
          );
          // The token is a credential: no cache should keep this response.
          return reply.status(201).header('cache-control', 'no-store').send(created);
        },
      );

      app.get(
        `${path}/share-links`,
        {
          schema: {
            params,
            response: { 200: shareLinkListResponseSchema, 404: errorResponseSchema },
          },
        },
        (request) => listResourceShareLinks(db, request.actor, kind, idOf(kind, request.params)),
      );
    }

    app.delete(
      '/share-links/:linkId',
      {
        schema: {
          params: shareLinkParamsSchema,
          response: { 204: z.null().describe('Revoked'), 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        await revokeShareLink(db, request.actor, request.params.linkId);
        return reply.status(204).send(null);
      },
    );
  };
}
