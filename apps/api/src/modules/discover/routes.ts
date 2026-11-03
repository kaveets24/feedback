import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { discoverQuerySchema, discoverResponseSchema, errorResponseSchema } from '@feedback/shared';
import type { FollowDeps } from '../follows/service.ts';
import { discover } from './service.ts';

// Open to anyone, signed in or not; everyone gets the same list, except the `following` view,
// which needs a signed-in account.
export function discoverRoutes(deps: FollowDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/discover',
      {
        schema: {
          querystring: discoverQuerySchema,
          response: { 200: discoverResponseSchema, 401: errorResponseSchema },
        },
      },
      async (request, reply) => {
        const page = await discover(deps, request.actor, request.query);
        // Artists' pictures are signed URLs: no cache should keep them.
        void reply.header('cache-control', 'no-store');
        return page;
      },
    );
  };
}
