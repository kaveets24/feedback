import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { Db } from '@feedback/db';
import { errorResponseSchema, meResponseSchema } from '@feedback/shared';
import { httpError } from '../../errors.ts';
import { getMe } from './service.ts';

export function meRoutes(db: Db): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/me',
      {
        schema: { response: { 200: meResponseSchema, 401: errorResponseSchema } },
        // Pending and rejected users need this to learn their status.
        config: { allowUnapproved: true },
      },
      async (request) => {
        const { actor } = request;
        if (actor.kind === 'anonymous') throw httpError(401, 'UNAUTHENTICATED', 'Sign in required');
        return getMe(db, actor.user);
      },
    );
  };
}
