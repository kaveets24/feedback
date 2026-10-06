import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '@demo/db';
import { errorResponseSchema, meResponseSchema } from '@demo/shared';
import { httpError } from '../../errors.ts';
import { getMe } from './service.ts';

export function meRoutes(db: Db): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/me',
      { schema: { response: { 200: meResponseSchema, 401: errorResponseSchema } } },
      async (request) => {
        const { actor } = request;
        if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
        return getMe(db, actor.user);
      },
    );
  };
}
