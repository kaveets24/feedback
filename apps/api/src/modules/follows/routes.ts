import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  errorResponseSchema,
  feedResponseSchema,
  followingResponseSchema,
  followListQuerySchema,
  profileParamsSchema,
} from '@feedback/shared';
import type { Actor } from '../../auth/plugin.ts';
import { httpError } from '../../errors.ts';
import {
  followProfile,
  getFeed,
  getFollowing,
  unfollowProfile,
  type FollowDeps,
} from './service.ts';

/** The signed-in user, or a 401: following is always as yourself. */
function signedIn(actor: Actor) {
  if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
  return actor.user;
}

export function followRoutes(deps: FollowDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.put(
      '/profiles/:handle/follow',
      {
        schema: {
          params: profileParamsSchema,
          response: {
            204: z.null().describe('Following'),
            400: errorResponseSchema,
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await followProfile(deps.db, signedIn(request.actor), request.params.handle);
        return reply.status(204).send(null);
      },
    );

    app.delete(
      '/profiles/:handle/follow',
      {
        schema: {
          params: profileParamsSchema,
          response: {
            204: z.null().describe('Not following'),
            401: errorResponseSchema,
            404: errorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        await unfollowProfile(deps.db, signedIn(request.actor), request.params.handle);
        return reply.status(204).send(null);
      },
    );

    app.get(
      '/me/following',
      {
        schema: {
          querystring: followListQuerySchema,
          response: { 200: followingResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const list = await getFollowing(deps, signedIn(request.actor), request.query);
        // Pictures are signed URLs: no cache should keep them.
        void reply.header('cache-control', 'no-store');
        return list;
      },
    );

    app.get(
      '/feed',
      {
        schema: {
          querystring: followListQuerySchema,
          response: { 200: feedResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const feed = await getFeed(deps, signedIn(request.actor), request.query);
        void reply.header('cache-control', 'no-store');
        return feed;
      },
    );
  };
}
