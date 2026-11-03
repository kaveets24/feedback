import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { discoverQuerySchema, discoverResponseSchema } from '@feedback/shared';
import type { FollowDeps } from '../follows/service.ts';
import { discover } from './service.ts';

// Open to anyone, signed in or not; everyone gets the same list.
export function discoverRoutes(deps: FollowDeps): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/discover',
      { schema: { querystring: discoverQuerySchema, response: { 200: discoverResponseSchema } } },
      async (request, reply) => {
        const page = await discover(deps, request.query);
        // Artists' pictures are signed URLs: no cache should keep them.
        void reply.header('cache-control', 'no-store');
        return page;
      },
    );
  };
}
