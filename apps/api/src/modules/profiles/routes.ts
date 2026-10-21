import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  errorResponseSchema,
  profileParamsSchema,
  projectListQuerySchema,
  projectListResponseSchema,
  publicProfileResponseSchema,
  trackListQuerySchema,
  trackListResponseSchema,
} from '@feedback/shared';
import type { CoverDeps } from '../covers/images.ts';
import { getPublicProfile, listProfileProjects, listProfileTracks } from './service.ts';

// Public pages: open to anyone, signed in or not. What they list is decided in the service.
export function profileRoutes(deps: CoverDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/profiles/:handle',
      {
        schema: {
          params: profileParamsSchema,
          response: { 200: publicProfileResponseSchema, 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const profile = await getPublicProfile(deps, request.params.handle);
        // The picture is a signed URL: no cache should keep it.
        void reply.header('cache-control', 'no-store');
        return profile;
      },
    );

    app.get(
      '/profiles/:handle/tracks',
      {
        schema: {
          params: profileParamsSchema,
          querystring: trackListQuerySchema,
          response: { 200: trackListResponseSchema, 404: errorResponseSchema },
        },
      },
      (request) => listProfileTracks(deps, request.params.handle, request.query),
    );

    app.get(
      '/profiles/:handle/projects',
      {
        schema: {
          params: profileParamsSchema,
          querystring: projectListQuerySchema,
          response: { 200: projectListResponseSchema, 404: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const list = await listProfileProjects(deps, request.params.handle, request.query);
        void reply.header('cache-control', 'no-store');
        return list;
      },
    );
  };
}
